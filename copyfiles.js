// C:\Users\PC\Desktop\study-apps\cancermitr_mobile_app\backend\src\controllers\user.controller.js


// user.controller.js - FINAL UPDATED VERSION
import { handleQuery } from '../agents/agent.router.js';
import { ChatHistoryService } from '../services/chat-history.service.js';
import { getConversationSummary } from '../services/summary.service.js';
import { prisma } from '../services/db.service.js';

function normalizeUserId(userId) {
  if (userId === null || userId === undefined || userId === '') return null;
  const n = typeof userId === 'number' ? userId : Number(String(userId).trim());
  if (Number.isNaN(n)) throw new Error(`Invalid userId: ${userId}`);
  return n;
}

export const getUserProfile = async (req, res, next) => {
  try {
    const user = req.user;

    res.status(200).json({
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      age: user.age,
      gender: user.gender,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Error fetching user profile" });
  }
};

// UPDATED: Chat with proper context priority (recent messages first, summary as background)
export async function handleQueryController(req, res) {
    try {
        const { query, sessionId } = req.body;
        const userId = normalizeUserId(req.user?.id);
        
        console.log(`Chat Request:`, {
            userId,
            userIdType: typeof userId,
            sessionId,
            query: query?.substring(0, 100) + '...',
            hasFile: !!req.file,
            contextPriority: 'recent_messages_first'
        });
        
        // Create session if not provided
        let currentSessionId = sessionId;
        if (!currentSessionId) {
            const newSession = await ChatHistoryService.createSession(userId);
            currentSessionId = newSession.sessionId;
            console.log(`Created new session: ${currentSessionId}`);
        }
        
        // Handle query with proper context priority (recent messages first, summary as background)
        const result = await handleQuery(query, currentSessionId, req.file);
        
        // Return enhanced response with context information
        res.json({
            ...result,
            sessionId: currentSessionId,
            from_knowledge_base: true,
            userId,
            contextualResponse: result.contextualResponse || false,
            contextStats: result.contextStats || {
                messagesUsed: 0,
                summaryPresent: false,
                contextPriority: 'recent_messages_first'
            }
        });
        
    } catch (err) {
        console.error('Error in handleQueryController:', err);
        res.status(500).json({ 
            error: 'Failed to handle query',
            message: err.message 
        });
    }
}

// Create new chat session
export async function createChatSession(req, res) {
    try {
        const userId = normalizeUserId(req.user?.id);
        const session = await ChatHistoryService.createSession(userId);
        
        console.log(`New chat session created:`, {
            sessionId: session.sessionId,
            userId,
            userIdType: typeof userId
        });
        
        res.json({
            success: true,
            sessionId: session.sessionId,
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

// Get chat history with summary information
export async function getChatHistory(req, res) {
    try {
        const { sessionId } = req.params;
        const { limit = 50 } = req.query;
        const userId = normalizeUserId(req.user?.id);
        
        // Verify session belongs to user for security
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
            hasSummary: summaryInfo.hasSummary,
            contextPriority: 'chronological_order'
        });
        
        res.json({
            success: true,
            messages: history,
            sessionId,
            totalMessages: history.length,
            summaryInfo,
            contextPriority: 'recent_messages_first'
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

// Get user's chat sessions with summary information
export async function getUserChatSessions(req, res) {
    try {
        const userId = normalizeUserId(req.user?.id);
        const { limit = 20 } = req.query;
        
        console.log(`Getting sessions for user:`, {
            userId,
            userIdType: typeof userId,
            rawUserId: req.user?.id
        });
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User authentication required'
            });
        }
        
        const sessions = await ChatHistoryService.getUserSessions(userId, parseInt(limit));
        
        // Add summary info to each session
        const sessionsWithSummary = await Promise.all(
            sessions.map(async (session) => {
                try {
                    const summaryInfo = await getConversationSummary(session.sessionId);
                    return {
                        ...session,
                        summaryInfo
                    };
                } catch (error) {
                    console.warn(`Failed to get summary for session ${session.sessionId}:`, error.message);
                    return {
                        ...session,
                        summaryInfo: {
                            hasSummary: false,
                            summary: null,
                            lastSummarizedMessage: 0,
                            summaryId: null
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
            sessions: sessionsWithSummary,
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

// Get session summary (for debugging/admin)
export async function getSessionSummary(req, res) {
    try {
        const { sessionId } = req.params;
        const userId = normalizeUserId(req.user?.id);
        
        // Verify session belongs to user for security
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
        
        // Verify session belongs to user for security
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
        
        // Verify session belongs to user for security
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
                title: title.trim().substring(0, 100), // Limit title length
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

// Get session context info (for debugging)
export async function getSessionContext(req, res) {
    try {
        const { sessionId } = req.params;
        const userId = normalizeUserId(req.user?.id);
        
        // Verify session belongs to user for security
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
        
        // Get context information
        const { summary, messages, totalAvailable, filtered } = await ChatHistoryService.getAgentContext(
            sessionId,
            null, // No specific agent
            25
        );
        
        console.log(`Session context retrieved:`, {
            sessionId,
            messagesUsed: messages.length,
            totalAvailable,
            summaryPresent: !!summary
        });
        
        res.json({
            success: true,
            sessionId,
            contextInfo: {
                messagesUsed: messages.length,
                totalAvailable,
                filtered,
                summaryPresent: !!summary,
                summaryLength: summary?.length || 0,
                contextPriority: 'recent_messages_first'
            },
            recentMessages: messages.slice(-5).map(msg => ({
                messageType: msg.messageType,
                agentType: msg.agentType,
                timestamp: msg.timestamp,
                contentPreview: msg.content?.substring(0, 100) + '...'
            }))
        });
        
    } catch (error) {
        console.error('Error fetching session context:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch session context',
            message: error.message
        });
    }
}
















// src/controllers/report.controller.js - Enhanced Report Management Controllers
import { ReportAgent } from '../agents/report.agent.js';
import { ChatHistoryService } from '../services/chat-history.service.js';
import { prisma } from '../services/db.service.js';
import { maybeSummarizeSegment } from '../services/summary.service.js';
import fs from 'fs/promises';

function normalizeUserId(userId) {
  if (userId === null || userId === undefined || userId === '') return null;
  const n = typeof userId === 'number' ? userId : Number(String(userId).trim());
  if (Number.isNaN(n)) throw new Error(`Invalid userId: ${userId}`);
  return n;
}

// Upload reports directly to health locker - ENHANCED with summary generation
export async function uploadReports(req, res) {
  try {
    const userId = normalizeUserId(req.user?.id);
    const { category, createChatSession = true } = req.body;
    const files = req.files;

    console.log(`Report upload request:`, {
      userId,
      category,
      fileCount: files?.length || 0,
      createChatSession,
      files: files?.map(f => ({ name: f.originalname, size: f.size }))
    });

    // Validation
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files provided'
      });
    }

    if (files.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 5 files allowed per upload'
      });
    }

    if (!category || !['INSURANCE_DOCUMENT', 'INVESTIGATIONS_REPORTS', 'PRESCRIPTIONS_PROTOCOLS', 'COST_ESTIMATE', 'DISCHARGE_SUMMARY', 'OTHERS'].includes(category)) {
      return res.status(400).json({
        success: false,
        error: 'Valid category is required'
      });
    }

    let sessionId = null;
    
    // ENHANCED: Create session for context tracking if requested
    if (createChatSession) {
      // Find or create session for health locker context
      const recentSession = await prisma.chatSession.findFirst({
        where: {
          userId,
          title: { startsWith: 'Health Locker' },
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Within 7 days
          }
        },
        orderBy: { updatedAt: 'desc' }
      });

      if (recentSession) {
        sessionId = recentSession.sessionId;
        console.log(`Using existing health locker session: ${sessionId}`);
      } else {
        const newSession = await ChatHistoryService.createSession(userId);
        // Update title to indicate health locker context
        await prisma.chatSession.update({
          where: { sessionId: newSession.sessionId },
          data: { title: `Health Locker - ${new Date().toLocaleDateString()}` }
        });
        sessionId = newSession.sessionId;
        console.log(`Created new health locker session: ${sessionId}`);
      }

      // ENHANCED: Save upload context for summary generation
      const fileNames = files.map(f => f.originalname).join(', ');
      
      await ChatHistoryService.saveMessage({
        sessionId,
        messageType: 'USER',
        content: `Uploaded medical reports to health locker: ${fileNames}. Category: ${category}`,
        metadata: {
          source: 'health_locker',
          action: 'direct_upload',
          category,
          fileCount: files.length,
          fileNames: fileNames,
          totalSize: files.reduce((sum, f) => sum + f.size, 0)
        },
        roleForMemory: 'user'
      });

      await ChatHistoryService.saveMessage({
        sessionId,
        messageType: 'AGENT',
        agentType: 'REPORT_AGENT',
        content: `I've received ${files.length} medical report(s) in your health locker (Category: ${category}) and will analyze them using AI to extract key findings, lab values, and recommendations. Analysis typically takes 1-2 minutes per report.`,
        metadata: {
          source: 'health_locker',
          action: 'processing_start',
          category,
          fileCount: files.length
        },
        roleForMemory: 'assistant'
      });
    }

    // Process reports with enhanced context
    const results = await ReportAgent.processReports(files, userId, {
      category,
      sessionId,
      source: createChatSession ? 'health_locker_with_context' : 'health_locker_direct'
    });

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    // ENHANCED: If session created and reports successful, prepare for summary generation
    if (sessionId && successful.length > 0) {
      await ChatHistoryService.saveMessage({
        sessionId,
        messageType: 'AGENT',
        agentType: 'REPORT_AGENT',
        content: `Processing initiated for ${successful.length} report(s). I'll notify you when analysis is complete and summaries are ready.`,
        metadata: {
          source: 'health_locker',
          action: 'processing_confirmation',
          reportIds: successful.map(r => r.reportId),
          category,
          readyForSummary: true
        },
        roleForMemory: 'assistant'
      });

      // Trigger initial summary generation
      await maybeSummarizeSegment(sessionId);
    }

    console.log(`Upload completed:`, {
      successful: successful.length,
      failed: failed.length,
      sessionId,
      userId,
      summaryTriggered: !!sessionId
    });

    res.json({
      success: true,
      message: `Successfully uploaded ${successful.length} report(s)${sessionId ? ' with summary tracking' : ''}`,
      results: {
        successful,
        failed,
        totalFiles: files.length,
        sessionId: sessionId || null,
        summaryGeneration: !!sessionId
      }
    });

  } catch (error) {
    console.error('Error in uploadReports:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload reports',
      message: error.message
    });
  }
}

// Get user's reports - ENHANCED with summary status
export async function getUserReports(req, res) {
  try {
    const userId = normalizeUserId(req.user?.id);
    const { 
      category, 
      limit = 20, 
      offset = 0,
      status, // PENDING, PROCESSING, COMPLETED, FAILED
      includeSummaryStatus = false
    } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    console.log(`Getting reports for user:`, {
      userId,
      category,
      limit: parseInt(limit),
      offset: parseInt(offset),
      status,
      includeSummaryStatus
    });

    const where = { userId };
    if (category) where.category = category;
    if (status) where.analysisStatus = status;

    const reports = await prisma.healthReport.findMany({
      where,
      orderBy: { uploadedAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      select: {
        id: true,
        category: true,
        originalName: true,
        analysisStatus: true,
        summary: true,
        uploadedAt: true,
        fileSize: true,
        keyFindings: true,
        abnormalFindings: true,
        sessionId: true // ENHANCED: Include session context
      }
    });

    const total = await prisma.healthReport.count({ where });

    // ENHANCED: Include summary generation status
    let enrichedReports = reports;
    if (includeSummaryStatus === 'true') {
      enrichedReports = await Promise.all(
        reports.map(async (report) => {
          let summaryInfo = {
            hasSummary: !!report.summary,
            summaryLength: report.summary ? report.summary.length : 0,
            hasKeyFindings: (report.keyFindings || []).length > 0,
            hasAbnormalFindings: (report.abnormalFindings || []).length > 0,
            hasSessionContext: !!report.sessionId
          };

          // If report has session, check conversation summary status
          if (report.sessionId) {
            const conversationSummary = await prisma.conversationSummary.findFirst({
              where: { sessionId: report.sessionId },
              orderBy: { segmentTo: 'desc' },
              select: { id: true, summary: true, segmentTo: true }
            });

            summaryInfo.conversationSummary = {
              exists: !!conversationSummary,
              length: conversationSummary?.summary?.length || 0,
              lastSegment: conversationSummary?.segmentTo || 0
            };
          }

          return {
            ...report,
            summaryInfo
          };
        })
      );
    }

    console.log(`Retrieved ${reports.length} reports for user ${userId} with summary info`);

    res.json({
      success: true,
      reports: enrichedReports,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      },
      summaryTracking: includeSummaryStatus === 'true'
    });

  } catch (error) {
    console.error('Error in getUserReports:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reports',
      message: error.message
    });
  }
}

// Get specific report details - ENHANCED with summary information
export async function getReportDetails(req, res) {
  try {
    const userId = normalizeUserId(req.user?.id);
    const { reportId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const report = await prisma.healthReport.findFirst({
      where: {
        id: reportId,
        userId // Ensure user owns the report
      },
      select: {
        id: true,
        category: true,
        originalName: true,
        analysisStatus: true,
        summary: true,
        keyFindings: true,
        recommendations: true,
        labValues: true,
        abnormalFindings: true,
        uploadedAt: true,
        fileSize: true,
        mimeType: true,
        sessionId: true // ENHANCED: Include session context
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found or access denied'
      });
    }

    // ENHANCED: Include conversation summary if exists
    let conversationSummary = null;
    if (report.sessionId) {
      conversationSummary = await prisma.conversationSummary.findFirst({
        where: { sessionId: report.sessionId },
        orderBy: { segmentTo: 'desc' },
        select: {
          id: true,
          summary: true,
          segmentFrom: true,
          segmentTo: true,
          createdAt: true
        }
      });
    }

    console.log(`Retrieved report details:`, {
      reportId,
      userId,
      status: report.analysisStatus,
      hasSummary: !!report.summary,
      hasConversationSummary: !!conversationSummary
    });

    res.json({
      success: true,
      report: {
        ...report,
        // ENHANCED: Include summary generation info
        summaryGeneration: {
          reportSummary: {
            exists: !!report.summary,
            length: report.summary ? report.summary.length : 0,
            hasAnalysis: report.analysisStatus === 'COMPLETED'
          },
          conversationSummary: conversationSummary ? {
            exists: true,
            summary: conversationSummary.summary,
            segmentRange: `${conversationSummary.segmentFrom}-${conversationSummary.segmentTo}`,
            generatedAt: conversationSummary.createdAt
          } : null,
          hasSessionContext: !!report.sessionId
        }
      }
    });

  } catch (error) {
    console.error('Error in getReportDetails:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch report details',
      message: error.message
    });
  }
}

// Delete report - ENHANCED with summary cleanup
export async function deleteReport(req, res) {
  try {
    const userId = normalizeUserId(req.user?.id);
    const { reportId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify ownership and get file path
    const report = await prisma.healthReport.findFirst({
      where: {
        id: reportId,
        userId
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found or access denied'
      });
    }

    // ENHANCED: If report was part of a session, update conversation
    if (report.sessionId) {
      await ChatHistoryService.saveMessage({
        sessionId: report.sessionId,
        messageType: 'AGENT',
        agentType: 'REPORT_AGENT',
        content: `Medical report "${report.originalName}" has been deleted from your health locker.`,
        metadata: {
          action: 'report_deleted',
          reportId,
          fileName: report.originalName
        },
        roleForMemory: 'assistant'
      });

      // Trigger summary update to reflect deletion
      await maybeSummarizeSegment(report.sessionId);
    }

    // Delete file from disk
    try {
      await fs.unlink(report.filePath);
      console.log(`Deleted file: ${report.filePath}`);
    } catch (fileError) {
      console.warn(`Failed to delete file ${report.filePath}:`, fileError.message);
      // Continue with database deletion even if file deletion fails
    }

    // Delete from database (this will cascade delete related chat messages)
    await prisma.healthReport.delete({
      where: { id: reportId }
    });

    console.log(`Deleted report with summary cleanup:`, {
      reportId,
      userId,
      fileName: report.originalName,
      hadSession: !!report.sessionId
    });

    res.json({
      success: true,
      message: 'Report and associated summaries deleted successfully'
    });

  } catch (error) {
    console.error('Error in deleteReport:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete report',
      message: error.message
    });
  }
}

// Get report categories - UNCHANGED
export async function getReportCategories(req, res) {
  try {
    const categories = [
      { value: 'INSURANCE_DOCUMENT', label: 'Insurance Document', description: 'Health insurance papers, claims, approvals' },
      { value: 'INVESTIGATIONS_REPORTS', label: 'Investigation Reports', description: 'Lab tests, scans, diagnostic reports' },
      { value: 'PRESCRIPTIONS_PROTOCOLS', label: 'Prescriptions & Protocols', description: 'Medicine prescriptions, treatment protocols' },
      { value: 'COST_ESTIMATE', label: 'Cost Estimate', description: 'Treatment cost estimates, bills' },
      { value: 'DISCHARGE_SUMMARY', label: 'Discharge Summary', description: 'Hospital discharge summaries' },
      { value: 'OTHERS', label: 'Others', description: 'Other medical documents' }
    ];

    res.json({
      success: true,
      categories
    });

  } catch (error) {
    console.error('Error in getReportCategories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories',
      message: error.message
    });
  }
}

// Get report analysis status - ENHANCED with summary info
export async function getReportStatus(req, res) {
  try {
    const userId = normalizeUserId(req.user?.id);
    const { reportId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const report = await prisma.healthReport.findFirst({
      where: {
        id: reportId,
        userId
      },
      select: {
        id: true,
        originalName: true,
        analysisStatus: true,
        uploadedAt: true,
        summary: true,
        sessionId: true
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found or access denied'
      });
    }

    // ENHANCED: Include summary status
    const summaryStatus = {
      hasReportSummary: !!report.summary,
      reportSummaryLength: report.summary ? report.summary.length : 0,
      hasSession: !!report.sessionId,
      sessionId: report.sessionId
    };

    // Check conversation summary status if session exists
    if (report.sessionId) {
      const conversationSummary = await prisma.conversationSummary.findFirst({
        where: { sessionId: report.sessionId },
        orderBy: { segmentTo: 'desc' }
      });

      summaryStatus.conversationSummary = {
        exists: !!conversationSummary,
        length: conversationSummary?.summary?.length || 0
      };
    }

    res.json({
      success: true,
      status: {
        id: report.id,
        fileName: report.originalName,
        analysisStatus: report.analysisStatus,
        uploadedAt: report.uploadedAt,
        isComplete: report.analysisStatus === 'COMPLETED',
        isFailed: report.analysisStatus === 'FAILED',
        isProcessing: ['PENDING', 'PROCESSING'].includes(report.analysisStatus),
        summaryStatus // ENHANCED: Include summary information
      }
    });

  } catch (error) {
    console.error('Error in getReportStatus:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch report status',
      message: error.message
    });
  }
}











import express from "express";
import { 
    getUserProfile, 
    handleQueryController,
    createChatSession,
    getChatHistory,
    getUserChatSessions
} from "../controllers/user.controller.js";
import { verifyToken } from "../middleware/verifyToken.middleware.js";
import multer from 'multer';


const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow common document and image types
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/csv',
            'application/json',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/bmp',
            'image/tiff',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} not supported`), false);
        }
    }
});



router.get("/profile", verifyToken, getUserProfile);
// router.post('/', upload.single('file'), handleQueryController);
router.post('/chat/new', verifyToken, createChatSession);                    // Create new chat session
router.post('/chat', verifyToken, upload.single('file'), handleQueryController); // Send message (with optional file)
router.get('/chat/:sessionId/history', verifyToken, getChatHistory);        // Get chat history
router.get('/chat/sessions', verifyToken, getUserChatSessions);             // Get user's chat sessions


export default router;
