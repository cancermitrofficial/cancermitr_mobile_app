// src/agents/product.agent.js - COMPLETE FIXED VERSION
import { searchQdrant } from "../services/qdrant.service.js";
import { getLLMAnswer } from "../services/llm.service.js";
import { getEmbedding } from "../services/embedding.service.js";

const MIN_SCORE = 0.3;
const MAX_RESULTS = 8;

// MAIN FUNCTION - FIXED: Recent messages first, summary as background
export async function handleProductQuery(
  query,
  conversationHistory = [],
  sessionId = null,
  summary = ""
) {
  try {
    // 1. BUILD CONTEXTUAL QUERY - CORRECT priority: recent messages first, summary as background
    const contextualQuery = buildSummaryEnhancedContextualQuery(
      query,
      conversationHistory,
      summary
    );
    
    console.log(`Product Agent Context Analysis:`);
    console.log(`   Original Query: "${query}"`);
    console.log(`   Enhanced Query: "${contextualQuery}"`);
    console.log(`   Recent Messages: ${conversationHistory.length}`);
    console.log(`   Summary Present: ${!!summary} (${summary?.length || 0} chars)`);
    console.log(`   Priority: Recent messages FIRST, summary as background`);

    // 2. RETRIEVE WITH ENHANCED CONTEXT
    const vector = await getEmbedding(contextualQuery);
    const results = await searchQdrant("products", vector);

    const normalized = (results || [])
      .map((r) => ({
        id: r.id,
        score: r.score ?? 0,
        payload: normalizeProductPayload(r.payload || {}),
      }))
      .filter((r) => r.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);

    if (normalized.length === 0) {
      return {
        answer: buildSummaryAwareNoResultsResponse(query, conversationHistory, summary),
        source: "products",
        documents: [],
        retrievalScore: 0,
        confidence: "low",
      };
    }

    // 3. BUILD PRODUCT CONTEXT
    const productContext = normalized
      .map((r) => formatProductBlock(r.payload))
      .join("\n\n");

    // 4. BUILD CONVERSATION CONTEXT WITH CORRECT PRIORITY
    const conversationContext = buildSummaryAwareConversationContext(
      conversationHistory,
      summary
    );

    // 5. GENERATE RESPONSE WITH PROPER PRIORITY ORDER
    const enhancedPrompt = buildSummaryIntegratedProductPrompt(
      query, 
      summary, 
      conversationContext, 
      productContext
    );

    const answer = await getLLMAnswer(productContext, query, enhancedPrompt);

    return {
      answer,
      source: "products",
      documents: normalized.map((r) => ({
        id: r.id,
        ...r.payload,
        relevanceScore: r.score,
      })),
      retrievalScore: Math.max(...normalized.map((r) => r.score)),
      confidence: calculateSummaryAwareConfidence(normalized, conversationHistory, summary),
      contextualResponse: conversationHistory.length > 0 || !!summary,
      productsFound: normalized.length,
      summaryUtilized: !!summary,
      contextPriority: 'recent_first'
    };
  } catch (error) {
    console.error("Error in handleProductQuery:", error);
    return {
      answer:
        "Sorry, I encountered an issue retrieving product information. Please try again.",
      source: "products",
      documents: [],
      error: true,
    };
  }
}

// FIXED: Recent messages first, summary as background context
function buildSummaryEnhancedContextualQuery(
  currentQuery,
  conversationHistory = [],
  summary = ""
) {
  const queryParts = [currentQuery];

  // 1) RECENT USER CONTEXT - Primary/Immediate context
  const recentUserQueries = conversationHistory
    .filter((m) => m.messageType === "USER")
    .slice(-3) // Get last 3 user messages for immediate context
    .map((m) => m.content)
    .filter(Boolean);

  if (recentUserQueries.length > 0) {
    queryParts.push(...recentUserQueries);
    console.log(`Recent user context: ${recentUserQueries.length} messages`);
  }

  // 2) RECENT AGENT CONTEXT - Secondary (immediate cross-agent context)
  const recentAgentHints = conversationHistory
    .filter((m) => m.messageType === "AGENT")
    .slice(-2)
    .map((m) => {
      if (m.agentType === "DOCUMENT_AGENT") return extractMedicalTermsForProducts(m.content);
      return '';
    })
    .filter(Boolean);

  if (recentAgentHints.length > 0) {
    queryParts.push(...recentAgentHints);
    console.log(`Recent agent context: ${recentAgentHints.join(', ')}`);
  }

  // 3) SUMMARY TERMS - Background context (only if recent context is limited)
  if (summary && (recentUserQueries.length < 2 || recentAgentHints.length === 0)) {
    const summaryTerms = extractProductRelevantTermsFromSummary(summary);
    if (summaryTerms.length > 0) {
      // Limit summary terms to avoid overwhelming recent context
      queryParts.push(...summaryTerms.slice(0, 5));
      console.log(`Summary background terms: ${summaryTerms.slice(0, 5).join(', ')}`);
    }
  }

  const finalQuery = queryParts.filter(Boolean).join(" ").trim();
  
  // Limit query length to prevent noise
  return finalQuery.length > 300 ? finalQuery.substring(0, 300) : finalQuery;
}

// Extract product-relevant terms from summary
function extractProductRelevantTermsFromSummary(summary) {
  const terms = [];
  
  // Extract symptoms that products can address
  const symptomTerms = summary.toLowerCase().match(
    /\b(fatigue|nausea|pain|vomiting|weakness|appetite|sleep|anxiety|depression|mucositis|neuropathy|constipation|diarrhea|skin|rash|hair|mouth|ulcer|hydration|fever|side effects?)\b/g
  );
  if (symptomTerms) terms.push(...new Set(symptomTerms));
  
  // Extract treatment contexts
  const treatmentTerms = summary.toLowerCase().match(
    /\b(chemotherapy|radiation|surgery|immunotherapy|targeted therapy|hormone therapy|treatment|therapy|supplement|medicine|medication|support)\b/g
  );
  if (treatmentTerms) terms.push(...new Set(treatmentTerms));
  
  // Extract cancer types for targeted products
  const cancerTypes = summary.toLowerCase().match(
    /\b(breast|lung|colon|prostate|liver|kidney|brain|ovarian|cervical|pancreatic|stomach|bladder|thyroid|lymphoma|leukemia|melanoma|sarcoma)\b/g
  );
  if (cancerTypes) terms.push(...new Set(cancerTypes));
  
  return [...new Set(terms)].slice(0, 8); // Limit to top 8 terms
}

// Extract medical terms from previous responses that relate to products
function extractMedicalTermsForProducts(content = "") {
  const m = content
    .toLowerCase()
    .match(
      /\b(cancer|tumou?r|chemotherapy|radiation|surgery|treatment|therapy|symptoms?|side effects?|fatigue|nausea|pain|vomiting|appetite|sleep|anxiety|depression|mucositis|neuropathy|constipation|diarrhea|skin|hair|mouth|ulcer|hydration|supplement|support|relief|manage|help)\b/g
    );
  return m ? [...new Set(m)].join(" ") : "";
}

// FIXED: Recent conversation first, summary as background
function buildSummaryAwareConversationContext(conversationHistory = [], summary = "") {
  if (!conversationHistory?.length && !summary) {
    return "Start of conversation.";
  }

  let context = "";

  // 1) RECENT CONVERSATION - Primary/immediate context
  if (conversationHistory?.length > 0) {
    const recentTurns = conversationHistory
      .slice(-5) // Get more recent messages for immediate context
      .map((msg) => {
        let role = msg.messageType === "USER" ? "User" : "Assistant";
        if (msg.agentType === "DOCUMENT_AGENT") role += " (Medical Info)";
        if (msg.agentType === "PRODUCT_AGENT") role += " (Products)";
        const text = (msg.content || "").substring(0, 200); // Allow longer recent context
        return `${role}: ${text}${(msg.content || "").length > 200 ? "..." : ""}`;
      })
      .join("\n");

    context += `RECENT CONVERSATION:\n${recentTurns}`;
  }

  // 2) SUMMARY - Background context for user's broader situation
  if (summary) {
    const productRelevantSummary = extractProductContextFromSummary(summary);
    context += `\n\nBACKGROUND (User's situation):\n${productRelevantSummary}`;
  }

  return context;
}

// Extract product-relevant context from summary
function extractProductContextFromSummary(summary) {
  if (!summary) return "";
  
  // Look for key product-relevant information
  const lines = summary.split(/[.!?]+/).filter(line => {
    const l = line.toLowerCase();
    return l.includes('symptom') || l.includes('pain') || l.includes('nausea') || 
           l.includes('fatigue') || l.includes('treatment') || l.includes('therapy') ||
           l.includes('side effect') || l.includes('cancer') || l.includes('help');
  });
  
  if (lines.length > 0) {
    return lines.slice(0, 3).join('. ').trim() + '.';
  }
  
  // Fallback to first part of summary
  return summary.length > 200 ? summary.substring(0, 200) + '...' : summary;
}

// FIXED: Recent conversation prioritized, summary as supporting context
function buildSummaryIntegratedProductPrompt(query, summary, conversationContext, productContext) {
  return `
You are CancerMitr's product specialist with awareness of the user's conversation and journey.

${conversationContext}

CURRENT QUESTION: ${query}

RELEVANT PRODUCTS:
${productContext}

Instructions:
- PRIORITIZE the recent conversation for immediate context and continuity
- Reference recent exchanges naturally ("Following your question about...", "Based on what you mentioned...")
${summary ? 
`- Use background information about their cancer journey to personalize recommendations
- Connect products to their known situation when relevant, but focus on recent discussion flow` :
`- This appears to be early in our conversation, ask clarifying questions about their specific needs`}
- Recommend specific products that match their symptoms/cancer type/treatment phase
- Explain how products address their particular concerns mentioned in recent conversation
- Include practical usage guidance and safety considerations
- Always remind users to consult their healthcare team before trying new products
- Be empathetic and supportive while remaining informative
- If multiple products are relevant, prioritize based on recent conversation context

Provide personalized recommendations that flow naturally from the recent conversation while considering their broader situation.
`.trim();
}

// Summary-aware confidence calculation
function calculateSummaryAwareConfidence(filteredResults = [], conversationHistory = [], summary = "") {
  const maxScore = Math.max(...filteredResults.map((r) => r.score));
  const hasConversationContext = conversationHistory?.length > 0;
  const hasSummaryContext = !!summary && summary.length > 50;
  
  // Recent conversation provides stronger immediate context than summary
  const contextStrength = hasConversationContext ? 'strong' : hasSummaryContext ? 'medium' : 'none';
  
  if (maxScore > 0.8) {
    return contextStrength === 'strong' ? 'very_high' : 'high';
  }
  if (maxScore > 0.6) {
    return contextStrength === 'strong' ? 'high' : contextStrength === 'medium' ? 'medium' : 'low';
  }
  if (maxScore > 0.3) {
    return contextStrength === 'strong' ? 'medium' : 'low';
  }
  return 'low';
}

// Summary-aware no results response
function buildSummaryAwareNoResultsResponse(query, conversationHistory = [], summary = "") {
  if (conversationHistory.length > 0) {
    return `Based on our recent conversation, I couldn't find specific products matching "${query}". Could you tell me more about the symptoms you're trying to address based on what we've been discussing?`;
  }
  
  if (summary) {
    return `Based on our conversation about your situation, I couldn't find specific products matching "${query}". Could you tell me more about the symptoms you're trying to address or the type of support you need? I can suggest products based on what we've discussed about your cancer journey.`;
  }
  
  return `I couldn't find products specifically matching "${query}". Tell me the symptoms or condition you're trying to address so I can suggest the most suitable products.`;
}

/* ---- formatting / normalization ---- */

function normalizeProductPayload(p = {}) {
  const symptoms = safeArray(p.symptoms);
  const cancerTypes = safeArray(p.cancerTypes);

  return {
    id: p.id,
    name: p.name || "Unnamed Product",
    description: p.description || "",
    symptoms,
    cancerTypes,
    category: p.category || null,
    stage: p.stage || null,
    price: normalizePrice(p.price),
    available: typeof p.available === "boolean" ? p.available : true,
  };
}

function safeArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (typeof val === "object") {
    return Object.values(val);
  }
  return [];
}

function normalizePrice(price) {
  if (price == null) return null;
  const n = Number(price);
  if (Number.isNaN(n)) return String(price);
  return n;
}

function formatProductBlock(p) {
  const sym = p.symptoms?.length ? p.symptoms.join(", ") : "—";
  const ct = p.cancerTypes?.length ? p.cancerTypes.join(", ") : "—";
  const priceStr =
    p.price == null ? "Contact for pricing" : `₹${formatINR(p.price)}`;
  const cat = p.category ? ` | Category: ${p.category}` : "";
  const stage = p.stage ? ` | Stage: ${p.stage}` : "";
  return [
    `Product: ${p.name}${cat}${stage}`,
    p.description ? `Description: ${p.description}` : null,
    `Symptoms: ${sym}`,
    `Cancer Types: ${ct}`,
    `Price: ${priceStr}`,
    `Available: ${p.available ? "Yes" : "No"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatINR(n) {
  try {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(n);
  }
}