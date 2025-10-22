// src/agents/report.agent.js

import { openai } from "../services/llm.service.js";
import fs from "fs/promises";
import path from "path";
import pdf from "pdf-parse";
import { prisma } from "../services/db.service.js";
import { handleProductQuery } from "./product.agent.js";

const MAIN_MODEL = "gpt-4o";
const FALLBACK_MODEL = "gpt-4o-mini";

const MAX_TOKENS_PER_REQUEST = 50000;
const CHUNK_SIZE = 30000;
const MAX_CHUNKS = 3;
const MAX_OUTPUT_TOKENS = 2000;

class ReportAgent {
  // Handle report-related queries (UNCHANGED - keeping your function structure)
  static async handleReportQuery(
    query,
    conversationHistory = [],
    sessionId,
    summary = ""
  ) {
    try {
      console.log("Report Agent handling query:", query);

      const session = await prisma.chatSession.findUnique({
        where: { sessionId },
        select: { userId: true },
      });

      if (!session) {
        throw new Error("Session not found");
      }

      const userReports = await this.getUserReports(session.userId, {
        limit: 10,
      });
      const completedReports = userReports.filter(
        (r) => r.analysisStatus === "COMPLETED"
      );

      if (completedReports.length === 0) {
        return {
          answer:
            "I don't see any completed medical reports in your account yet. Please upload your medical reports so I can analyze them and provide insights.",
          source: "report",
          documents: [],
          reportsReferenced: [],
        };
      }

      const detailedReports = await Promise.all(
        completedReports.slice(0, 5).map((r) => this.getReportStatus(r.id))
      );

      const reportsContext = this.buildReportsContext(detailedReports);
      const conversationContext = this.buildConversationContext(
        conversationHistory,
        summary
      );

      const response = await this.generateReportResponse(
        query,
        reportsContext,
        conversationContext
      );

      let productSuggestions = null;
      if (this.shouldSuggestProducts(response.analysis)) {
        productSuggestions = await this.getProductSuggestions(
          response.analysis,
          sessionId,
          summary
        );
      }

      return {
        answer:
          response.answer +
          (productSuggestions ? `\n\n${productSuggestions.suggestions}` : ""),
        source: "report",
        documents: detailedReports.map((r) => ({
          id: r.id,
          name: r.originalName,
          summary: r.summary,
          keyFindings: r.keyFindings,
        })),
        reportsReferenced: detailedReports.map((r) => r.id),
        productSuggestionsIncluded: !!productSuggestions,
        analysisType: response.analysisType || "general",
      };
    } catch (error) {
      console.error("Error in handleReportQuery:", error);
      return {
        answer:
          "I encountered an error while analyzing your reports. Please try again or contact support.",
        source: "report",
        documents: [],
        error: true,
      };
    }
  }

  // Context building methods (UNCHANGED)
  static buildReportsContext(reports) {
    return reports
      .map((report) => {
        const findings = Array.isArray(report.keyFindings)
          ? report.keyFindings
          : [];
        const abnormal = Array.isArray(report.abnormalFindings)
          ? report.abnormalFindings
          : [];
        const labValues = Array.isArray(report.labValues)
          ? report.labValues
          : [];

        return `
REPORT: ${report.originalName}
Summary: ${report.summary || "No summary available"}
Key Findings: ${findings.join(", ") || "None specified"}
Lab Values: ${
          labValues
            .map((v) => `${v.name}: ${v.value} ${v.unit} (${v.status})`)
            .join(", ") || "None"
        }
Abnormal Findings: ${abnormal.join(", ") || "None specified"}
---`.trim();
      })
      .join("\n\n");
  }

  static buildConversationContext(conversationHistory, summary) {
    let context = "";

    if (conversationHistory && conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-4).map((msg) => {
        const role = msg.messageType === "USER" ? "User" : "Assistant";
        return `${role}: ${msg.content.substring(0, 150)}`;
      });
      context += `Recent Conversation:\n${recentMessages.join("\n")}\n\n`;
    }

    if (summary) {
      context += `Background (User's Journey):\n${summary}\n\n`;
    }

    return context;
  }

  // Response generation (UPDATED to use gpt-4o)
  static async generateReportResponse(
    query,
    reportsContext,
    conversationContext
  ) {
    const prompt = `You are CancerMitr's medical report analysis specialist. Answer the user's question about their medical reports.

${conversationContext}

USER'S MEDICAL REPORTS:
${reportsContext}

USER QUESTION: ${query}

Instructions:
- Provide clear, helpful insights about their medical reports
- Reference specific findings from their reports when relevant
- If they ask about deficiencies or abnormal values, be specific about what you found
- Suggest when they should follow up with their healthcare team
- If you identify concerning patterns or deficiencies, mention them clearly
- Use empathetic, supportive language while being medically accurate
- If reports show nutritional deficiencies, vitamin shortages, or other treatable conditions, mention these specifically

Format your response to be helpful and actionable while encouraging medical consultation for treatment decisions.`;

    const response = await openai.chat.completions.create({
      model: MAIN_MODEL,
      temperature: 0.1,
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const answer = response.choices[0].message.content;
    const analysisType = this.classifyResponseType(answer);

    return {
      answer,
      analysis: answer,
      analysisType,
    };
  }

  // Classification and product suggestion methods (UNCHANGED)
  static classifyResponseType(response) {
    const lower = response.toLowerCase();

    if (
      lower.includes("deficiency") ||
      lower.includes("deficient") ||
      lower.includes("low levels") ||
      lower.includes("shortage")
    ) {
      return "deficiency";
    }

    if (
      lower.includes("abnormal") ||
      lower.includes("concerning") ||
      lower.includes("elevated") ||
      lower.includes("high levels")
    ) {
      return "abnormal";
    }

    if (
      lower.includes("symptom") ||
      lower.includes("side effect") ||
      lower.includes("nausea") ||
      lower.includes("fatigue") ||
      lower.includes("pain")
    ) {
      return "symptom";
    }

    return "general";
  }

  static shouldSuggestProducts(analysis) {
    const indicators = [
      "deficiency",
      "deficient",
      "low levels",
      "shortage",
      "supplement",
      "vitamin",
      "mineral",
      "protein",
      "fatigue",
      "nausea",
      "pain",
      "weakness",
      "immune support",
      "nutrition",
    ];

    const lower = analysis.toLowerCase();
    return indicators.some((indicator) => lower.includes(indicator));
  }

  static async getProductSuggestions(analysis, sessionId, summary) {
    try {
      const productQuery = this.extractProductSearchTerms(analysis);

      if (!productQuery) {
        return null;
      }

      console.log("Getting product suggestions for:", productQuery);

      const productResult = await handleProductQuery(
        `Based on my medical reports: ${productQuery}`,
        [],
        sessionId,
        summary
      );

      if (productResult.documents && productResult.documents.length > 0) {
        const suggestions = this.formatProductSuggestions(
          productResult.documents.slice(0, 3)
        );
        return {
          suggestions,
          productsFound: productResult.documents.length,
        };
      }

      return null;
    } catch (error) {
      console.error("Error getting product suggestions:", error);
      return null;
    }
  }

  static extractProductSearchTerms(analysis) {
    const terms = [];
    const lower = analysis.toLowerCase();

    const deficiencyPatterns = [
      /vitamin ([a-z0-9]+) deficiency/gi,
      /([a-z]+) deficiency/gi,
      /low ([a-z\s]+) levels/gi,
      /(iron|calcium|protein|vitamin|mineral) shortage/gi,
    ];

    deficiencyPatterns.forEach((pattern) => {
      const matches = analysis.match(pattern);
      if (matches) terms.push(...matches);
    });

    const symptomPatterns = [
      "fatigue",
      "nausea",
      "pain",
      "weakness",
      "appetite loss",
      "immune support",
      "energy",
      "nutrition",
      "protein",
    ];

    symptomPatterns.forEach((symptom) => {
      if (lower.includes(symptom)) {
        terms.push(symptom);
      }
    });

    return terms.length > 0 ? terms.join(" ") : null;
  }

  static formatProductSuggestions(products) {
    if (!products || products.length === 0) {
      return "";
    }

    let suggestions =
      "\n🛍️ **Product Recommendations Based on Your Reports:**\n\n";

    products.forEach((product, index) => {
      suggestions += `${index + 1}. **${product.name}**\n`;
      if (product.description) {
        suggestions += `   ${product.description.substring(0, 100)}...\n`;
      }
      if (product.price) {
        suggestions += `   Price: ₹${product.price}\n`;
      }
      suggestions += "\n";
    });

    suggestions +=
      "*Note: These are suggestions based on your report analysis. Please consult your healthcare provider before starting any new supplements or treatments.*";

    return suggestions;
  }

  // MAIN PROCESSING FUNCTION (UPDATED for unified storage)
  static async processReports(files, userId, options = {}) {
    const { sessionId = null, source = "direct" } = options;

    console.log(
      `Processing ${files.length} report(s) for user ${userId} with unified storage and gpt-4o`
    );

    const results = [];

    for (const file of files) {
      try {
        const result = await this.processSingleReport(file, userId, {
          sessionId,
          source,
        });
        results.push(result);
      } catch (error) {
        console.error(
          `Error processing file ${file.originalname}:`,
          error.message
        );
        results.push({
          success: false,
          filename: file.originalname,
          error: error.message,
        });
      }
    }

    return results;
  }

  // PROCESS SINGLE REPORT (UPDATED for unified storage)
  static async processSingleReport(file, userId, options) {
    const { sessionId, source } = options;

    console.log("Processing single report with unified storage:", {
      originalname: file.originalname,
      path: file.path || file.relativePath,
      size: file.size,
      temporaryCategory: 'OTHERS', 
      storedName: file.storedName,
    });

    // File is already saved to disk by multer middleware
    const filePath = file.relativePath || file.path;
    const temporaryCategory = "OTHERS";

    // Create database record with PENDING status
    const healthReport = await this.createHealthReportRecord({
      userId,
      sessionId,
      originalName: file.originalname,
      storedName: file.storedName || path.basename(filePath),
      filePath: filePath,
      fileSize: file.size,
      mimeType: file.mimetype,
      category: temporaryCategory,
    });

    // Process with unified document processing (async)
    this.processReportAsync(
      healthReport.id,
      filePath,
      file.mimetype,
      file.originalname,
      userId
    );

    return {
      success: true,
      reportId: healthReport.id,
      filename: file.originalname,
      category: temporaryCategory,
      status: "PENDING",
      note: "Category will be determined during document analysis",
    };
  }

  // CREATE DATABASE RECORD (UNCHANGED)
  static async createHealthReportRecord(data) {
    return await prisma.healthReport.create({
      data: {
        userId: data.userId,
        sessionId: data.sessionId,
        category: data.category,
        originalName: data.originalName,
        storedName: data.storedName,
        filePath: data.filePath,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        analysisStatus: "PENDING",
      },
    });
  }

  // ASYNC PROCESSING (UPDATED with unified processing and fallback)
  static async processReportAsync(
    reportId,
    filePath,
    mimeType,
    originalName,
    userId
  ) {
    try {
      console.log(
        `Starting unified processing for report ${reportId} at ${filePath}`
      );

      await prisma.healthReport.update({
        where: { id: reportId },
        data: { analysisStatus: "PROCESSING" },
      });

      // Unified document processing
      const analysis = await this.processDocument(
        filePath,
        mimeType,
        originalName
      );

      const { moveFileToCategory } = await import(
        "../middleware/fileStorage.middleware.js"
      );
      const moveResult = await moveFileToCategory(
        filePath,
        userId,
        analysis.category,
        originalName
      );

      if (!moveResult.success) {
        console.warn(
          `Failed to move file to category folder: ${moveResult.error}`
        );
      }

      await prisma.healthReport.update({
        where: { id: reportId },
        data: {
          analysisStatus: "COMPLETED",
          category: analysis.category,
          filePath: moveResult.success ? moveResult.newRelativePath : filePath,
          summary: analysis.summary,
          keyFindings: analysis.keyFindings,
          recommendations: analysis.recommendations,
          labValues: analysis.labValues,
          abnormalFindings: analysis.abnormalFindings,
        },
      });

      console.log(
        `Completed processing for report ${reportId} category ${analysis.category}`
      );
    } catch (error) {
      console.error(
        `Error in async processing for report ${reportId}:`,
        error.message
      );

      // Enhanced error handling with fallback
      try {
        if (this.isTokenError(error)) {
          console.log("Token limit exceeded, trying fallback processing...");
          const fallbackAnalysis = await this.processFallback(
            filePath,
            mimeType,
            originalName
          );

          const { moveFileToCategory } = await import(
            "../middleware/fileStorage.middleware.js"
          );
          const moveResult = await moveFileToCategory(
            filePath,
            userId,
            fallbackAnalysis.category,
            originalName
          );

          await prisma.healthReport.update({
            where: { id: reportId },
            data: {
              analysisStatus: "COMPLETED",
              category: fallbackAnalysis.category,
              filePath: moveResult.success
                ? moveResult.newRelativePath
                : filePath,
              summary: fallbackAnalysis.summary,
              keyFindings: fallbackAnalysis.keyFindings,
              recommendations: fallbackAnalysis.recommendations,
              labValues: fallbackAnalysis.labValues || [],
              abnormalFindings: fallbackAnalysis.abnormalFindings || [],
            },
          });

          console.log(`Completed fallback processing for report ${reportId}`);
          return;
        }

        throw error; // Re-throw non-token errors
      } catch (fallbackError) {
        console.error(
          "Fallback processing also failed:",
          fallbackError.message
        );
        await this.markReportAsFailed(reportId, error.message);
      }
    }
  }

  // UNIFIED DOCUMENT PROCESSING (NEW - handles all file types with gpt-4o)
  static async processDocument(filePath, mimeType, originalName) {
    console.log(
      `Processing document with unified gpt-4o approach: ${originalName}`
    );

    let content = "";
    let isImage = false;

    try {
      // Extract content based on file type
      if (mimeType === "application/pdf") {
        content = await this.extractPDFText(filePath);
        console.log(`PDF text extracted: ${content.length} characters`);
      } else if (mimeType.startsWith("image/")) {
        isImage = true;
        content = await this.prepareImageForAnalysis(filePath, mimeType);
        console.log("Image prepared for vision analysis");
      } else if (this.isTextFile(mimeType)) {
        const fileBuffer = await fs.readFile(filePath);
        content = fileBuffer.toString("utf-8");
        console.log(`Text file read: ${content.length} characters`);
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }

      // Process the content with appropriate method
      if (isImage) {
        return this.analyzeWithVision(content, originalName);
      } else {
        return this.analyzeText(content, originalName);
      }
    } catch (error) {
      console.error(
        `Error in unified document processing for ${originalName}:`,
        error.message
      );
      throw error;
    }
  }

  // PDF TEXT EXTRACTION (NEW - using pdf-parse)
  static async extractPDFText(filePath) {
    try {
      console.log("Extracting text from PDF using pdf-parse");
      const fileBuffer = await fs.readFile(filePath);
      const data = await pdf(fileBuffer);

      console.log(
        `PDF parsed successfully: ${data.text.length} characters extracted`
      );

      if (data.text.length < 100) {
        throw new Error("PDF contains very little readable text");
      }

      return data.text;
    } catch (error) {
      console.error(
        "PDF parsing failed, attempting fallback text extraction:",
        error.message
      );

      // Fallback to basic text extraction
      const fileBuffer = await fs.readFile(filePath);
      const fallbackText = fileBuffer
        .toString("utf-8")
        .replace(/[\x00-\x1F\x7F-\x9F]/g, " ") // Remove control characters
        .replace(/[^\w\s.,;:()-]/g, " ") // Keep only basic punctuation
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim()
        .substring(0, 8000); // Limit fallback text

      if (fallbackText.length < 100) {
        throw new Error("Unable to extract readable text from PDF");
      }

      console.log(
        `Fallback text extraction: ${fallbackText.length} characters`
      );
      return fallbackText;
    }
  }

  // IMAGE PREPARATION (NEW)
  static async prepareImageForAnalysis(filePath, mimeType) {
    const fileBuffer = await fs.readFile(filePath);
    const base64Image = fileBuffer.toString("base64");
    return `data:${mimeType};base64,${base64Image}`;
  }

  // VISION ANALYSIS (UPDATED to use gpt-4o)
  static async analyzeWithVision(imageData, originalName) {
    console.log("Analyzing document with gpt-4o vision capabilities");

    const prompt = `Analyze this medical document image and extract key information.
    
IMPORTANT: First categorize this document into ONE of these categories:
- INSURANCE_DOCUMENT: Insurance cards, policy documents, claim forms
- INVESTIGATIONS_REPORTS: Lab reports, X-rays, MRI, CT scans, blood tests
- PRESCRIPTIONS_PROTOCOLS: Prescriptions, treatment protocols, medication lists
- COST_ESTIMATE: Cost estimates, bills, invoices, payment receipts
- DISCHARGE_SUMMARY: Discharge summaries, hospital discharge papers
- OTHERS: Any other medical documents

Provide your analysis in JSON format:
{
  "category": "INVESTIGATIONS_REPORTS",  // ← ADD THIS
  "summary": "Brief 10-15 sentence summary",
  "keyFindings": [...],
  "recommendations": [...],
  "labValues": [...],
  "abnormalFindings": [...]
}`;

    try {
      const response = await openai.chat.completions.create({
        model: MAIN_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.1,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageData } },
            ],
          },
        ],
      });

      return this.parseAnalysisResponse(response.choices[0].message.content);
    } catch (error) {
      if (this.isTokenError(error)) {
        console.log(
          "Vision analysis hit token limit, using simplified analysis"
        );
        return this.createSimplifiedAnalysis(originalName, "image");
      }
      throw error;
    }
  }

  // TEXT ANALYSIS (UPDATED with smart chunking for gpt-4o)
  static async analyzeText(textContent, originalName) {
    console.log(
      `Analyzing text content with gpt-4o: ${textContent.length} characters`
    );

    const estimatedTokens = Math.ceil(textContent.length / 4);
    console.log(`Estimated tokens: ${estimatedTokens}`);

    // If content fits in single request, process directly
    if (estimatedTokens < MAX_TOKENS_PER_REQUEST) {
      return this.analyzeSingleText(textContent, originalName);
    }

    // Otherwise, use smart chunking
    console.log("Content requires chunking for optimal processing");
    return this.analyzeTextWithChunking(textContent, originalName);
  }

  // SINGLE TEXT ANALYSIS (NEW)
  static async analyzeSingleText(textContent, originalName) {
    const prompt = `Analyze this medical document and extract key information:

${textContent}

IMPORTANT: First categorize this document into ONE of these categories:
- INSURANCE_DOCUMENT, INVESTIGATIONS_REPORTS, PRESCRIPTIONS_PROTOCOLS, 
  COST_ESTIMATE, DISCHARGE_SUMMARY, OTHERS

Provide analysis in JSON format:
{
"category": "INVESTIGATIONS_REPORTS",
"summary": "Brief 10-15 sentence summary",
"keyFindings": ["List of key medical findings"],
"recommendations": ["List of recommendations"],
"labValues": [{"name": "Test Name", "value": "Value", "unit": "Unit", "normal": "Normal Range", "status": "Normal/Abnormal"}],
"abnormalFindings": ["List of abnormal findings"]
}`;

    try {
      const response = await openai.chat.completions.create({
        model: MAIN_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }],
      });

      return this.parseAnalysisResponse(response.choices[0].message.content);
    } catch (error) {
      if (this.isTokenError(error)) {
        console.log(
          "Single text analysis hit token limit, falling back to chunking"
        );
        return this.analyzeTextWithChunking(textContent, originalName);
      }
      throw error;
    }
  }

  // CHUNKED TEXT ANALYSIS (UPDATED for gpt-4o)
  static async analyzeTextWithChunking(textContent, originalName) {
    console.log("Processing with smart chunking for gpt-4o");

    const chunks = this.createSmartChunks(textContent);
    console.log(
      `Created ${chunks.length} chunks, processing first ${Math.min(
        chunks.length,
        MAX_CHUNKS
      )}`
    );

    const analyses = [];

    for (let i = 0; i < Math.min(chunks.length, MAX_CHUNKS); i++) {
      try {
        console.log(
          `Processing chunk ${i + 1}/${Math.min(chunks.length, MAX_CHUNKS)}`
        );

        const chunkAnalysis = await this.analyzeChunk(
          chunks[i],
          i + 1,
          chunks.length
        );
        analyses.push(chunkAnalysis);

        // Reasonable delay between chunks
        if (i < Math.min(chunks.length, MAX_CHUNKS) - 1) {
          await this.delay(2000);
        }
      } catch (error) {
        console.error(`Error processing chunk ${i + 1}:`, error.message);

        if (this.isTokenError(error)) {
          console.log("Chunk processing hit token limit, stopping");
          break;
        }
      }
    }

    if (analyses.length === 0) {
      return this.createSimplifiedAnalysis(originalName, "text");
    }

    return this.combineAnalyses(analyses);
  }

  // SMART CHUNKING (NEW - preserves context better than character-based chunking)
  static createSmartChunks(text) {
    const chunks = [];
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

    let currentChunk = "";

    for (const sentence of sentences) {
      if (
        (currentChunk + sentence).length > CHUNK_SIZE &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence + ". ";
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  // ANALYZE SINGLE CHUNK (UPDATED)
  static async analyzeChunk(chunkText, chunkNumber, totalChunks) {
    // Only ask for category in first chunk
    const categoryInstruction =
      chunkNumber === 1
        ? `
IMPORTANT: Since this is the first section, categorize this document:
- INSURANCE_DOCUMENT, INVESTIGATIONS_REPORTS, PRESCRIPTIONS_PROTOCOLS, 
  COST_ESTIMATE, DISCHARGE_SUMMARY, OTHERS
`
        : "";

    const prompt = `Analyze this section (${chunkNumber}/${totalChunks}) of a medical document:

${chunkText}
${categoryInstruction}
Extract key information in JSON format:
{
  ${chunkNumber === 1 ? `"category": "INVESTIGATIONS_REPORTS",` : ""}
  "summary": "Key points from this section",
  "keyFindings": ["Important findings"],
  "recommendations": ["Any recommendations"],
  "labValues": [{"name": "Test", "value": "Value", "unit": "Unit", "status": "Status"}],
  "abnormalFindings": ["Abnormal findings"]
}`;

    const response = await openai.chat.completions.create({
      model: MAIN_MODEL,
      max_tokens: 1200,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    });

    return this.parseAnalysisResponse(response.choices[0].message.content);
  }

  // COMBINE ANALYSES (IMPROVED)
  static combineAnalyses(analyses) {
    const combined = {
      category: analyses[0]?.category || 'OTHERS',
      summary: "",
      keyFindings: [],
      recommendations: [],
      labValues: [],
      abnormalFindings: [],
    };

    // Combine summaries
    const summaries = analyses.map((a) => a.summary).filter((s) => s);
    combined.summary = summaries.join(" ").substring(0, 600);

    // Combine and deduplicate arrays
    analyses.forEach((analysis) => {
      if (analysis.keyFindings)
        combined.keyFindings.push(...analysis.keyFindings);
      if (analysis.recommendations)
        combined.recommendations.push(...analysis.recommendations);
      if (analysis.labValues) combined.labValues.push(...analysis.labValues);
      if (analysis.abnormalFindings)
        combined.abnormalFindings.push(...analysis.abnormalFindings);
    });

    // Deduplicate and limit
    combined.keyFindings = [...new Set(combined.keyFindings)].slice(0, 15);
    combined.recommendations = [...new Set(combined.recommendations)].slice(
      0,
      10
    );
    combined.abnormalFindings = [...new Set(combined.abnormalFindings)].slice(
      0,
      10
    );

    return combined;
  }

  // FALLBACK PROCESSING (NEW)
  static async processFallback(filePath, mimeType, originalName) {
    console.log("Using fallback processing with gpt-4o-mini");

    try {
      if (mimeType === "application/pdf") {
        // Try minimal PDF text extraction
        const fileBuffer = await fs.readFile(filePath);
        const textSample = fileBuffer
          .toString("utf-8")
          .replace(/[^\w\s.,;:()-]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 2000); // Very small sample

        if (textSample.length > 100) {
          const prompt = `Analyze this small sample from medical PDF "${originalName}":

${textSample}

Categorize and provide a brief analysis in JSON:
{
  "category": "INVESTIGATIONS_REPORTS",
  "summary": "Brief description based on available sample",
  "keyFindings": ["Any findings visible"],
  "recommendations": ["Basic recommendation"],
  "labValues": [],
  "abnormalFindings": []
}
  Categories:INSURANCE_DOCUMENT, INVESTIGATIONS_REPORTS, PRESCRIPTIONS_PROTOCOLS, 
            COST_ESTIMATE, DISCHARGE_SUMMARY, OTHERS`;

          const response = await openai.chat.completions.create({
            model: FALLBACK_MODEL,
            max_tokens: 600,
            temperature: 0.1,
            messages: [{ role: "user", content: prompt }],
          });

          return this.parseAnalysisResponse(
            response.choices[0].message.content
          );
        }
      }

      return this.createSimplifiedAnalysis(
        originalName,
        this.isImageFile(mimeType) ? "image" : "document"
      );
    } catch (error) {
      console.error("Fallback processing failed:", error.message);
      return this.createSimplifiedAnalysis(originalName, "document");
    }
  }

  // HELPER METHODS
  static isTokenError(error) {
    return (
      error.message.includes("token") ||
      error.message.includes("429") ||
      error.code === "rate_limit_exceeded"
    );
  }

  static createSimplifiedAnalysis(originalName, type) {
    return {
      category: 'OTHERS',
      summary: `Medical ${type} "${originalName}" processed successfully. Basic analysis completed due to processing constraints.`,
      keyFindings: ["Document processed and stored successfully"],
      recommendations: [
        "Please consult with your healthcare provider for detailed interpretation",
      ],
      labValues: [],
      abnormalFindings: ["Manual review recommended for detailed analysis"],
    };
  }

  static async markReportAsFailed(reportId, errorMessage) {
    await prisma.healthReport.update({
      where: { id: reportId },
      data: {
        analysisStatus: "FAILED",
        summary: `Processing failed: ${errorMessage.substring(0, 200)}`,
      },
    });
  }

  static delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static isImageFile(mimeType) {
    return mimeType.startsWith("image/");
  }

  static isTextFile(mimeType) {
    return (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType.includes("text")
    );
  }

  // RESPONSE PARSING (UNCHANGED)
  static parseAnalysisResponse(analysisText) {
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          category: parsed.category || "OTHERS",
          summary: parsed.summary || null,
          keyFindings: parsed.keyFindings || [],
          recommendations: parsed.recommendations || [],
          labValues: parsed.labValues || [],
          abnormalFindings: parsed.abnormalFindings || [],
        };
      }

      return {
        category: "OTHERS",
        summary: analysisText.substring(0, 500),
        keyFindings: [],
        recommendations: [],
        labValues: [],
        abnormalFindings: [],
      };
    } catch (error) {
      console.error("Error parsing analysis response:", error.message);
      return {
        category: "OTHERS",
        summary: "Analysis completed but parsing failed",
        keyFindings: [],
        recommendations: [],
        labValues: [],
        abnormalFindings: [],
      };
    }
  }

  // STATUS AND RETRIEVAL METHODS (UNCHANGED)
  static async getReportStatus(reportId) {
    const report = await prisma.healthReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        analysisStatus: true,
        summary: true,
        keyFindings: true,
        recommendations: true,
        labValues: true,
        abnormalFindings: true,
        uploadedAt: true,
        originalName: true,
      },
    });

    return report;
  }

  static async getUserReports(userId, options = {}) {
    const { category, limit = 20, offset = 0 } = options;

    const where = { userId };
    if (category) {
      where.category = category;
    }

    const reports = await prisma.healthReport.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        category: true,
        originalName: true,
        analysisStatus: true,
        summary: true,
        uploadedAt: true,
        fileSize: true,
      },
    });

    return reports;
  }
}

export { ReportAgent };
