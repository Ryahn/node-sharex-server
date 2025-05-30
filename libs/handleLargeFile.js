/**
 * Large file upload handler using Busboy for streaming uploads
 * Optimized for ShareX uploads with enhanced error handling and performance
 */

const Busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const logger = require('silly-logger');
const randomString = require('random-string');
const { format } = require('date-fns');
const response = require('./response.js');

// Constants for better maintainability
const DEFAULT_LARGE_FILE_LIMIT = 5 * 1024 * 1024 * 1024; // 5GB
const PROGRESS_LOG_INTERVAL = 100 * 1024 * 1024; // Log every 100MB
const MAX_FIELD_SIZE = 1024 * 1024; // 1MB for form fields
const MAX_FIELDS = 10; // Maximum number of form fields

/**
 * Validates file extension against allowed extensions
 * @param {string} filename - Original filename
 * @returns {boolean} - True if extension is allowed
 */
function isFileExtensionAllowed(filename) {
    if (!config.fileExtensionCheck?.enabled) {
        return true;
    }
    
    const ext = path.extname(filename).toLowerCase();
    return config.fileExtensionCheck.extensionsAllowed.includes(ext);
}

/**
 * Generates a unique filename with timestamp and random string
 * @param {string} originalFilename - Original filename
 * @returns {string} - Generated unique filename
 */
function generateUniqueFilename(originalFilename) {
    const fileExtension = path.extname(originalFilename).toLowerCase();
    const formattedDate = format(new Date(), "yyyy_MMM_dd-HH_mm_ss");
    const randomPart = randomString({ length: config.fileNameLength || 8 });
    
    return `${formattedDate}_${randomPart}${fileExtension}`;
}

/**
 * Cleans up temporary files in case of error
 * @param {string} filePath - Path to file to clean up
 */
async function cleanupFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            logger.info(`Cleaned up temporary file: ${filePath}`);
        }
    } catch (error) {
        logger.error(`Failed to cleanup file ${filePath}: ${error.message}`);
    }
}

/**
 * Handle large file uploads with streaming and enhanced error handling
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const handleLargeUpload = (req, res, next) => {
    // Check Content-Length header to decide if we should use this handler
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const isLargeFile = contentLength > config.fileSizeLimit || 
                        req.query.largeFile === 'true';
    
    if (!isLargeFile) {
        return next();
    }
    
    logger.info(`Large file upload detected (${contentLength} bytes), using streaming handler`);
    
    let filename = null;
    let filePath = null;
    let writeStream = null;
    let bytesReceived = 0;
    let lastProgressLog = 0;
    let uploadStartTime = Date.now();
    
    // Configure Busboy with appropriate limits and security settings
    const busboy = Busboy({ 
        headers: req.headers,
        limits: {
            fileSize: config.largeFileSizeLimit || DEFAULT_LARGE_FILE_LIMIT,
            fieldSize: MAX_FIELD_SIZE,
            fields: MAX_FIELDS,
            files: 1 // Only allow one file
        }
    });
    
    // Handle form fields (like API key)
    busboy.on('field', (fieldname, value, info) => {
        const { nameTruncated, valueTruncated } = info;
        
        if (nameTruncated || valueTruncated) {
            logger.warn(`Form field truncated: ${fieldname}`);
            return;
        }
        
        // Store form fields in request body for later processing
        req.body = req.body || {};
        req.body[fieldname] = value;
        
        logger.debug(`Received form field: ${fieldname}`);
    });
    
    // File processing with enhanced error handling
    busboy.on('file', (fieldname, file, info) => {
        const { filename: originalFilename, mimeType } = info;
        
        if (!originalFilename) {
            file.resume(); // Discard the file
            return next(new Error("No filename provided"));
        }
        
        // Validate file extension
        if (!isFileExtensionAllowed(originalFilename)) {
            file.resume(); // Discard the file
            const error = new Error("Invalid file extension");
            error.code = "INVALID_FILE_EXTENSION";
            return next(error);
        }
        
        // Generate unique filename
        filename = generateUniqueFilename(originalFilename);
        filePath = path.join(config.uploadDirectory, filename);
        
        logger.info(`Streaming file upload started: ${originalFilename} -> ${filename} (${req.locals?.shortKey || 'unknown'})`);
        
        // Create write stream with error handling
        try {
            writeStream = fs.createWriteStream(filePath);
        } catch (error) {
            logger.error(`Failed to create write stream: ${error.message}`);
            return next(error);
        }
        
        // Handle write stream errors
        writeStream.on('error', async (err) => {
            logger.error(`Error writing file: ${err.message} (${req.locals?.shortKey || 'unknown'})`);
            await cleanupFile(filePath);
            next(err);
        });
        
        // Handle file stream errors
        file.on('error', async (err) => {
            logger.error(`Error reading upload stream: ${err.message} (${req.locals?.shortKey || 'unknown'})`);
            if (writeStream) {
                writeStream.destroy();
            }
            await cleanupFile(filePath);
            next(err);
        });
        
        // Track upload progress
        file.on('data', (chunk) => {
            bytesReceived += chunk.length;
            
            // Log progress at intervals
            if (bytesReceived - lastProgressLog >= PROGRESS_LOG_INTERVAL) {
                const progressMB = Math.floor(bytesReceived / (1024 * 1024));
                const elapsedSeconds = (Date.now() - uploadStartTime) / 1000;
                const speedMBps = (bytesReceived / (1024 * 1024)) / elapsedSeconds;
                
                logger.info(`Upload progress: ${progressMB}MB received (${speedMBps.toFixed(2)} MB/s)`);
                lastProgressLog = bytesReceived;
            }
        });
        
        // Handle file completion
        file.on('end', () => {
            const totalMB = Math.floor(bytesReceived / (1024 * 1024));
            const totalSeconds = (Date.now() - uploadStartTime) / 1000;
            const avgSpeedMBps = (bytesReceived / (1024 * 1024)) / totalSeconds;
            
            logger.info(`File stream completed: ${totalMB}MB in ${totalSeconds.toFixed(2)}s (avg: ${avgSpeedMBps.toFixed(2)} MB/s)`);
        });
        
        // Pipe file to disk
        file.pipe(writeStream);
    });
    
    // Handle upload completion
    busboy.on('finish', () => {
        if (!filename) {
            return response.noFileUploaded(res);
        }
        
        const totalMB = Math.floor(bytesReceived / (1024 * 1024));
        const totalSeconds = (Date.now() - uploadStartTime) / 1000;
        
        logger.info(`Streaming upload completed: ${filename} (${totalMB}MB in ${totalSeconds.toFixed(2)}s) (${req.locals?.shortKey || 'unknown'})`);
        
        // Mimic the multer object structure to maintain compatibility
        req.file = {
            filename: filename,
            path: filePath,
            originalname: filename,
            size: bytesReceived,
            mimetype: 'application/octet-stream' // Default mimetype for large files
        };
        
        next();
    });
    
    // Handle busboy errors
    busboy.on('error', async (err) => {
        logger.error(`Upload error: ${err.message} (${req.locals?.shortKey || 'unknown'})`);
        
        // Cleanup on error
        if (writeStream) {
            writeStream.destroy();
        }
        await cleanupFile(filePath);
        
        // Handle specific error types
        if (err.code === 'LIMIT_FILE_SIZE') {
            const error = new Error("File too large");
            error.code = "LIMIT_FILE_SIZE";
            return next(error);
        }
        
        next(err);
    });
    
    // Handle request errors and cleanup
    req.on('error', async (err) => {
        logger.error(`Request error during upload: ${err.message}`);
        if (writeStream) {
            writeStream.destroy();
        }
        await cleanupFile(filePath);
    });
    
    // Handle client disconnect
    req.on('close', async () => {
        if (!res.headersSent) {
            logger.warn(`Client disconnected during upload (${req.locals?.shortKey || 'unknown'})`);
            if (writeStream) {
                writeStream.destroy();
            }
            await cleanupFile(filePath);
        }
    });
    
    // Start processing the request
    req.pipe(busboy);
};

module.exports = {
    handleLargeUpload,
    isFileExtensionAllowed,
    generateUniqueFilename,
    cleanupFile
};