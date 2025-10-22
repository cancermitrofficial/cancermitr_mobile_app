// routes/chat.routes.js
import express from "express";
import {
    createChatSession,
    handleQueryController,
    handleEnhancedQueryController,
    getChatHistory,
    getUserChatSessions,
    getSessionSummary,
    deleteChatSession,
    updateSessionTitle
} from "../controllers/chat.controller.js";
import { verifyToken } from "../middleware/verifyToken.middleware.js";
import { 
    createUnifiedStorage, 
    saveFilePathsMiddleware, 
    FILE_UPLOAD_CONFIGS 
} from "../middleware/fileStorage.middleware.js";

const router = express.Router();

// Create unified storage for chat files
const uploadChatFile = createUnifiedStorage(FILE_UPLOAD_CONFIGS.chat);

// Routes with unified file handling
router.post('/sessions', verifyToken, createChatSession);
router.get('/sessions', verifyToken, getUserChatSessions);
router.delete('/sessions/:sessionId', verifyToken, deleteChatSession);
router.put('/sessions/:sessionId/title', verifyToken, updateSessionTitle);

// Chat query routes with unified file upload
router.post('/query', 
    verifyToken, 
    uploadChatFile.single('file'), 
    saveFilePathsMiddleware, 
    handleQueryController
);
router.post('/sessions/:sessionId/messages', 
    verifyToken, 
    uploadChatFile.single('file'), 
    saveFilePathsMiddleware, 
    handleEnhancedQueryController
);

router.get('/sessions/:sessionId/history', verifyToken, getChatHistory);
router.get('/sessions/:sessionId/summary', verifyToken, getSessionSummary);

export default router;