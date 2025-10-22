// controllers/report.controller.js - Updated for unified file storage
import { ReportAgent } from '../agents/report.agent.js';
import { ChatHistoryService } from '../services/chat-history.service.js';
import { prisma } from '../services/db.service.js';
import { generateAndSaveMedicalSummary, maybeSummarizeSegment } from '../services/summary.service.js';
import { deleteFile, getFileUrl } from '../middleware/fileStorage.middleware.js';

function normalizeUserId(userId) {
  if (userId === null || userId === undefined || userId === '') return null;
  const n = typeof userId === 'number' ? userId : Number(String(userId).trim());
  if (Number.isNaN(n)) throw new Error(`Invalid userId: ${userId}`);
  return n;
}

// Upload reports with unified file handling
export async function uploadReports(req, res) {
  try {
    const userId = normalizeUserId(req.user?.id);
    const { createChatSession = true } = req.body;
    const files = req.processedFiles; // From saveFilePathsMiddleware

    console.log(`Report upload request:`, {
      userId,
      fileCount: files?.length || 0,
      createChatSession,
      files: files?.map(f => ({ 
        name: f.originalname, 
        size: f.size, 
        path: f.relativePath,
        temporaryCategory: 'OTHERS'
      }))
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


    let sessionId = null;
    
    // Create session for context tracking if requested
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
        await prisma.chatSession.update({
          where: { sessionId: newSession.sessionId },
          data: { title: `Health Locker - ${new Date().toLocaleDateString()}` }
        });
        sessionId = newSession.sessionId;
        console.log(`Created new health locker session: ${sessionId}`);
      }

      const fileNames = files.map(f => f.originalname).join(', ');
      
      await ChatHistoryService.saveMessage({
        sessionId,
        messageType: 'USER',
        content: `Uploaded medical reports to health locker: ${fileNames}.`,
        metadata: {
          source: 'health_locker',
          action: 'direct_upload',
          fileCount: files.length,
          fileNames: fileNames,
          totalSize: files.reduce((sum, f) => sum + f.size, 0),
          filePaths: files.map(f => f.relativePath)
        },
        roleForMemory: 'user'
      });

      await ChatHistoryService.saveMessage({
        sessionId,
        messageType: 'AGENT',
        agentType: 'REPORT_AGENT',
        content: `I've received ${files.length} medical report(s) in your health locker and will analyze and categorize them using AI to extract key findings, lab values, and recommendations. Analysis typically takes 1-2 minutes per report.`,
        metadata: {
          source: 'health_locker',
          action: 'processing_start',
          fileCount: files.length,
          note: 'AI will categorize during document analysis'
        },
        roleForMemory: 'assistant'
      });
    }

    // Process reports with enhanced context - pass unified file structure
    const results = await ReportAgent.processReports(files, userId, {
      sessionId,
      source: createChatSession ? 'health_locker_with_context' : 'health_locker_direct'
    });

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    // If session created and reports successful, prepare for summary generation
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
          readyForSummary: true
        },
        roleForMemory: 'assistant'
      });

      // Trigger initial summary generation
      // await maybeSummarizeSegment(sessionId);
      const summaryResult = await generateAndSaveMedicalSummary(sessionId, successful.map(r => r.reportId));
      if(summaryResult.success) {
        await ChatHistoryService.saveMessage({
          sessionId,
          messageType: 'AGENT',
          agentType: 'REPORT_AGENT',
          content: `📋 **Medical Summary Generated**\n\nI've created a comprehensive medical summary covering ${summaryResult.reportsCovered} report(s) across ${summaryResult.categories.join(', ')} categories. The summary includes:\n\n• Complete analysis of your medical reports\n• Key findings and laboratory values\n• Abnormal results requiring attention\n• Medical recommendations and next steps\n\nThis ${(summaryResult.summaryLength / 1000).toFixed(1)}k-word summary is now saved in your health locker for future reference.`,
          metadata: {
            source: 'health_locker',
            action: 'medical_summary_generated',
            summaryId: summaryResult.summaryId,
            reportsCovered: summaryResult.reportsCovered,
            categories: summaryResult.categories,
            summaryLength: summaryResult.summaryLength  
          },
          roleForMemory: 'assistant'
        });
      }
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
        summaryGeneration: !!sessionId,
        note: 'Categories will be automatically determined during document analysis'
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

// Get user's reports - Enhanced with unified file paths
export async function getUserReports(req, res) {
  try {
    const userId = normalizeUserId(req.user?.id);
    const { 
      category, 
      limit = 20, 
      offset = 0,
      status,
      includeSummaryStatus = false
    } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

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
        sessionId: true,
        filePath: true // Include file path for URL generation
      }
    });

    const total = await prisma.healthReport.count({ where });

    // Enhanced with file URLs and summary status
    let enrichedReports = reports.map(report => ({
      ...report,
      fileUrl: getFileUrl(report.filePath) // Generate accessible URL
    }));

    if (includeSummaryStatus === 'true') {
      enrichedReports = await Promise.all(
        enrichedReports.map(async (report) => {
          let summaryInfo = {
            hasSummary: !!report.summary,
            summaryLength: report.summary ? report.summary.length : 0,
            hasKeyFindings: (report.keyFindings || []).length > 0,
            hasAbnormalFindings: (report.abnormalFindings || []).length > 0,
            hasSessionContext: !!report.sessionId
          };

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

// Get specific report details - Enhanced with file URL
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
        userId
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
        sessionId: true,
        filePath: true
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found or access denied'
      });
    }

    // Include conversation summary if exists
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

    res.json({
      success: true,
      report: {
        ...report,
        fileUrl: getFileUrl(report.filePath), // Generate accessible URL
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

// Delete report - Enhanced with unified file deletion
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

    // Update conversation if report was part of a session
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

    // Delete file using unified helper
    await deleteFile(report.filePath);

    // Delete from database
    await prisma.healthReport.delete({
      where: { id: reportId }
    });

    console.log(`Deleted report with unified cleanup:`, {
      reportId,
      userId,
      fileName: report.originalName,
      filePath: report.filePath,
      hadSession: !!report.sessionId
    });

    res.json({
      success: true,
      message: 'Report and associated files deleted successfully'
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
      categories,
      note: 'Categories will be automatically determined during document analysis'
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

// Get report analysis status - Enhanced with file URL
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
        sessionId: true,
        filePath: true
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found or access denied'
      });
    }

    // Include summary status
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
        fileUrl: getFileUrl(report.filePath),
        analysisStatus: report.analysisStatus,
        uploadedAt: report.uploadedAt,
        isComplete: report.analysisStatus === 'COMPLETED',
        isFailed: report.analysisStatus === 'FAILED',
        isProcessing: ['PENDING', 'PROCESSING'].includes(report.analysisStatus),
        summaryStatus // Include summary information
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