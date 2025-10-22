// controllers/chat.controller.js - Updated for unified file storage
import { handleQuery } from '../agents/agent.router.js';
import { ChatHistoryService } from '../services/chat-history.service.js';
import { getConversationSummary } from '../services/summary.service.js';
import { ReportAgent } from '../agents/report.agent.js';
import { prisma } from '../services/db.service.js';

function normalizeUserId(userId) {
  if (userId === null || userId === undefined || userId === '') return null;
  const n = typeof userId === 'number' ? userId : Number(String(userId).trim());
  if (Number.isNaN(n)) throw new Error(`Invalid userId: ${userId}`);
  return n;
}

// Create new chat session
export async function createChatSession(req, res) {
    try {
        const userId = normalizeUserId(req.user?.id);
        const { title } = req.body;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User authentication required'
            });
        }

        const session = await ChatHistoryService.createSession(userId);
        
        // Update title if provided
        if (title) {
            await prisma.chatSession.update({
                where: { sessionId: session.sessionId },
                data: { title: title.trim().substring(0, 100) }
            });
        }
        
        console.log(`New chat session created:`, {
            sessionId: session.sessionId,
            userId,
            title: title || 'New Chat'
        });
        
        res.json({
            success: true,
            sessionId: session.sessionId,
            title: title || session.title,
            message: 'New chat session created'
        });
        
    } catch (error) {
        console.error('Error creating chat session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create chat session',
            message: error.message
        });
    }
}

// Basic chat query with unified file handling
export async function handleQueryController(req, res) {
    try {
        const { query, sessionId } = req.body;
        const file = req.processedFile; // From saveFilePathsMiddleware
        const userId = normalizeUserId(req.user?.id);
        
        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'Query is required'
            });
        }
        
        console.log(`Chat Request:`, {
            userId,
            sessionId,
            query: query?.substring(0, 100) + '...',
            hasFile: !!file,
            filePath: file?.relativePath
        });
        
        // Create session if not provided
        let currentSessionId = sessionId;
        if (!currentSessionId) {
            const newSession = await ChatHistoryService.createSession(userId);
            currentSessionId = newSession.sessionId;
            console.log(`Created new session: ${currentSessionId}`);
        }
        
        // Handle query with unified file structure
        const result = await handleQuery(query, currentSessionId, file);
        
        res.json({
            success: true,
            ...result,
            sessionId: currentSessionId,
            userId
        });
        
    } catch (err) {
        console.error('Error in handleQueryController:', err);
        res.status(500).json({ 
            success: false,
            error: 'Failed to handle query',
            message: err.message 
        });
    }
}

// Enhanced chat query with unified file handling
export async function handleEnhancedQueryController(req, res) {
  try {
    const sessionId = req.params.sessionId
    const { query } = req.body;
    const file = req.processedFile;   // From saveFilePathsMiddleware
    const userId = normalizeUserId(req.user?.id);

    if ((!query || query.trim() === '') && !file) {
      return res.status(400).json({
        success: false,
        error: 'Either query or file is required'
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session ownership
    const session = await ChatHistoryService.getUserSession(sessionId);
    if (!session || session.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    console.log(`Enhanced chat query:`, {
      userId,
      sessionId,
      hasFile: !!file,
      queryLength: query.length,
      fileName: file?.originalname,
      filePath: file?.relativePath
    });

    // Process through enhanced agent router with unified file structure
    const result = await handleQuery(query, sessionId, file);
    
    // Check for completed reports that need notification
    await checkAndNotifyCompletedReports(sessionId);

    res.json({
      success: true,
      ...result,
      userId
    });

  } catch (error) {
    console.error('Error in enhanced chat query:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Get chat history
export async function getChatHistory(req, res) {
    try {
        const { sessionId } = req.params;
        const { limit = 50 } = req.query;
        const userId = normalizeUserId(req.user?.id);
        
        // Verify session ownership
        if (userId) {
            const session = await prisma.chatSession.findFirst({
                where: { 
                    sessionId,
                    userId 
                }
            });
            
            if (!session) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied to this chat session'
                });
            }
        }
        
        const history = await ChatHistoryService.getConversationHistory(
            sessionId, 
            parseInt(limit)
        );
        
        // Get summary information
        const summaryInfo = await getConversationSummary(sessionId);
        
        console.log(`Chat history retrieved:`, {
            sessionId,
            messageCount: history.length,
            userId,
            hasSummary: summaryInfo.hasSummary
        });
        
        res.json({
            success: true,
            messages: history,
            sessionId,
            totalMessages: history.length,
            summaryInfo
        });
        
    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chat history',
            message: error.message
        });
    }
}

// Get user's chat sessions
export async function getUserChatSessions(req, res) {
    try {
        const userId = normalizeUserId(req.user?.id);
        const { limit = 20 } = req.query;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User authentication required'
            });
        }
        
        const sessions = await ChatHistoryService.getUserSessions(userId, parseInt(limit));
        
        // Add summary and report info to each session
        const enrichedSessions = await Promise.all(
            sessions.map(async (session) => {
                try {
                    // Get summary info
                    const summaryInfo = await getConversationSummary(session.sessionId);
                    
                    // Get report count for this session
                    const reportCount = await prisma.healthReport.count({
                        where: {
                            sessionId: session.sessionId,
                            analysisStatus: 'COMPLETED'
                        }
                    });
                    
                    return {
                        ...session,
                        summaryInfo,
                        reportStats: {
                            completed: reportCount
                        }
                    };
                } catch (error) {
                    console.warn(`Failed to get info for session ${session.sessionId}:`, error.message);
                    return {
                        ...session,
                        summaryInfo: {
                            hasSummary: false,
                            summary: null,
                            lastSummarizedMessage: 0,
                            summaryId: null
                        },
                        reportStats: {
                            completed: 0
                        }
                    };
                }
            })
        );
        
        console.log(`User sessions retrieved:`, {
            userId,
            sessionCount: sessions.length
        });
        
        res.json({
            success: true,
            sessions: enrichedSessions,
            totalSessions: sessions.length
        });
        
    } catch (error) {
        console.error('Error fetching user sessions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch sessions',
            message: error.message
        });
    }
}

// Get session summary
export async function getSessionSummary(req, res) {
    try {
        const { sessionId } = req.params;
        const userId = normalizeUserId(req.user?.id);
        
        // Verify session ownership
        if (userId) {
            const session = await prisma.chatSession.findFirst({
                where: { 
                    sessionId,
                    userId 
                }
            });
            
            if (!session) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied to this chat session'
                });
            }
        }
        
        const summaryInfo = await getConversationSummary(sessionId);
        
        console.log(`Session summary retrieved:`, {
            sessionId,
            hasSummary: summaryInfo.hasSummary,
            summaryLength: summaryInfo.summary?.length || 0
        });
        
        res.json({
            success: true,
            sessionId,
            ...summaryInfo
        });
        
    } catch (error) {
        console.error('Error fetching session summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch session summary',
            message: error.message
        });
    }
}

// Delete chat session
export async function deleteChatSession(req, res) {
    try {
        const { sessionId } = req.params;
        const userId = normalizeUserId(req.user?.id);
        
        // Verify session ownership
        if (userId) {
            const session = await prisma.chatSession.findFirst({
                where: { 
                    sessionId,
                    userId 
                }
            });
            
            if (!session) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied to this chat session'
                });
            }
        }
        
        // Delete the session (cascade will handle messages and summaries)
        await prisma.chatSession.delete({
            where: { sessionId }
        });
        
        console.log(`Chat session deleted:`, {
            sessionId,
            userId
        });
        
        res.json({
            success: true,
            message: 'Chat session deleted successfully',
            sessionId
        });
        
    } catch (error) {
        console.error('Error deleting chat session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete chat session',
            message: error.message
        });
    }
}

// Update session title
export async function updateSessionTitle(req, res) {
    try {
        const { sessionId } = req.params;
        const { title } = req.body;
        const userId = normalizeUserId(req.user?.id);
        
        if (!title || title.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Title is required'
            });
        }
        
        // Verify session ownership
        if (userId) {
            const session = await prisma.chatSession.findFirst({
                where: { 
                    sessionId,
                    userId 
                }
            });
            
            if (!session) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied to this chat session'
                });
            }
        }
        
        // Update the session title
        const updatedSession = await prisma.chatSession.update({
            where: { sessionId },
            data: { 
                title: title.trim().substring(0, 100),
                updatedAt: new Date()
            }
        });
        
        console.log(`Session title updated:`, {
            sessionId,
            newTitle: updatedSession.title,
            userId
        });
        
        res.json({
            success: true,
            message: 'Session title updated successfully',
            sessionId,
            title: updatedSession.title
        });
        
    } catch (error) {
        console.error('Error updating session title:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update session title',
            message: error.message
        });
    }
}

// Helper function for checking completed reports
async function checkAndNotifyCompletedReports(sessionId) {
  try {
    const session = await ChatHistoryService.getUserSession(sessionId);
    if (!session) return [];

    // Find recently completed reports that haven't been analyzed in chat yet
    const recentReports = await prisma.healthReport.findMany({
      where: {
        userId: session.userId,
        analysisStatus: 'COMPLETED',
        uploadedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: { uploadedAt: 'desc' }
    });

    if (recentReports.length === 0) return [];

    // Check which reports haven't been discussed yet
    const { messages } = await ChatHistoryService.getAgentContext(
      sessionId,
      'REPORT_AGENT',
      50
    );

    const discussedReportIds = new Set(
      messages
        .filter(msg => msg.reportId)
        .map(msg => msg.reportId)
    );

    const newCompletedReports = recentReports.filter(
      report => !discussedReportIds.has(report.id)
    );

    // Auto-generate analysis for new completed reports
    for (const report of newCompletedReports) {
      try {
        const analysisResult = await ReportAgent.handleReportQuery(
          `Analysis complete for ${report.originalName}. Please provide key insights and any recommendations.`,
          messages,
          sessionId,
          ""
        );

        await ChatHistoryService.saveMessage({
          sessionId,
          messageType: 'AGENT',
          agentType: 'REPORT_AGENT',
          content: `📋 **Analysis Complete for ${report.originalName}**\n\n${analysisResult.answer}`,
          metadata: {
            source: 'report',
            reportId: report.id,
            autoGenerated: true,
            reportsReferenced: [report.id],
            productSuggestionsIncluded: analysisResult.productSuggestionsIncluded || false,
            filePath: report.filePath // Include file path in metadata
          },
          reportId: report.id,
          roleForMemory: 'assistant'
        });

        console.log(`Auto-generated analysis for completed report ${report.id} at ${report.filePath}`);
      } catch (analysisError) {
        console.error(`Error auto-generating analysis for report ${report.id}:`, analysisError);
      }
    }

    return newCompletedReports;
  } catch (error) {
    console.error('Error in checkAndNotifyCompletedReports:', error);
    return [];
  }
}