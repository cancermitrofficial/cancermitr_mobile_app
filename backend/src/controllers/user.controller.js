// src/controllers/user.controller.js - User Profile Management Only
import { prisma } from '../services/db.service.js';

function normalizeUserId(userId) {
  if (userId === null || userId === undefined || userId === '') return null;
  const n = typeof userId === 'number' ? userId : Number(String(userId).trim());
  if (Number.isNaN(n)) throw new Error(`Invalid userId: ${userId}`);
  return n;
}

// Get user profile
export const getUserProfile = async (req, res) => {
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
    res.status(500).json({ 
      success: false,
      error: "Error fetching user profile",
      message: error.message 
    });
  }
};

// Update user profile
export const updateUserProfile = async (req, res) => {
  try {
    const userId = normalizeUserId(req.user?.id);
    const { name, email, age, gender } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(age && { age: parseInt(age) }),
        ...(gender && { gender }),
        // updatedAt: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        phone: updatedUser.phone,
        name: updatedUser.name,
        email: updatedUser.email,
        age: updatedUser.age,
        gender: updatedUser.gender,
        updatedAt: updatedUser.updatedAt
      }
    });

  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({
      success: false,
      error: "Error updating user profile",
      message: error.message
    });
  }
};

// Get user statistics
export const getUserStats = async (req, res) => {
  try {
    const userId = normalizeUserId(req.user?.id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Get user statistics
    const [chatCount, reportCount, messageCount] = await Promise.all([
      prisma.chatSession.count({ where: { userId } }),
      prisma.healthReport.count({ where: { userId } }),
      prisma.chatMessage.count({ 
        where: { 
          session: { userId },
          messageType: 'USER'
        }
      })
    ]);

    const completedReports = await prisma.healthReport.count({
      where: { 
        userId,
        analysisStatus: 'COMPLETED'
      }
    });

    res.json({
      success: true,
      stats: {
        totalChatSessions: chatCount,
        totalReports: reportCount,
        completedReports,
        totalMessages: messageCount,
        userId
      }
    });

  } catch (error) {
    console.error("Error fetching user stats:", error);
    res.status(500).json({
      success: false,
      error: "Error fetching user statistics",
      message: error.message
    });
  }
};