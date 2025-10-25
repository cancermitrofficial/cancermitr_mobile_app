// src/agents/agent.router.js - Updated for unified file storage system
import { openai } from "../services/llm.service.js";
import { handleProductQuery } from "./product.agent.js";
import { handleDocumentQuery } from "./document.agent.js";
import { ReportAgent } from "./report.agent.js";
import { ChatHistoryService } from "../services/chat-history.service.js";
import { prisma } from "../services/db.service.js";

const ROUTER_MODEL = process.env.ROUTER_MODEL;

async function classifyQueryWithLLM(query, conversationHistory = [], hasFile = false, userHasReports = false) {
  const contextString = conversationHistory
    .filter((msg) => ["USER", "AGENT"].includes(msg.messageType))
    .slice(-6)
    .map(
      (msg) =>
        `${msg.messageType}${msg.agentType ? `(${msg.agentType})` : ""}: ${
          msg.content
        }`
    )
    .join("\n");

//   const systemPrompt = `
// You are CancerMitr's Agent Router. Your job is to classify user queries into exactly one of three categories: report, product, or document.

// CONVERSATION CONTEXT:
// ${contextString ? contextString + "\n" : "No prior conversation"}

// CURRENT QUERY TO CLASSIFY: ${query}
// FILE ATTACHED: ${hasFile ? "YES" : "NO"}
// USER HAS UPLOADED REPORTS: ${userHasReports ? "YES" : "NO"}

// CLASSIFICATION RULES:

// 1. REPORT
// - ALWAYS choose report if a file (PDF, image, DOC, scan, lab report, etc.) is attached.
// - Choose report if the query explicitly mentions analyzing, uploading, sharing, or processing medical reports, scans, prescriptions, or documents.
// - Choose report if user asks follow-up questions about their uploaded reports ("my blood test shows", "according to my scan", "what does my report mean").
// - Choose report if user asks for product recommendations based on their test results or deficiencies from reports.
// - Includes phrases like: "upload my report", "read this file", "analyse this scan", "my test results", "according to my lab work".

// 2. PRODUCT
// - Choose product if the query involves cancer products, medicines, supplements, or therapies (WITHOUT specific reference to reports).
// - Includes product recommendations, comparisons, or requests for something to help with symptoms.
// - Covers usage, dosage, or side effects of specific products (e.g., "What can I take for nausea?", "Side effects of Omega-3?").
// - Covers phrases like "What can help with…", "Suggest something for…", "I need medicine for…".
// - General symptom-based product requests without report context.

// 3. DOCUMENT
// - Choose document if the query is about education, knowledge, or information around cancer.
// - Covers cancer types, stages, symptoms, diagnosis, treatments, and procedures.
// - Covers definitions, medical terms, and explanations.
// - Covers general research, awareness, or educational content.
// - Includes personal/system questions ("who made you", "how do you work").
// - Default to document when a query is ambiguous and not clearly report or product.

// CONTEXT & PRIORITY RULES:
// - If FILE ATTACHED = YES → always route to report (ignore query content).
// - If user mentions "my report", "my test", "my results", "according to my blood work" → report.
// - If user has uploaded reports and asks about deficiencies, abnormal values, or report-based recommendations → report.
// - If previous conversation is about products and current query is a follow-up ("side effects?", "how to use?") → product.
// - If previous conversation is educational and current query is a follow-up ("tell me more", "explain further") → document.
// - When in doubt between product and document (no report context) → default to document.

// CRITICAL OUTPUT REQUIREMENTS:
// - Respond with ONLY one word: report OR product OR document
// - Use lowercase only
// - No quotes, no punctuation, no spaces
// - No explanations, no reasoning, no extra words

// Your response must be exactly one word from the list above.
// `.trim();
  const systemPrompt = `
You are CancerMitr's Agent Router. Your job is to classify user queries into exactly one of three categories: report, product, or document.

CONVERSATION CONTEXT:
${contextString ? contextString + "\n" : "No prior conversation"}
CURRENT QUERY TO CLASSIFY: ${query}
FILE ATTACHED: ${hasFile ? "YES" : "NO"}
USER HAS UPLOADED REPORTS: ${userHasReports ? "YES" : "NO"}

CLASSIFICATION RULES:

1. REPORT
- ALWAYS choose report if a file (PDF, image, DOC, scan, lab report, etc.) is attached.
- Choose report if the query explicitly mentions analyzing, uploading, sharing, or processing medical reports, scans, prescriptions, or documents.
- Choose report if user asks follow-up questions about their uploaded reports ("my blood test shows", "according to my scan", "what does my report mean").
- Choose report if user asks for product recommendations based on their test results or deficiencies from reports.
- Includes phrases like: "upload my report", "read this file", "analyse this scan", "my test results", "according to my lab work".

2. PRODUCT
- Choose product if the query involves cancer products, medicines, supplements, or therapies (WITHOUT specific reference to reports).
- Includes product recommendations, comparisons, or requests for something to help with symptoms.
- Covers usage, dosage, or side effects of specific products (e.g., "What can I take for nausea?", "Side effects of Omega-3?").
- Covers phrases like "What can help with…", "Suggest something for…", "I need medicine for…".
- General symptom-based product requests without report context.

3. DOCUMENT
- Choose document if the query is about education, knowledge, or information around cancer.
- Covers cancer types, stages, symptoms, diagnosis, treatments, and procedures.
- Covers definitions, medical terms, and explanations.
- Covers general research, awareness, or educational content.
- Includes personal/system questions ("who made you", "how do you work").
- Default to document when a query is ambiguous and not clearly report or product.

CONTEXT & PRIORITY RULES:
- If FILE ATTACHED = YES → always route to report (ignore query content).
- If user mentions "my report", "my test", "my results", "according to my blood work" → report.
- If user has uploaded reports and asks about deficiencies, abnormal values, or report-based recommendations → report.
- If previous conversation is about products and current query is a follow-up ("side effects?", "how to use?") → product.
- If previous conversation is educational and current query is a follow-up ("tell me more", "explain further") → document.
- When in doubt between product and document (no report context) → default to document.

Critical Output Requirements:
- Respond with ONLY one word: report OR product OR document
- Use lowercase only
- No quotes, no punctuation, no spaces
- No explanations, no reasoning, no extra words

💬 Additional CancerMitr Care Assistant Note:
- Your classification enables warm, empathetic, context-aware support.
- Default to document for general awareness/educational queries.
- If the query indicates medical emergency (e.g., chest pain, breathing difficulty, fainting), classify as document but ensure the agent immediately responds with emergency instructions.
- If the query is ambiguous and not clearly related to health or cancer, default to document and politely inform the user about the scope of assistance.

🚨 Emergency Escalation:
If user mentions any symptoms suggesting a medical emergency (e.g., chest pain, difficulty breathing, severe bleeding, loss of consciousness), immediately respond:
“This sounds serious. Please call emergency services (108 in India) or go to the nearest emergency hospital right away.”


`.trim();

  try {
    const res = await openai.chat.completions.create({
      model: ROUTER_MODEL,
      temperature: 0.1,
      messages: [{ role: "system", content: systemPrompt }],
    });

    const domain = res.choices[0].message.content
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^\w]/g, "")
      .trim();

    console.log(`Query: "${query}"`);
    console.log(`Has file: ${hasFile}`);
    console.log(`User has reports: ${userHasReports}`);
    console.log(`Context messages: ${conversationHistory.length}`);
    console.log(`Routed to: ${domain} agent`);

    return domain;
  } catch (err) {
    console.error("Error during classification:", err.message);
    return hasFile ? "report" : "document";
  }
}

// Check if user has uploaded reports
async function checkUserHasReports(sessionId) {
  try {
    const session = await prisma.chatSession.findUnique({
      where: { sessionId },
      select: { userId: true }
    });

    if (!session) return false;

    const reportCount = await prisma.healthReport.count({
      where: {
        userId: session.userId,
        analysisStatus: 'COMPLETED'
      }
    });

    return reportCount > 0;
  } catch (error) {
    console.error('Error checking user reports:', error.message);
    return false;
  }
}

// MAIN FUNCTION - Updated for unified file storage
export async function handleQuery(query, sessionId, file = null) {
  try {
    console.log(`Starting query processing:`, {
      sessionId,
      query: query?.substring(0, 100) + '...',
      hasFile: !!file,
      fileType: file?.mimetype,
      filePath: file?.relativePath || file?.path
    });

    // 1) Save user message immediately - UPDATED for unified file structure
    await ChatHistoryService.saveMessage({
      sessionId,
      messageType: 'USER',
      content: query,
      metadata: {
        hasFile: !!file,
        fileName: file?.originalname,
        fileSize: file?.size,
        mimeType: file?.mimetype,
        filePath: file?.relativePath || file?.path, // Include file path for unified storage
        category: file?.category,
        timestamp: new Date().toISOString()
      },
      roleForMemory: 'user'
    });

    // 2) Get conversation history for classification
    const classificationHistory = await ChatHistoryService.getConversationHistory(sessionId, 10);
    console.log(`Classification history: ${classificationHistory.length} messages`);

    // 3) Check if user has uploaded reports
    const userHasReports = await checkUserHasReports(sessionId);

    // 4) Classify with enhanced context
    const domain = await classifyQueryWithLLM(query, classificationHistory, !!file, userHasReports);

    // 5) Route based on domain with proper context
    let result;

    if (domain === 'report') {
      result = await handleReportAgent(query, sessionId, file);
    } else if (domain === 'product') {
      result = await handleRegularAgent(query, sessionId, 'product');
    } else {
      result = await handleRegularAgent(query, sessionId, 'document');
    }

    return {
      ...result,
      sessionId,
      agentUsed: domain
    };

  } catch (error) {
    console.error('Error in handleQuery:', error);
    
    try {
      await ChatHistoryService.saveMessage({
        sessionId,
        messageType: 'ERROR',
        content: `Error processing query: ${error.message}`,
        metadata: { 
          error: error.stack, 
          query,
          hasFile: !!file,
          filePath: file?.relativePath || file?.path,
          timestamp: new Date().toISOString()
        },
        roleForMemory: 'assistant'
      });
    } catch (saveError) {
      console.error('Failed to save error message:', saveError);
    }

    return {
      answer: 'Sorry, I encountered an error processing your request. Please try again.',
      from_knowledge_base: false,
      source: 'error',
      documents: [],
      error: true,
      sessionId
    };
  }
}

// Handle Report Agent - UPDATED for unified file storage
async function handleReportAgent(query, sessionId, file) {
  try {
    console.log('Processing with Report Agent', {
      hasFile: !!file,
      filePath: file?.relativePath || file?.path,
      fileSize: file?.size
    });

    const { summary, messages, totalAvailable, filtered } = await ChatHistoryService.getAgentContext(
      sessionId,
      'REPORT_AGENT',
      25
    );

    console.log(`Report Agent context: ${messages.length} messages, summary: ${!!summary}`);

    const orchestratorMessage = await ChatHistoryService.saveMessage({
      sessionId,
      messageType: 'ORCHESTRATOR',
      content: `Routing to report agent`,
      metadata: {
        selectedAgent: 'report',
        hasFile: !!file,
        fileName: file?.originalname,
        filePath: file?.relativePath || file?.path,
        contextMessages: messages.length,
        hasSummary: !!summary,
        routingConfidence: 'high',
        totalAvailable,
        filtered,
        contextSource: 'getAgentContext'
      },
      roleForMemory: 'assistant'
    });

    let reportResult;

    if (file) {
      // Handle new report upload - UPDATED for unified storage
      console.log('Processing new report upload with unified storage');
      
      const session = await prisma.chatSession.findUnique({
        where: { sessionId },
        select: { userId: true }
      });

      if (!session) {
        throw new Error('Session not found for report processing');
      }

      // Process the report using unified file structure
      const reportResults = await ReportAgent.processReports([file], session.userId, {
        category: file.category || null,
        sessionId: sessionId,
        source: 'chat'
      });

      const uploadResult = reportResults[0];
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      // WAIT FOR ANALYSIS TO COMPLETE
      console.log(`Waiting for analysis completion of report ${uploadResult.reportId}...`);
      
      let attempts = 0;
      const maxAttempts = 90; // 3 minutes max wait (90 * 2 seconds)
      const pollInterval = 2000; // 2 seconds between checks
      let analysisCompleted = false;
      let reportStatus = null;
      
      // Poll for analysis completion
      while (attempts < maxAttempts && !analysisCompleted) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        reportStatus = await ReportAgent.getReportStatus(uploadResult.reportId);
        console.log(`Analysis attempt ${attempts + 1}/${maxAttempts}, status: ${reportStatus?.analysisStatus}`);
        
        if (reportStatus?.analysisStatus === 'COMPLETED') {
          analysisCompleted = true;
          console.log('Analysis completed successfully!');
          break;
        } else if (reportStatus?.analysisStatus === 'FAILED') {
          throw new Error('Report analysis failed during processing');
        }
        
        attempts++;
      }
      
      if (!analysisCompleted) {
        // Timeout fallback - return processing message
        console.log('Analysis timeout - returning processing message as fallback');
        reportResult = {
          answer: `Your medical report "${file.originalname}" has been uploaded successfully and is being analyzed. The detailed analysis is taking longer than expected due to the complexity of your report. I'll provide the complete analysis shortly. You can continue asking other questions in the meantime.`,
          source: 'report',
          documents: [],
          reportProcessed: true,
          reportId: uploadResult.reportId,
          reportStatus: 'PROCESSING',
          analysisTimeout: true
        };
      } else {
        // Analysis completed - generate comprehensive response
        console.log('Generating comprehensive analysis response...');
        
        try {
          // Get the actual analysis from the completed report
          reportResult = await ReportAgent.handleReportQuery(
            `Please provide a comprehensive analysis of my medical report "${file.originalname}" that was just processed. Include key findings, lab values, abnormalities, and recommendations.`,
            messages,
            sessionId,
            summary
          );
          
          // Add upload metadata to the result
          reportResult.reportProcessed = true;
          reportResult.reportId = uploadResult.reportId;
          reportResult.reportStatus = 'COMPLETED';
          reportResult.analysisCompleted = true;
          
          console.log('Generated comprehensive analysis response successfully');
          
        } catch (analysisError) {
          console.error('Error generating analysis response:', analysisError.message);
          
          // Fallback to basic completion message
          reportResult = {
            answer: `Your medical report "${file.originalname}" has been successfully analyzed and the findings have been extracted. However, I encountered an issue generating the detailed response. Please ask me specific questions about your report, such as "What are the key findings?" or "Are there any abnormal values?" and I'll provide detailed information.`,
            source: 'report',
            documents: [],
            reportProcessed: true,
            reportId: uploadResult.reportId,
            reportStatus: 'COMPLETED',
            analysisError: true
          };
        }
      }

    } else {
      // Handle report follow-up questions with conversation context
      console.log('Processing report follow-up query with full context');
      
      reportResult = await ReportAgent.handleReportQuery(query, messages, sessionId, summary);
    }
    // Save agent response with unified file metadata
    await ChatHistoryService.saveMessage({
      sessionId,
      messageType: 'AGENT',
      agentType: 'REPORT_AGENT',
      content: reportResult.answer,
      metadata: {
        source: reportResult.source,
        reportProcessed: reportResult.reportProcessed || false,
        reportsReferenced: reportResult.reportsReferenced?.length || 0,
        productSuggestionsIncluded: reportResult.productSuggestionsIncluded || false,
        documentsFound: reportResult.documents?.length || 0,
        contextUsed: messages.length,
        hasSummary: !!summary,
        totalAvailable,
        filtered,
        analysisType: reportResult.analysisType || 'general',
        contextSource: 'getAgentContext',
        filePath: file?.relativePath || file?.path, // Include unified file path
        fileName: file?.originalname
      },
      parentId: orchestratorMessage.id,
      reportId: reportResult.reportId || null,
      roleForMemory: 'assistant'
    });

    console.log(`Report query completed:`, {
      hasFile: !!file,
      reportProcessed: reportResult.reportProcessed || false,
      reportsReferenced: reportResult.reportsReferenced?.length || 0,
      productSuggestions: reportResult.productSuggestionsIncluded || false,
      analysisType: reportResult.analysisType || 'general',
      filePath: file?.relativePath || file?.path
    });

    return {
      ...reportResult,
      contextualResponse: messages.length > 0,
      hasSummary: !!summary,
      contextStats: {
        messagesUsed: messages.length,
        totalAvailable,
        summaryPresent: !!summary,
        filtered,
        contextSource: 'getAgentContext'
      }
    };

  } catch (error) {
    console.error('Error in Report Agent:', error.message);
    
    const errorMessage = `I encountered an issue ${file ? 'processing your report' : 'analyzing your reports'}: ${error.message}. Please try again or contact support if the problem persists.`;
    
    await ChatHistoryService.saveMessage({
      sessionId,
      messageType: 'AGENT',
      agentType: 'REPORT_AGENT',
      content: errorMessage,
      metadata: {
        source: 'report',
        error: error.message,
        hasFile: !!file,
        filePath: file?.relativePath || file?.path,
        contextSource: 'getAgentContext'
      },
      roleForMemory: 'assistant'
    });

    return {
      answer: errorMessage,
      source: 'report',
      documents: [],
      error: true,
      contextualResponse: false
    };
  }
}

// Handle regular agents (Product/Document) with optimized context - UNCHANGED
async function handleRegularAgent(query, sessionId, domain) {
  const agentType = `${domain.toUpperCase()}_AGENT`;
  
  const { summary, messages, totalAvailable, filtered } = await ChatHistoryService.getAgentContext(
    sessionId,
    agentType,
    25
  );

  console.log(`Agent context prepared:`, {
    agent: agentType,
    recentMessagesFirst: messages.length,
    summaryAsBackground: !!summary,
    totalAvailable,
    filtered,
    contextPriority: 'recent_first_summary_background'
  });

  const orchestratorMessage = await ChatHistoryService.saveMessage({
    sessionId,
    messageType: 'ORCHESTRATOR',
    content: `Routing to ${domain} agent`,
    metadata: {
      selectedAgent: domain,
      contextMessages: messages.length,
      hasSummary: !!summary,
      routingConfidence: 'high',
      totalMessagesAvailable: totalAvailable,
      filtered,
      contextSource: 'getAgentContext'
    },
    roleForMemory: 'assistant'
  });

  let result;
  if (domain === 'product') {
    console.log(`Calling Product Agent with ${messages.length} recent messages + summary`);
    result = await handleProductQuery(query, messages, sessionId, summary);
  } else {
    console.log(`Calling Document Agent with ${messages.length} recent messages + summary`);
    result = await handleDocumentQuery(query, messages, sessionId, summary);
  }

  await ChatHistoryService.saveMessage({
    sessionId,
    messageType: 'AGENT',
    agentType: agentType,
    content: result.answer,
    metadata: {
      source: result.source,
      documentsFound: result.documents?.length || 0,
      confidence: result.confidence || 'medium',
      contextUsed: messages.length,
      hasSummary: !!summary,
      retrievalScore: result.retrievalScore || 0,
      summaryUtilized: result.summaryUtilized || false,
      totalAvailable,
      filtered,
      contextSource: 'getAgentContext'
    },
    parentId: orchestratorMessage.id,
    roleForMemory: 'assistant'
  });

  return {
    ...result,
    contextualResponse: messages.length > 0,
    hasSummary: !!summary,
    contextStats: {
      messagesUsed: messages.length,
      totalAvailable,
      summaryPresent: !!summary,
      filtered,
      contextSource: 'getAgentContext'
    }
  };
}

// Cross-agent product suggestions based on reports - UNCHANGED
export async function getProductSuggestionsFromReports(sessionId, reportAnalysis) {
  try {
    console.log('Getting cross-agent product suggestions from report analysis');
    
    const productQuery = extractProductSearchTerms(reportAnalysis);
    
    if (!productQuery) {
      return null;
    }

    const { summary, messages } = await ChatHistoryService.getAgentContext(
      sessionId,
      'PRODUCT_AGENT',
      15
    );

    const productResult = await handleProductQuery(
      `Based on medical report analysis showing: ${productQuery}`,
      messages,
      sessionId,
      summary
    );

    if (productResult.documents && productResult.documents.length > 0) {
      return {
        suggestions: formatCrossAgentProductSuggestions(productResult.documents.slice(0, 3)),
        productsFound: productResult.documents.length,
        searchTerms: productQuery
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting cross-agent product suggestions:', error);
    return null;
  }
}

function extractProductSearchTerms(analysis) {
  if (!analysis) return null;
  
  const terms = [];
  const lower = analysis.toLowerCase();
  
  const deficiencyPatterns = [
    /vitamin ([a-z0-9]+) deficiency/gi,
    /([a-z]+) deficiency/gi,
    /low ([a-z\s]+) levels/gi,
    /(iron|calcium|protein|vitamin|mineral) shortage/gi
  ];
  
  deficiencyPatterns.forEach(pattern => {
    const matches = analysis.match(pattern);
    if (matches) terms.push(...matches.map(m => m.replace(/deficiency|shortage|low levels/gi, '').trim()));
  });
  
  const symptomKeywords = [
    'fatigue', 'nausea', 'pain', 'weakness', 'appetite loss',
    'immune support', 'energy', 'nutrition', 'anemia'
  ];
  
  symptomKeywords.forEach(symptom => {
    if (lower.includes(symptom)) {
      terms.push(symptom);
    }
  });
  
  return terms.length > 0 ? terms.join(' ') : null;
}

function formatCrossAgentProductSuggestions(products) {
  if (!products || products.length === 0) {
    return "";
  }

  let suggestions = "\n🛍️ **Recommended Products Based on Your Report Analysis:**\n\n";
  
  products.forEach((product, index) => {
    suggestions += `${index + 1}. **${product.name}**\n`;
    if (product.description) {
      suggestions += `   ${product.description.substring(0, 120)}...\n`;
    }
    if (product.symptoms && product.symptoms.length > 0) {
      suggestions += `   Helps with: ${product.symptoms.slice(0, 3).join(', ')}\n`;
    }
    if (product.price) {
      suggestions += `   Price: ₹${product.price}\n`;
    }
    suggestions += "\n";
  });
  
  suggestions += "*These suggestions are based on your report analysis. Please consult your healthcare provider before starting any new supplements or treatments.*";
  
  return suggestions;
}

// Enhanced report status checking with conversation context - UNCHANGED
export async function checkReportStatusWithContext(sessionId, reportId) {
  try {
    const report = await ReportAgent.getReportStatus(reportId);
    
    if (!report) {
      return null;
    }

    if (report.analysisStatus === 'COMPLETED') {
      const { summary, messages } = await ChatHistoryService.getAgentContext(
        sessionId,
        'REPORT_AGENT',
        10
      );

      const hasProvidedAnalysis = messages.some(msg => 
        msg.messageType === 'AGENT' && 
        msg.agentType === 'REPORT_AGENT' &&
        msg.reportId === reportId &&
        (msg.content.includes('analysis complete') || msg.content.includes('findings'))
      );

      if (!hasProvidedAnalysis) {
        const analysisResponse = await ReportAgent.handleReportQuery(
          `Please provide a comprehensive analysis of my recently processed report`,
          messages,
          sessionId,
          summary
        );

        await ChatHistoryService.saveMessage({
          sessionId,
          messageType: 'AGENT',
          agentType: 'REPORT_AGENT',
          content: `📋 **Analysis Complete for ${report.originalName}**\n\n${analysisResponse.answer}`,
          metadata: {
            source: 'report',
            reportId: reportId,
            autoGenerated: true,
            reportsReferenced: [reportId],
            productSuggestionsIncluded: analysisResponse.productSuggestionsIncluded || false
          },
          reportId: reportId,
          roleForMemory: 'assistant'
        });

        return {
          ...analysisResponse,
          autoGenerated: true,
          reportCompleted: true
        };
      }
    }

    return {
      reportStatus: report.analysisStatus,
      reportId: report.id,
      fileName: report.originalName
    };
  } catch (error) {
    console.error('Error checking report status with context:', error);
    return null;
  }
}
