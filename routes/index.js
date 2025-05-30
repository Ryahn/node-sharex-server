const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const config = require("../config.json");
const logger = require("silly-logger");
const response = require("../libs/response.js");
const middleware = require("../libs/middleware.js");
const multer = require("multer");
const randomString = require("random-string");
const { format } = require("date-fns");
const { handleLargeUpload } = require("../libs/handleLargeFile.js");

// Constants for better maintainability
const CONTENT_TYPES = Object.freeze({
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".mkv": "video/x-matroska",
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
});

const VIDEO_EXTENSIONS = Object.freeze([".mp4", ".webm", ".m4v", ".mkv"]);
const SUPPORTED_EXTENSIONS = Object.freeze(Object.keys(CONTENT_TYPES));

/**
 * Validates and sanitizes filename to prevent path traversal attacks
 * @param {string} filename - The filename to validate
 * @returns {string|null} - Sanitized filename or null if invalid
 */
function validateAndSanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return null;
  }
  
  // Remove any path separators and normalize
  const sanitized = path.basename(filename);
  
  // Check for suspicious patterns
  if (sanitized.includes('..') || sanitized.startsWith('.') || sanitized.length === 0) {
    return null;
  }
  
  return sanitized;
}

/**
 * Multer storage configuration with enhanced security
 */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, config.uploadDirectory);
  },
  filename: function (req, file, cb) {
    try {
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const formattedDate = format(new Date(), "yyyy_MMM_dd-HH_mm_ss");
      const randomPart = randomString({ length: config.fileNameLength });
      const newFileName = `${formattedDate}_${randomPart}${fileExtension}`;
      cb(null, newFileName);
    } catch (error) {
      cb(error);
    }
  },
});

/**
 * Enhanced file filter with better validation
 */
const fileFilter = function (req, file, cb) {
  if (!config.fileExtensionCheck.enabled) {
    return cb(null, true);
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const isAllowed = config.fileExtensionCheck.extensionsAllowed.includes(ext);
  
  if (isAllowed) {
    cb(null, true);
  } else {
    const error = new Error("Invalid file extension");
    error.code = "INVALID_FILE_EXTENSION";
    cb(error, false);
  }
};

/**
 * Multer upload configuration with enhanced limits
 */
const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.fileSizeLimit,
    files: 1, // Only allow single file uploads
    fields: 10, // Limit number of fields
  },
  fileFilter: fileFilter,
});

/**
 * Enhanced file serving route with better security and performance
 */
router.get("/f/:filename", async function (req, res) {
  try {
    const filename = validateAndSanitizeFilename(req.params.filename);
    if (!filename) {
      return res.status(400).send("Invalid filename");
    }

    const filePath = path.join(config.uploadDirectory, filename);
    
    // Security check: ensure the resolved path is within upload directory
    const resolvedPath = path.resolve(filePath);
    const uploadDir = path.resolve(config.uploadDirectory);
    if (!resolvedPath.startsWith(uploadDir)) {
      return res.status(403).send("Access denied");
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).send("File not found");
    }

    const stat = await fs.stat(filePath);
    const fileSize = stat.size;
    const ext = path.extname(filename).toLowerCase();

    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    // Handle video files with range support
    if (VIDEO_EXTENSIONS.includes(ext)) {
      return handleVideoFile(req, res, filePath, fileSize, ext);
    } 
    
    // Handle images and other supported files
    if (CONTENT_TYPES[ext]) {
      res.setHeader("Content-Type", CONTENT_TYPES[ext]);
      res.setHeader("Content-Length", fileSize);
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "public, max-age=31536000"); // 1 year cache
      
      const readStream = fsSync.createReadStream(filePath);
      readStream.on('error', (err) => {
        logger.error(`Error streaming file ${filename}: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).send("Error reading file");
        }
      });
      
      return readStream.pipe(res);
    }
    
    // For unsupported files, send as download
    res.download(filePath);
    
  } catch (error) {
    logger.error(`Error serving file ${req.params.filename}: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).send("Internal server error");
    }
  }
});

/**
 * Handle video file streaming with range support
 */
function handleVideoFile(req, res, filePath, fileSize, ext) {
  const range = req.headers.range;
  const contentType = CONTENT_TYPES[ext];

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    
    // Validate range
    if (start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }
    
    const chunksize = end - start + 1;
    const file = fsSync.createReadStream(filePath, { start, end });

    const headers = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=31536000",
    };

    res.writeHead(206, headers);
    file.on('error', (err) => {
      logger.error(`Error streaming video file: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    file.pipe(res);
  } else {
    const headers = {
      "Content-Length": fileSize,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=31536000",
    };

    res.writeHead(200, headers);
    const readStream = fsSync.createReadStream(filePath);
    readStream.on('error', (err) => {
      logger.error(`Error streaming video file: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    readStream.pipe(res);
  }
}

/**
 * Enhanced upload route with better error handling and validation
 */
router.post(
  "/upload",
  middleware.keyRequired,
  handleLargeUpload,
  upload.single("file"),
  async function (req, res) {
    try {
      // Validate authentication
      if (!req.locals || !req.locals.username) {
        const key = req.body.key;
        
        if (key) {
          const username = middleware.keyToUsername[key];
          if (!username) {
            logger.auth(`Failed authentication with key ${key.substr(0, 3)}...`);
            return response.invalidKey(res);
          }
          
          req.locals = req.locals || {};
          req.locals.shortKey = key.substr(0, 3) + '...';
          req.locals.username = username;
        } else {
          logger.auth('No key provided in request body');
          return response.emptyKey(res);
        }
      }

      // Validate file upload
      if (!req.file) {
        logger.info(`No file was sent, aborting... (${req.locals?.shortKey || "unknown"})`);
        return response.noFileUploaded(res);
      }

      const { filename, path: filePath, originalname } = req.file;
      const shortKey = req.locals?.shortKey || "unknown";

      logger.info(`Uploaded file ${originalname} to ${filePath} (${shortKey})`);

      // Generate response URLs
      const fileUrl = config.staticFileServerUrl + filename;
      const deleteUrl = `${config.serverUrl}/delete?filename=${encodeURIComponent(filename)}&key=${encodeURIComponent(req.body.key)}`;

      response.uploaded(res, fileUrl, deleteUrl);
      
    } catch (error) {
      logger.error(`Upload error: ${error.message} (${req.locals?.shortKey || "unknown"})`);
      res.status(500).json({
        success: false,
        error: { message: "Internal server error" }
      });
    }
  },
  function (err, req, res, next) {
    const shortKey = req.locals?.shortKey || "unknown";
    
    // Handle specific error types
    if (err.code === "INVALID_FILE_EXTENSION") {
      logger.info(`File has an invalid extension, aborting... (${shortKey})`);
      return response.invalidFileExtension(res);
    }
    
    if (err.code === "LIMIT_FILE_SIZE") {
      logger.info(`File exceeds size limit, aborting... (${shortKey})`);
      return response.fileTooLarge(res);
    }
    
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      logger.info(`Unexpected file field, aborting... (${shortKey})`);
      return response.noFileUploaded(res);
    }
    
    logger.error(`Upload error: ${err.message} (${shortKey})`);
    res.status(500).json({
      success: false,
      error: { message: "Upload failed" }
    });
  }
);

/**
 * Enhanced delete route with better validation and error handling
 */
router.get("/delete", middleware.keyRequired, async function (req, res) {
  try {
    const filename = validateAndSanitizeFilename(req.query.filename);
    if (!filename) {
      return response.responseFileNameIsEmpty(res);
    }

    const filePath = path.join(config.uploadDirectory, filename);
    const shortKey = req.locals?.shortKey || "unknown";

    // Security check: ensure the resolved path is within upload directory
    const resolvedPath = path.resolve(filePath);
    const uploadDir = path.resolve(config.uploadDirectory);
    if (!resolvedPath.startsWith(uploadDir)) {
      logger.warn(`Path traversal attempt detected: ${filename} (${shortKey})`);
      return response.fileDoesNotExists(res);
    }

    logger.info(`Trying to delete ${filename} (${shortKey})`);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      logger.info(`File ${filename} doesn't exist, aborting... (${shortKey})`);
      return response.fileDoesNotExists(res);
    }

    // Delete file
    await fs.unlink(filePath);
    logger.info(`Deleted file ${filename} (${shortKey})`);
    response.deleted(res, filename);
    
  } catch (error) {
    const shortKey = req.locals?.shortKey || "unknown";
    logger.error(`Delete error: ${error.message} (${shortKey})`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to delete file" }
    });
  }
});

/**
 * Enhanced config route with better validation
 */
router.get("/config", middleware.keyRequired, function (req, res) {
  try {
    if (!req.locals || !req.locals.username) {
      return response.invalidKey(res);
    }

    const userKey = config.keys[req.locals.username];
    if (!userKey) {
      return response.invalidKey(res);
    }

    const sharexConfig = {
      Version: "17.0.0",
      Name: `${config.name}-Uploader`,
      DestinationType: "ImageUploader",
      RequestMethod: "POST",
      RequestURL: `${config.serverUrl}/upload`,
      Body: "MultipartFormData",
      Arguments: {
        key: userKey,
      },
      FileFormName: "file",
      URL: "{json:file.url}",
    };

    const configJson = JSON.stringify(sharexConfig, null, 2);
    const filename = `${config.name}-Uploader.sxcu`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Length", Buffer.byteLength(configJson, 'utf8'));
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    res.send(configJson);
    
  } catch (error) {
    logger.error(`Config generation error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { message: "Failed to generate config" }
    });
  }
});

/**
 * Home page route
 */
router.get("/", function (req, res) {
  res.render("home");
});

module.exports = router;
