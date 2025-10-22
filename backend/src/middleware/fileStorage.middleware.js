// middleware/fileStorage.middleware.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

/**
 * Unified file storage handler for both chat and report uploads
 * Creates consistent directory structure: uploads/user_{userId}/{category}/{filename}
 */

// Category mapping for different upload sources
const CATEGORY_MAPPING = {
  // Report categories (DB enum -> folder name)
  'INSURANCE_DOCUMENT': 'insurance_documents',
  'INVESTIGATIONS_REPORTS': 'investigations_reports',
  'PRESCRIPTIONS_PROTOCOLS': 'prescriptions_protocols',
  'COST_ESTIMATE': 'cost_estimates',
  'DISCHARGE_SUMMARY': 'discharge_summaries',
  'OTHERS': 'others',
  // Chat categories
  'chat': 'chat_files',
  'temporary': 'temp_files'
};

// Valid database categories (must match your Prisma enum exactly)
const VALID_DB_CATEGORIES = [
  'INSURANCE_DOCUMENT',
  'INVESTIGATIONS_REPORTS', 
  'PRESCRIPTIONS_PROTOCOLS',
  'COST_ESTIMATE',
  'DISCHARGE_SUMMARY',
  'OTHERS'
];

/**
 * Generate consistent file path structure
 * @param {number} userId - User ID
 * @param {string} category - File category
 * @param {string} originalName - Original filename
 * @returns {Object} - {directory, filename, fullPath, normalizedCategory, dbCategory, originalName}
 */
export function generateFilePath(userId, category = 'others', originalName = 'file') {
  console.log('generateFilePath received:', { userId, category, originalName });
    console.log('🔍 generateFilePath DEBUG:');
  console.log('Input category:', category);
  console.log('Input userId:', userId);
  console.log('Input originalName:', originalName);
  
  
  // Validate and ensure category matches DB enum for reports
  const dbCategory = VALID_DB_CATEGORIES.includes(category) ? category : (category === 'others' ? 'others' : 'OTHERS');
  
  // Normalize category for folder structure
  const normalizedCategory = CATEGORY_MAPPING[dbCategory] || CATEGORY_MAPPING['OTHERS'] || 'others';
  
  // Generate unique filename
  const uniqueSuffix = crypto.randomBytes(16).toString('hex');
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `${baseName}-${Date.now()}-${uniqueSuffix}${ext}`;
  
  // Create directory path
  const directory = path.join('uploads', `user_${userId}`, normalizedCategory);
  const fullPath = path.join(directory, filename);
  
  console.log('Generated file path:', { 
    dbCategory, 
    normalizedCategory, 
    directory, 
    filename,
    fullPath 
  });
  
  return {
    directory,
    filename,
    fullPath,
    normalizedCategory,
    dbCategory,      // For database storage
    originalName
  };
}

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path to create
 */
export function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log('Created directory:', dirPath);
  }
}

/**
 * Create multer storage configuration
 * @param {Object} options - Configuration options
 * @param {Function} options.categoryResolver - Function to determine category from request
 * @param {number} options.maxFileSize - Maximum file size in bytes
 * @param {string[]} options.allowedMimeTypes - Allowed MIME types
 */
export function createUnifiedStorage(options = {}) {
  const {
    maxFileSize = 25 * 1024 * 1024, // 25MB default
    allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp', 
      'image/tiff',
      'text/plain',
      'text/csv',
      'application/json',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  } = options;

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        // Get user ID from verified token
        const userId = req.user?.id;
        if (!userId) {
          return cb(new Error('User authentication required'), null);
        }

        // Resolve category
        const category= 'OTHERS';
        console.log('Using Others as temporary category', category);
        
        // Generate file path
        const pathInfo = generateFilePath(userId, category, file.originalname);
        
        // Ensure directory exists
        ensureDirectoryExists(pathInfo.directory);
        
        // Store path info in request for later use
        if (!req.filePathInfo) req.filePathInfo = {};
        req.filePathInfo[file.fieldname] = { 
          directory: pathInfo.directory, 
          category: pathInfo.dbCategory,           // Store DB category for database
          normalizedCategory: pathInfo.normalizedCategory
        };
        
        console.log('Stored file path info:', req.filePathInfo[file.fieldname]);
        
        cb(null, pathInfo.directory);
      } catch (error) {
        console.error('Error in destination callback:', error);
        cb(error, null);
      }
    },
    
    filename: (req, file, cb) => {
      try {
        const userId = req.user?.id;
        const category = 'OTHERS';
        
        const pathInfo = generateFilePath(userId, category, file.originalname);
        
        console.log('Filename generated:', pathInfo.filename);
        
        cb(null, pathInfo.filename);
      } catch (error) {
        console.error('Error in filename callback:', error);
        cb(error, null);
      }
    }
  });

  return multer({
    storage,
    limits: {
      fileSize: maxFileSize,
      files: 5 // Maximum 5 files
    },
    fileFilter: (req, file, cb) => {
      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} not supported`), false);
      }
    }
  });
}

/**
 * Middleware to save file paths to database
 * Call this after multer processing to ensure file paths are stored consistently
 */
export function saveFilePathsMiddleware(req, res, next) {
  console.log('saveFilePathsMiddleware - processing files');
  
  // Add file path information to request for controllers to use
  if (req.files && Array.isArray(req.files)) {
    req.processedFiles = req.files.map(file => {
      const fileInfo = {
        ...file,
        relativePath: file.path.replace(/\\/g, '/'), // Normalize path separators
        category: req.filePathInfo?.[file.fieldname]?.category || 'OTHERS',
        normalizedCategory: req.filePathInfo?.[file.fieldname]?.normalizedCategory || 'others',
        storedName: path.basename(file.path), // Add storedName for database
        userId: req.user?.id
      };
      
      console.log('Processed file info:', {
        originalname: fileInfo.originalname,
        category: fileInfo.category,
        relativePath: fileInfo.relativePath,
        storedName: fileInfo.storedName
      });
      
      return fileInfo;
    });
  } else if (req.file) {
    req.processedFile = {
      ...req.file,
      relativePath: req.file.path.replace(/\\/g, '/'),
      category: req.filePathInfo?.[req.file.fieldname]?.category || 'OTHERS',
      normalizedCategory: req.filePathInfo?.[req.file.fieldname]?.normalizedCategory || 'others',
      storedName: path.basename(req.file.path), // Add storedName for database
      userId: req.user?.id
    };
    
    console.log('Processed single file info:', {
      originalname: req.processedFile.originalname,
      category: req.processedFile.category,
      relativePath: req.processedFile.relativePath,
      storedName: req.processedFile.storedName
    });
  }
  
  next();
}

/**
 * Predefined configurations for different upload types
 */
export const FILE_UPLOAD_CONFIGS = {
  // For report uploads - FIXED to validate enum values
  reports: {
    categoryResolver: (req) => {
      console.log('Using OTHERS folders temporary');                         
      return 'OTHERS';
    },
    maxFileSize: 25 * 1024 * 1024,
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/tiff',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  },
  
  // For chat uploads
  chat: {
    categoryResolver: () => 'OTHERS',
    maxFileSize: 10 * 1024 * 1024,
    allowedMimeTypes: [
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
    ]
  }
};

/**
 * Helper function to get file URL for serving
 * @param {string} filePath - Relative file path
 * @returns {string} - URL path for serving static files
 */
export function getFileUrl(filePath) {
  if (!filePath) return null;
  // Convert to URL format and ensure it starts with /uploads
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.startsWith('/uploads') ? normalizedPath : `/${normalizedPath}`;
}

/**
 * Helper function to delete file
 * @param {string} filePath - File path to delete
 */
export async function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log(`File deleted: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to delete file ${filePath}:`, error);
    return false;
  }
}

export async function moveFileToCategory(oldPath, userId, newCategory, originalName) {
  try {
    console.log('Moving file to correct category:', { oldPath, newCategory });
    
    // Validate category
    const validCategory = VALID_DB_CATEGORIES.includes(newCategory) ? newCategory : 'OTHERS';
    
    // Generate new path
    const pathInfo = generateFilePath(userId, validCategory, originalName);
    
    // Ensure new directory exists
    ensureDirectoryExists(pathInfo.directory);
    
    const newPath = pathInfo.fullPath;
    
    // Move file
    await fs.promises.rename(oldPath, newPath);
    
    console.log('File moved successfully:', { from: oldPath, to: newPath });
    
    return {
      success: true,
      newPath,
      newRelativePath: newPath.replace(/\\/g, '/'),
      category: validCategory
    };
  } catch (error) {
    console.error('Error moving file to category:', error);
    return {
      success: false,
      error: error.message,
      oldPath
    };
  }
}
