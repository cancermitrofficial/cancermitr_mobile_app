// src/agents/document.agent.js
import { searchQdrant } from '../services/qdrant.service.js';
import { getLLMAnswer } from '../services/llm.service.js';
import { getEmbedding } from '../services/embedding.service.js';

const MIN_SCORE = 0.30;
const MAX_RESULTS = 8;
const SNIPPET_LEN = 700;

// MAIN FUNCTION - FIXED: Recent messages first, summary as background
export async function handleDocumentQuery(query, conversationHistory = [], sessionId = null, summary = '') {
  try {
    // 1) Build contextual query with CORRECT priority: recent messages first, summary as background
    const contextualQuery = buildEnhancedContextualQuery(query, conversationHistory, summary);
    
    console.log(`Document Agent Context Analysis:`);
    console.log(`Original Query: "${query}"`);
    console.log(`Enhanced Query: "${contextualQuery}"`);
    console.log(`Recent Messages: ${conversationHistory.length}`);
    console.log(`Summary Present: ${!!summary} (${summary?.length || 0} chars)`);
    console.log(`Priority: Recent messages FIRST, summary as background`);

    // 2) Retrieve with enhanced context
    const vector = await getEmbedding(contextualQuery);
    const results = await searchQdrant('documents', vector);

    const normalized = (results || [])
      .map(r => ({
        id: r.id,
        score: r.score ?? 0,
        payload: normalizeDocPayload(r.payload || {})
      }))
      .filter(r => r.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);

    if (normalized.length === 0) {
      return {
        answer: buildContextualNoResultsResponse(query, conversationHistory, summary),
        source: 'documents',
        documents: [],
        retrievalScore: 0,
        confidence: 'low'
      };
    }

    // 3) Build document context
    const documentContext = normalized
      .map(r => formatDocBlock(r.payload))
      .join('\n\n');

    // 4) Build conversation context with CORRECT priority
    const conversationContext = buildSummaryAwareConversationContext(conversationHistory, summary);

    // 5) Enhanced LLM prompt with proper priority order
    const enhancedPrompt = buildSummaryIntegratedPrompt(query, summary, conversationContext, documentContext);

    const answer = await getLLMAnswer(documentContext, query, enhancedPrompt);

    return {
      answer,
      source: 'documents',
      documents: normalized.map(r => ({
        id: r.id,
        ...r.payload,
        relevanceScore: r.score
      })),
      retrievalScore: Math.max(...normalized.map(r => r.score)),
      confidence: calculateSummaryAwareConfidence(normalized, conversationHistory, summary),
      contextualResponse: conversationHistory.length > 0 || !!summary,
      documentsFound: normalized.length,
      summaryUtilized: !!summary,
      contextPriority: 'recent_first'
    };

  } catch (error) {
    console.error('Error in handleDocumentQuery:', error);
    return {
      answer: 'Sorry, I encountered an issue retrieving medical information. Please try again.',
      source: 'documents',
      documents: [],
      error: true
    };
  }
}

// FIXED: Recent messages first, summary as background context
function buildEnhancedContextualQuery(currentQuery, conversationHistory = [], summary = '') {
  const queryParts = [currentQuery];
  
  // 1) RECENT USER CONTEXT - Primary/Immediate context
  const recentUserQueries = conversationHistory
    .filter(m => m.messageType === 'USER')
    .slice(-3) // Get last 3 user messages for immediate context
    .map(m => m.content)
    .filter(Boolean);
  
  if (recentUserQueries.length > 0) {
    queryParts.push(...recentUserQueries);
    console.log(`Recent user context: ${recentUserQueries.length} messages`);
  }
  
  // 2) CROSS-AGENT CONTEXT - Secondary (recent agent responses for immediate context)
  const recentAgentHints = conversationHistory
    .filter(m => m.messageType === 'AGENT')
    .slice(-2)
    .map(m => {
      if (m.agentType === 'PRODUCT_AGENT') return extractSymptomTerms(m.content);
      return '';
    })
    .filter(Boolean);
  
  if (recentAgentHints.length > 0) {
    queryParts.push(...recentAgentHints);
    console.log(`Recent agent context terms: ${recentAgentHints.join(', ')}`);
  }
  
  // 3) SUMMARY TERMS - Background context (only if recent context is limited)
  if (summary && (recentUserQueries.length < 2 || recentAgentHints.length === 0)) {
    const summaryTerms = extractKeyTermsFromSummary(summary);
    if (summaryTerms.length > 0) {
      // Limit summary terms to avoid overwhelming recent context
      queryParts.push(...summaryTerms.slice(0, 5));
      console.log(`Summary background terms: ${summaryTerms.slice(0, 5).join(', ')}`);
    }
  }
  
  const finalQuery = queryParts.filter(Boolean).join(' ').trim();
  
  // Limit query length to prevent noise
  return finalQuery.length > 300 ? finalQuery.substring(0, 300) : finalQuery;
}

// Extract key medical/cancer terms from summary
function extractKeyTermsFromSummary(summary) {
  const terms = [];
  
  // Extract medical conditions
  const medicalTerms = summary.toLowerCase().match(
    /\b(cancer|tumor|tumour|oncology|chemotherapy|radiation|surgery|immunotherapy|targeted therapy|hormone therapy|metastasis|staging|grade|biopsy|pathology|diagnosis|prognosis|screening)\b/g
  );
  if (medicalTerms) terms.push(...new Set(medicalTerms));
  
  // Extract symptoms/side effects
  const symptomTerms = summary.toLowerCase().match(
    /\b(fatigue|nausea|pain|vomiting|weakness|appetite|sleep|anxiety|depression|mucositis|neuropathy|constipation|diarrhea|skin|rash|hair|mouth|ulcer|hydration|fever|infection|bleeding)\b/g
  );
  if (symptomTerms) terms.push(...new Set(symptomTerms));
  
  // Extract cancer types
  const cancerTypes = summary.toLowerCase().match(
    /\b(breast|lung|colon|prostate|liver|kidney|brain|ovarian|cervical|pancreatic|stomach|bladder|thyroid|lymphoma|leukemia|melanoma|sarcoma)\b/g
  );
  if (cancerTypes) terms.push(...new Set(cancerTypes));
  
  return [...new Set(terms)].slice(0, 8); // Limit to top 8 terms
}

// FIXED: Recent conversation first, summary as background
function buildSummaryAwareConversationContext(conversationHistory = [], summary = '') {
  if (!conversationHistory?.length && !summary) {
    return 'Start of conversation.';
  }
  
  let context = '';
  
  // 1) RECENT CONVERSATION - Primary context (immediate focus)
  if (conversationHistory?.length > 0) {
    const recentTurns = conversationHistory
      .slice(-5) // Get more recent messages for better immediate context
      .map(msg => {
        let role = msg.messageType === 'USER' ? 'User' : 'Assistant';
        if (msg.agentType === 'DOCUMENT_AGENT') role += ' (Medical Info)';
        if (msg.agentType === 'PRODUCT_AGENT') role += ' (Products)';
        const text = (msg.content || '').substring(0, 200); // Allow longer recent context
        return `${role}: ${text}${(msg.content || '').length > 200 ? '...' : ''}`;
      })
      .join('\n');
    
    context += `RECENT CONVERSATION:\n${recentTurns}`;
  }
  
  // 2) SUMMARY - Background context (broader understanding)
  if (summary) {
    const summaryPreview = summary.length > 250 ? summary.substring(0, 250) + '...' : summary;
    context += `\n\nBACKGROUND (Previous conversation summary):\n${summaryPreview}`;
  }
  
  return context;
}

// FIXED: Recent conversation prioritized, summary as supporting background
function buildSummaryIntegratedPrompt(query, summary, conversationContext, documentContext) {
  return `
You are CancerMitr's medical information specialist with conversation awareness.

${conversationContext}

CURRENT QUESTION: ${query}

RELEVANT MEDICAL KNOWLEDGE:
${documentContext}

Instructions:
- PRIORITIZE recent conversation context for immediate relevance and continuity
- Use the background summary to understand the user's broader cancer journey when helpful
- Reference recent exchanges naturally ("Following up on your question about...", "As mentioned earlier...")
${summary ? 
`- Connect to their overall situation from the background summary when it adds value
- Build on established context but focus on the immediate conversation flow` :
`- This appears to be early in our conversation, provide comprehensive information`}
- Provide accurate, evidence-based medical information in plain language
- Structure with clear headings and bullet points when appropriate
- For treatment/medication questions, always recommend consulting their healthcare team
- If information is uncertain or incomplete, state this clearly
- Be empathetic and supportive while remaining medically accurate

Provide a helpful response that flows naturally from the recent conversation while drawing on broader context as needed.
`.trim();
}

// Summary-aware confidence calculation
function calculateSummaryAwareConfidence(filteredResults = [], conversationHistory = [], summary = '') {
  const maxScore = Math.max(...filteredResults.map(r => r.score));
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
function buildContextualNoResultsResponse(query, conversationHistory = [], summary = '') {
  if (conversationHistory.length > 0) {
    return `Based on our recent conversation, I couldn't find specific medical information about "${query}" in my knowledge base. Could you rephrase your question or tell me what specific aspect you'd like me to explain?`;
  }
  
  if (summary) {
    return `Based on our conversation so far, I couldn't find specific medical information about "${query}" in my knowledge base. Could you rephrase your question or tell me what specific aspect you'd like me to explain? I can help connect this to what we've already discussed.`;
  }
  
  return `I couldn't find medical information about "${query}" in the knowledge base. Could you rephrase your question or ask about a related topic? I can help with cancer-related education and guidance.`;
}

// Helper functions
function extractSymptomTerms(content = '') {
  const m = content.toLowerCase().match(
    /\b(fatigue|nausea|pain|vomiting|weakness|appetite|sleep|anxiety|depression|mucositis|neuropathy|constipation|diarrhea|skin|rash|hair|mouth|ulcer|hydration|fever|infection|bleeding)\b/g
  );
  return m ? [...new Set(m)].join(' ') : '';
}

function normalizeDocPayload(p = {}) {
  return {
    id: p.id,
    title: p.title || 'Untitled',
    content: clipString(p.content || '', SNIPPET_LEN),
    url: p.url || null,
    source: p.source || null,
    tags: safeArray(p.tags)
  };
}

function safeArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  if (typeof val === 'object') return Object.values(val);
  return [];
}

function clipString(s, max) {
  const str = String(s);
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

function formatDocBlock(d) {
  const header = `Document: ${d.title}${d.source ? ` | Source: ${d.source}` : ''}${d.url ? ` | URL: ${d.url}` : ''}`;
  return `${header}\nContent: ${d.content}`;
}