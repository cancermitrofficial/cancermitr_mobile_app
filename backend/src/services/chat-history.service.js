// src/services/chat-history.service.js - FIXED VERSION
import { prisma } from "./db.service.js";
import { v4 as uuidv4 } from "uuid";
import { maybeSummarizeSegment, getLatestSummary } from "./summary.service.js";

let upsertChatMemory = null;
const ENABLE_QDRANT_MEMORY =
  String(process.env.ENABLE_QDRANT_MEMORY || "false").toLowerCase() === "true";
if (ENABLE_QDRANT_MEMORY) {
  try {
    // eslint-disable-next-line import/no-unresolved
    ({ upsertChatMemory } = await import("./qdrant.memory.service.js"));
  } catch (e) {
    console.warn(
      "Qdrant memory not available; skipping semantic memory upserts.",
      e.message
    );
  }
}

function normalizeUserId(val) {
  if (val === null || val === undefined || val === '') return null;
  // Accept numbers, numeric strings, reject others
  const n = typeof val === 'number' ? val : Number(String(val).trim());
  if (Number.isNaN(n)) {
    throw new Error(`Invalid userId: ${val}`);
  }
  return n;
}

export class ChatHistoryService {

  // Create new chat session
  static async createSession(userId = null) {
    const sessionId = uuidv4();

    console.log("🆕 Creating session:", { sessionId, userId });
    const normalizedUserId = normalizeUserId(userId);

    const session = await prisma.chatSession.create({
      data: {
        sessionId,
        userId: normalizedUserId,
        title: "New Chat",
      },
    });

    console.log("✅ Session created in DB:", session);
    return session;
  }

  static async nextMessageIndex(sessionId) {
    const last = await prisma.chatMessage.findFirst({
      where: { sessionId },
      orderBy: { messageIndex: "desc" },
      select: { messageIndex: true },
    });
    return (last?.messageIndex ?? 0) + 1;
  }

  static isMemoryWorthy({ messageType, content }) {
    if (!content) return false;
    const c = content.toLowerCase();
    if (c.length < 12) return false;
    // Simple heuristics
    const hints = [
      "plan",
      "decide",
      "confirm",
      "book",
      "schedule",
      "appointment",
      "allergy",
      "preference",
      "summary",
      "report",
      "file",
      "result",
      "finding",
    ];
    return messageType === "USER" || hints.some((h) => c.includes(h));
  }

  // FIXED: Save message with proper session reference
  static async saveMessage({
    sessionId,
    messageType,
    content,
    agentType = null,
    metadata = {},
    parentId = null,
    reportId = null,
    roleForMemory = null, // 'user' | 'assistant' | 'tool'
  }) {
    console.log("💾 Saving message:", {
      sessionId,
      messageType,
      contentLength: content?.length,
      agentType,
    });

    //verify the session exists
    const session = await prisma.chatSession.findUnique({
      where: { sessionId },
    });

    if (!session) {
      console.error("Session not found:", sessionId);
      throw new Error(`Session not found: ${sessionId}`);
    }

    console.log("Session found:", {
      sessionId: session.sessionId,
      id: session.id,
    });

    const messageIndex = await this.nextMessageIndex(sessionId);

    // Create message with session reference
    const message = await prisma.chatMessage.create({
      data: {
        sessionId: session.sessionId, // Use the sessionId field, not id
        messageType,
        agentType,
        content,
        metadata,
        parentId,
        reportId,
        messageIndex,
      },
    });

    console.log("✅ Message saved:", {
      messageId: message.id,
      sessionId: message.sessionId,
    });

    // Update session timestamp
    await prisma.chatSession.update({
      where: { sessionId },
      data: { updatedAt: new Date() },
    });

    if (
      ENABLE_QDRANT_MEMORY &&
      upsertChatMemory &&
      this.isMemoryWorthy({ messageType, content })
    ) {
      try {
        await upsertChatMemory({
          text: content,
          payload: {
            userId: session.userId || 0,
            sessionId,
            messageId: message.id,
            role:
              roleForMemory || (messageType === "USER" ? "user" : "assistant"),
            agentType: agentType || "NONE",
            ts: Date.now(),
            isDecision: /decid|confirm|book|schedule|plan/i.test(content || ""),
            entities: [], // optionally fill using an entity tagger
            tags: [],
            segment: Math.ceil(messageIndex / 10),
          },
        });
      } catch (e) {
        console.warn("Qdrant upsertChatMemory failed:", e.message);
      }
    }

    // Auto-generate title if it's the first user message
    if (messageType === "USER") {
      await this.updateSessionTitle(sessionId, content);
    }

    try {
      await maybeSummarizeSegment(sessionId);
    } catch (e) {
      console.warn("Summary generation failed:", e.message);
    }

    return message;
  }

  // Get conversation history with intelligent filtering
static async getAgentContext(
    sessionId,
    targetAgent = null,
    maxMessages = 20
  ) {
    console.log("Getting agent context:", {
      sessionId,
      targetAgent,
      maxMessages,
    });

    // Get recent conversation history (all message types)
    const recentMessages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { timestamp: "desc" },
      take: maxMessages * 2,
      include: { session: true },
    });

    console.log(`Raw messages retrieved: ${recentMessages.length}`);

    // Filter for meaningful conversation messages only
    const meaningfulMessages = recentMessages.filter(msg => {
      if (msg.messageType === 'USER') return true;
      if (msg.messageType === 'AGENT') return true;
      if (msg.messageType === 'ORCHESTRATOR') {
        const content = (msg.content || '').toLowerCase();
        return content.includes('error') || content.includes('failed') || 
               content.includes('switching') || content.includes('context');
      }
      if (msg.messageType === 'ERROR') return true;
      return false;
    });

    console.log(`Meaningful messages after filtering: ${meaningfulMessages.length}`);

    // Prioritize recent messages first, then add relevant older ones if needed
    let contextMessages = meaningfulMessages;
    
    if (targetAgent && meaningfulMessages.length > maxMessages) {
      // Get recent messages (always include - PRIORITY 1)
      const recent = meaningfulMessages.slice(0, Math.min(12, maxMessages));
      
      // Get older relevant messages for the specific agent (PRIORITY 2)
      const older = meaningfulMessages
        .slice(12)
        .filter(msg => this.isRelevantForAgent(msg, targetAgent))
        .slice(0, maxMessages - recent.length);
      
      contextMessages = [...recent, ...older];
      console.log(`Agent-specific filtering: recent=${recent.length}, older=${older.length}`);
    } else {
      contextMessages = meaningfulMessages.slice(0, maxMessages);
    }

    // Sort by timestamp (oldest first for proper conversation flow)
    const sortedMessages = contextMessages
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    console.log(`Final context messages: ${sortedMessages.length}`);

    // Get summary
    const summaryRow = await getLatestSummary(sessionId);
    const summary = summaryRow?.summary || "";

    console.log(`Summary present: ${!!summary}`);

    return { 
      summary, 
      messages: sortedMessages,
      totalAvailable: recentMessages.length,
      filtered: sortedMessages.length
    };
  }

  // Simple conversation history
  static async getConversationHistory(sessionId, limit = 20) {
    console.log("📜 Getting conversation history:", { sessionId, limit });

    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    console.log("📄 Messages found:", messages.length);
    return messages.reverse();
  }

  // Check if message is relevant for cross-agent context
static isRelevantForAgent(message, targetAgent) {
    if (!message.content) return false;

    const content = message.content.toLowerCase();

    // Always include user messages for context
    if (message.messageType === 'USER') return true;

    // Include messages from different agents for cross-context
    if (message.messageType === 'AGENT' && message.agentType !== targetAgent) {
      return true;
    }

    // Agent-specific keyword relevance
    const agentKeywords = {
      'PRODUCT_AGENT': [
        'product', 'treatment', 'therapy', 'medicine', 'supplement',
        'side effects', 'symptoms', 'pain', 'fatigue', 'nausea',
        'medication', 'dosage', 'relief', 'help with', 'recommend'
      ],
      'DOCUMENT_AGENT': [
        'cancer', 'tumor', 'oncology', 'diagnosis', 'prognosis',
        'stage', 'grade', 'chemotherapy', 'radiation', 'surgery',
        'explain', 'what is', 'how does', 'information', 'education'
      ],
      'REPORT_AGENT': [
        'report', 'test', 'result', 'lab', 'scan', 'analysis',
        'blood', 'urine', 'biopsy', 'pathology', 'findings',
        'abnormal', 'normal', 'levels', 'values', 'upload',
        'file', 'document', 'prescription', 'discharge'
      ]
    };

    const relevantKeywords = agentKeywords[targetAgent] || [];
    return relevantKeywords.some(keyword => content.includes(keyword));
  }

  // Remove duplicate messages
  static deduplicateMessages(messages) {
    const seen = new Set();
    return messages.filter((msg) => {
      const key = `${msg.messageType}-${msg.content.substring(0, 50)}-${
        msg.timestamp
      }`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Update session title
  static async updateSessionTitle(sessionId, firstMessage) {
    const existingSession = await prisma.chatSession.findUnique({
      where: { sessionId },
    });

    if (existingSession?.title === "New Chat") {
      const title =
        firstMessage.length > 50
          ? firstMessage.substring(0, 47) + "..."
          : firstMessage;

      await prisma.chatSession.update({
        where: { sessionId },
        data: { title },
      });

      console.log("📝 Session title updated:", { sessionId, title });
    }
  }

  // Get user's chat sessions
  static async getUserSessions(userId, limit = 20) {
    console.log("👤 Getting user sessions:", { userId, limit });

    if (!userId) {
      throw new Error("User ID is required");
    }
    const normalizedUserId = normalizeUserId(userId);

    const sessions = await prisma.chatSession.findMany({
      where: { userId: normalizedUserId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        messages: {
          take: 1,
          orderBy: { timestamp: "desc" },
          select: {
            content: true,
            timestamp: true,
            messageType: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    console.log("👤 User sessions found:", sessions.length);
    return sessions;
  }

   static async getUserSession(sessionId) {
    try {
      const session = await prisma.chatSession.findUnique({
        where: { sessionId },
        select: {
          userId: true,
          sessionId: true,
          title: true,
          createdAt: true
        }
      });

      return session;
    } catch (error) {
      console.error('Error getting user session:', error);
      return null;
    }
  }
}
