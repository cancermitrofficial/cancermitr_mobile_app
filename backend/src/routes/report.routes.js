// routes/report.routes.js
import express from "express";
import {
    uploadReports,
    getUserReports,
    getReportDetails,
    deleteReport,
    getReportCategories,
    getReportStatus
} from "../controllers/report.controller.js";
import { verifyToken } from "../middleware/verifyToken.middleware.js";
import { 
    createUnifiedStorage, 
    saveFilePathsMiddleware, 
    FILE_UPLOAD_CONFIGS 
} from "../middleware/fileStorage.middleware.js";

const router = express.Router();

// Create unified storage for reports
const uploadReportFiles = createUnifiedStorage(FILE_UPLOAD_CONFIGS.reports);

// Routes with unified file handling
router.get('/', verifyToken, getUserReports);
router.post('/upload', 
    verifyToken, 
    uploadReportFiles.array('files', 5), 
    saveFilePathsMiddleware, 
    uploadReports
);
router.get('/categories', verifyToken, getReportCategories);
router.get('/:reportId', verifyToken, getReportDetails);
router.get('/:reportId/status', verifyToken, getReportStatus);
router.delete('/:reportId', verifyToken, deleteReport);

export default router;