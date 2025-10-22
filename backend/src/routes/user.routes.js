// routes/user.routes.js
import express from "express";
import { 
    getUserProfile, 
    updateUserProfile,
    getUserStats
} from "../controllers/user.controller.js";
import { verifyToken } from "../middleware/verifyToken.middleware.js";

const router = express.Router();

router.get("/profile", verifyToken, getUserProfile);
router.put("/profile", verifyToken, updateUserProfile);
router.get("/stats", verifyToken, getUserStats);

export default router;
