// src/services/summary.service.js
import { prisma } from './db.service.js';
import { openai } from './llm.service.js';

const SEGMENT_SIZE = 15; // messages per segment
const SUMMARY_MODEL = process.env.SUMMARY_MODEL || 'gpt-4o-mini';

// Generate contextual summaries that agents can utilize for background context
export async function maybeSummarizeSegment(sessionId) {
  try {
    console.log(`Checking if summarization needed for session: ${sessionId}`);
    
    // Get total message count
    const messageCount = await prisma.chatMessage.count({
      where: { sessionId }
    });
    
    console.log(`Total messages in session: ${messageCount}`);
    
    // Only summarize if we have enough messages
    if (messageCount < SEGMENT_SIZE) {
      console.log(`Not enough messages for summarization (${messageCount} < ${SEGMENT_SIZE})`);
      return null;
    }
    
    // Check if we already have a recent summary
    const latestSummary = await getLatestSummary(sessionId);
    const lastSummarizedIndex = latestSummary?.segmentTo || 0;
    const newMessages = messageCount - lastSummarizedIndex;
    
    console.log(`Messages since last summary: ${newMessages}`);
    
    if (newMessages < SEGMENT_SIZE) {
      console.log(`Not enough new messages for new summary (${newMessages} < ${SEGMENT_SIZE})`);
      return latestSummary;
    }
    
    // Generate new summary
    const segmentFrom = lastSummarizedIndex + 1;
    const segmentTo = messageCount;
    
    console.log(`Generating summary for messages ${segmentFrom} to ${segmentTo}`);
    
    const summary = await generateContextualSummary(sessionId, segmentFrom, segmentTo, latestSummary?.summary);
    
    // Save the new summary
    const summaryRecord = await prisma.conversationSummary.create({
      data: {
        sessionId,
        segmentFrom,
        segmentTo,
        summary
      }
    });
    
    console.log(`Summary created:`, {
      id: summaryRecord.id,
      segmentRange: `${segmentFrom}-${segmentTo}`,
      summaryLength: summary.length
    });
    
    return summaryRecord;
    
  } catch (error) {
    console.error('Error in maybeSummarizeSegment:', error);
    return null;
  }
}

// Generate agent-friendly contextual summaries for background context
async function generateContextualSummary(sessionId, segmentFrom, segmentTo, previousSummary = null) {
  try {
    // Get messages to summarize
    const messages = await prisma.chatMessage.findMany({
      where: {
        sessionId,
        messageIndex: {
          gte: segmentFrom,
          lte: segmentTo
        }
      },
      orderBy: { messageIndex: 'asc' },
      select: {
        messageType: true,
        agentType: true,
        content: true,
        messageIndex: true,
        metadata: true
      }
    });
    
    console.log(`Summarizing ${messages.length} messages`);
    
    if (messages.length === 0) {
      return previousSummary || 'No conversation yet.';
    }
    
    // Build conversation text for summarization
    const conversationText = messages
      .filter(msg => ['USER', 'AGENT', 'ERROR'].includes(msg.messageType))
      .map(msg => {
        const role = msg.messageType === 'USER' ? 'User' : 
                    msg.messageType === 'AGENT' ? `Assistant(${msg.agentType || 'UNKNOWN'})` : 
                    'System';
        return `${role}: ${msg.content}`;
      })
      .join('\n');
    
    // Enhanced summarization prompt for background context
    const systemPrompt = `
    You are creating a background context summary for CancerMitr's AI agents. This summary will provide background understanding while agents prioritize recent conversation messages for immediate context.

    ${previousSummary ? `
    PREVIOUS SUMMARY:
    ${previousSummary}

    The following is NEW conversation content to integrate with the above summary.
    ` : 'This is the FIRST summary for this conversation.'}

    CONVERSATION TO SUMMARIZE:
    ${conversationText}

    Create a comprehensive background summary that includes:

    1. **User's Cancer Context**: Cancer type, stage, treatments mentioned, current phase of journey
    2. **Key Symptoms/Concerns**: Physical symptoms, side effects, emotional concerns discussed
3. **Product Interests**: Any products, supplements, treatments they've asked about
4. **Medical Information Sought**: Educational topics, explanations they've requested
5. **Preferences/Constraints**: Any mentioned preferences, allergies, limitations
6. **Ongoing Themes**: Recurring questions or concerns across the conversation

FORMAT REQUIREMENTS:
- Write in present tense ("User has...", "User is experiencing...")
- Focus on facts and context that provide background understanding for agents
- Include specific medical terms, cancer types, symptoms mentioned
- Keep under 300 words but be comprehensive
- Prioritize stable context that won't change rapidly
- Use clear, professional language that agents can easily parse
- This is BACKGROUND context - agents will prioritize recent messages for immediate context

The summary should help agents understand: "What is this user's overall cancer journey and situation?" as background context while they focus on recent messages for immediate conversation flow.
`.trim();

    const response = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.1,
      max_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt }
      ]
    });
    
    const summary = response.choices[0].message.content.trim();
    
    console.log(`Generated summary (${summary.length} chars):`, summary.substring(0, 100) + '...');
    
    return summary;
    
  } catch (error) {
    console.error('Error generating contextual summary:', error);
    return previousSummary || 'Summary generation failed.';
  }
}

// Get the latest summary for a session
export async function getLatestSummary(sessionId) {
  try {
    const summary = await prisma.conversationSummary.findFirst({
      where: { sessionId },
      orderBy: { segmentTo: 'desc' }
    });
    
    if (summary) {
      console.log(`Retrieved latest summary:`, {
        id: summary.id,
        segmentRange: `${summary.segmentFrom}-${summary.segmentTo}`,
        length: summary.summary.length
      });
    } else {
      console.log(`No summary found for session: ${sessionId}`);
    }
    
    return summary;
  } catch (error) {
    console.error('Error getting latest summary:', error);
    return null;
  }
}

// Force regenerate summary (for testing/debugging)
export async function regenerateSummary(sessionId, segmentFrom = 1, segmentTo = null) {
  try {
    console.log(`Force regenerating summary for session: ${sessionId}`);
    
    // Get total messages if segmentTo not specified
    if (!segmentTo) {
      const messageCount = await prisma.chatMessage.count({
        where: { sessionId }
      });
      segmentTo = messageCount;
    }
    
    // Delete existing summary for this range
    await prisma.conversationSummary.deleteMany({
      where: {
        sessionId,
        segmentFrom: { gte: segmentFrom },
        segmentTo: { lte: segmentTo }
      }
    });
    
    // Generate new summary
    const summary = await generateContextualSummary(sessionId, segmentFrom, segmentTo);
    
    // Save new summary
    const summaryRecord = await prisma.conversationSummary.create({
      data: {
        sessionId,
        segmentFrom,
        segmentTo,
        summary
      }
    });
    
    console.log(`Force regenerated summary:`, {
      id: summaryRecord.id,
      segmentRange: `${segmentFrom}-${segmentTo}`,
      length: summary.length
    });
    
    return summaryRecord;
    
  } catch (error) {
    console.error('Error force regenerating summary:', error);
    throw error;
  }
}

// Get conversation summary for API responses
export async function getConversationSummary(sessionId) {
  try {
    const summary = await getLatestSummary(sessionId);
    return {
      hasSummary: !!summary,
      summary: summary?.summary || null,
      lastSummarizedMessage: summary?.segmentTo || 0,
      summaryId: summary?.id || null
    };
  } catch (error) {
    console.error('Error getting conversation summary:', error);
    return {
      hasSummary: false,
      summary: null,
      lastSummarizedMessage: 0,
      summaryId: null
    };
  }
}


export async function generateReportSummary(sessionId) {
  try {
    // Check if we already have a recent summary
    const latestSummary = await getLatestSummary(sessionId);
    const lastSummarizedIndex = latestSummary?.segmentTo || 0;
    const newMessages = messageCount - lastSummarizedIndex;
    
    console.log(`Messages since last summary: ${newMessages}`);
    
    if (newMessages < SEGMENT_SIZE) {
      console.log(`Not enough new messages for new summary (${newMessages} < ${SEGMENT_SIZE})`);
      return latestSummary;
    }
    
    // Generate new summary
    const segmentFrom = lastSummarizedIndex + 1;
    const segmentTo = messageCount;
    
    console.log(`Generating summary for messages ${segmentFrom} to ${segmentTo}`);
    
    const summary = await generateContextualSummary(sessionId, segmentFrom, segmentTo, latestSummary?.summary);
    
    // Save the new summary
    const summaryRecord = await prisma.conversationSummary.create({
      data: {
        sessionId,
        segmentFrom,
        segmentTo,
        summary
      }
    });
    
    console.log(`Summary created:`, {
      id: summaryRecord.id,
      segmentRange: `${segmentFrom}-${segmentTo}`,
      summaryLength: summary.length
    });
    
    return summaryRecord;
    
  } catch (error) {
    console.error('Error in maybeSummarizeSegment:', error);
    return null;
  }
}




/**
 * Generate and save medical summary for health reports
 * @param {string} sessionId - Session ID 
 * @param {Array} reportIds - Optional array of specific report IDs to summarize
 * @returns {Object} Summary result with success status
 */
export async function generateAndSaveMedicalSummary(sessionId, reportIds = null) {
  try {
    console.log(`Generating medical summary for session: ${sessionId}`);

    // Get session info
    const session = await prisma.chatSession.findUnique({
      where: { sessionId },
      select: { userId: true, title: true }
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Get user's completed reports
    let whereClause = {
      userId: session.userId,
      analysisStatus: 'COMPLETED'
    };

    // If specific report IDs provided, filter to those
    if (reportIds && reportIds.length > 0) {
      whereClause.id = { in: reportIds };
    }

    const reports = await prisma.healthReport.findMany({
      where: whereClause,
      select: {
        id: true,
        originalName: true,
        category: true,
        summary: true,
        keyFindings: true,
        abnormalFindings: true,
        recommendations: true,
        labValues: true,
        uploadedAt: true,
        sessionId: true
      },
      orderBy: { uploadedAt: 'desc' },
      take: 20 // Limit to recent reports
    });

    if (reports.length === 0) {
      console.log('No completed reports found for medical summary');
      return { success: false, reason: 'No completed reports found' };
    }

    console.log(`Found ${reports.length} reports for medical summary`);

    // Get recent conversation messages from the session
    const messages = await prisma.chatMessage.findMany({
      where: { 
        sessionId,
        messageType: { in: ['USER', 'AGENT'] }
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        messageType: true,
        agentType: true,
        content: true,
        createdAt: true
      }
    });

    // Generate comprehensive medical summary
    const medicalSummaryText = await generateMedicalSummaryText(reports, messages, session);

    // Check if summary already exists for this session
    const existingSummary = await prisma.conversationSummary.findFirst({
      where: { 
        sessionId,
        // Look for medical summary type in metadata
        OR: [
          { summary: { contains: 'MEDICAL SUMMARY' } },
          { metadata: { path: ['summaryType'], equals: 'medical' } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    let summaryRecord;

    if (existingSummary) {
      // Update existing medical summary
      summaryRecord = await prisma.conversationSummary.update({
        where: { id: existingSummary.id },
        data: {
          summary: medicalSummaryText,
          segmentTo: messages.length,
          metadata: {
            summaryType: 'medical',
            reportCount: reports.length,
            reportCategories: [...new Set(reports.map(r => r.category))],
            reportIds: reports.map(r => r.id),
            lastUpdated: new Date().toISOString(),
            hasAbnormalFindings: reports.some(r => r.abnormalFindings && Array.isArray(r.abnormalFindings) && r.abnormalFindings.length > 0),
            hasRecommendations: reports.some(r => r.recommendations && Array.isArray(r.recommendations) && r.recommendations.length > 0)
          }
        }
      });
      console.log(`Updated existing medical summary: ${summaryRecord.id}`);
    } else {
      // Create new medical summary
      summaryRecord = await prisma.conversationSummary.create({
        data: {
          sessionId,
          segmentFrom: 1,
          segmentTo: messages.length,
          summary: medicalSummaryText,
          metadata: {
            summaryType: 'medical',
            reportCount: reports.length,
            reportCategories: [...new Set(reports.map(r => r.category))],
            reportIds: reports.map(r => r.id),
            generatedAt: new Date().toISOString(),
            hasAbnormalFindings: reports.some(r => r.abnormalFindings && Array.isArray(r.abnormalFindings) && r.abnormalFindings.length > 0),
            hasRecommendations: reports.some(r => r.recommendations && Array.isArray(r.recommendations) && r.recommendations.length > 0)
          }
        }
      });
      console.log(`Created new medical summary: ${summaryRecord.id}`);
    }

    return {
      success: true,
      summaryId: summaryRecord.id,
      reportsCovered: reports.length,
      summaryLength: medicalSummaryText.length,
      categories: [...new Set(reports.map(r => r.category))]
    };

  } catch (error) {
    console.error('Error in generateAndSaveMedicalSummary:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Generate comprehensive medical summary text
 * @param {Array} reports - Medical reports
 * @param {Array} messages - Conversation messages
 * @param {Object} session - Session info
 * @returns {string} Generated summary text
 */
async function generateMedicalSummaryText(reports, messages, session) {
  // Build detailed reports context
  const reportsContext = reports.map((report, index) => {
    const findings = Array.isArray(report.keyFindings) ? report.keyFindings : [];
    const abnormal = Array.isArray(report.abnormalFindings) ? report.abnormalFindings : [];
    const recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];
    const labValues = Array.isArray(report.labValues) ? report.labValues : [];

    return `
REPORT ${index + 1}: ${report.originalName}
Category: ${report.category}
Upload Date: ${new Date(report.uploadedAt).toLocaleDateString()}

Medical Summary: ${report.summary || 'Processing complete'}

Key Findings:
${findings.length > 0 ? findings.map(f => `• ${f}`).join('\n') : '• No specific findings noted'}

Laboratory Values:
${labValues.length > 0 ? 
  labValues.map(lab => `• ${lab.name}: ${lab.value} ${lab.unit || ''} ${lab.status ? `(${lab.status})` : ''} ${lab.normal ? `[Normal: ${lab.normal}]` : ''}`).join('\n') : 
  '• No laboratory values recorded'}

Abnormal Findings:
${abnormal.length > 0 ? abnormal.map(a => `• ${a}`).join('\n') : '• No abnormal findings identified'}

Recommendations:
${recommendations.length > 0 ? recommendations.map(r => `• ${r}`).join('\n') : '• No specific recommendations provided'}
    `.trim();
  }).join('\n\n' + '-'.repeat(60) + '\n\n');

  // Build conversation context
  const conversationContext = messages.length > 0 ? messages.map(msg => {
    const role = msg.messageType === 'USER' ? 'Patient' : 'CancerMitr AI';
    return `${role}: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`;
  }).join('\n') : 'No conversation messages available.';

  // Analyze overall health status
  const analysisOverview = {
    totalReports: reports.length,
    categories: [...new Set(reports.map(r => r.category))],
    recentUploads: reports.filter(r => new Date(r.uploadedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length,
    hasAbnormalFindings: reports.some(r => r.abnormalFindings && Array.isArray(r.abnormalFindings) && r.abnormalFindings.length > 0),
    hasRecommendations: reports.some(r => r.recommendations && Array.isArray(r.recommendations) && r.recommendations.length > 0),
    dateRange: {
      earliest: reports[reports.length - 1]?.uploadedAt,
      latest: reports[0]?.uploadedAt
    }
  };

  const prompt = `You are creating a comprehensive medical summary for a patient's health records in CancerMitr system. This summary will be stored in the database and used for medical continuity and future consultations.

PATIENT INFORMATION:
Session: ${session.title || 'Health Locker Session'}

RECENT CONVERSATION CONTEXT:
${conversationContext}

COMPLETE MEDICAL REPORTS (${reports.length} reports):
${reportsContext}

ANALYSIS OVERVIEW:
• Total Reports: ${analysisOverview.totalReports}
• Categories: ${analysisOverview.categories.join(', ')}
• Date Range: ${analysisOverview.earliest ? new Date(analysisOverview.earliest).toLocaleDateString() : 'N/A'} to ${analysisOverview.latest ? new Date(analysisOverview.latest).toLocaleDateString() : 'N/A'}
• Recent Uploads (7 days): ${analysisOverview.recentUploads}
• Has Abnormal Findings: ${analysisOverview.hasAbnormalFindings ? 'Yes' : 'No'}
• Has Medical Recommendations: ${analysisOverview.hasRecommendations ? 'Yes' : 'No'}

Create a comprehensive medical summary with the following structure:

# MEDICAL SUMMARY - ${new Date().toLocaleDateString()}

## PATIENT HEALTH STATUS
Overall assessment of patient's current health status based on all available reports.

## LABORATORY RESULTS & CLINICAL VALUES
### Blood Work & Chemistry Panel
- Key laboratory values and trends
- Values outside normal ranges
- Clinical significance of abnormal results

### Specialized Testing
- Tumor markers, hormones, or other specialized tests
- Imaging findings and interpretations
- Pathology results if available

## SIGNIFICANT MEDICAL FINDINGS
### Key Clinical Observations
- Important positive findings
- Normal results that rule out conditions
- Patterns across multiple reports

### Abnormal Results Requiring Attention
- All abnormal findings with clinical context
- Severity and urgency assessment
- Monitoring requirements

## MEDICAL RECOMMENDATIONS & CARE PLAN
### Immediate Actions
- Urgent follow-ups or treatments needed
- Medication adjustments or new prescriptions
- Lifestyle modifications recommended

### Ongoing Care
- Regular monitoring requirements
- Follow-up testing schedules
- Specialist consultations recommended

## CLINICAL TRENDS & PATTERNS
- Changes over time in key values
- Response to treatments if applicable
- Areas of improvement or concern

## PATIENT EDUCATION & DISCUSSIONS
- Medical questions addressed
- Explanations provided about conditions
- Educational content covered

## NEXT STEPS & FOLLOW-UP
- Priority actions for patient
- Healthcare provider consultations needed
- Timeline for follow-up care

Make this summary detailed, medically accurate, and suitable for healthcare professionals. Include specific values, dates, and clinical interpretations. The summary should be comprehensive but well-organized for easy reference.`;

  const response = await openai.chat.completions.create({
    model: SUMMARY_MODEL,
    temperature: 0.1,
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }]
  });

  return response.choices[0].message.content;
}