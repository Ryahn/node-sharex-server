/**
 * Large file upload handler using Busboy for streaming uploads
 * Optimized for ShareX uploads
 */

const Busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const logger = require('silly-logger');
const randomString = require('random-string');
const { format } = require('date-fns');
const response = require('./response.js');

/**
 * Handle large file uploads with streaming
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const handleLargeUpload = (req, res, next) => {
  // Check Content-Length header to decide if we should use this handler
  // If Content-Length is larger than regular limit or specifically requested, use streaming
  const contentLength = parseInt(req.headers['content-length'] || '0');
  const isLargeFile = contentLength > config.fileSizeLimit || 
                      req.query.largeFile === 'true';
  
  if (!isLargeFile) {
    return next();
  }
  
  logger.info(`Large file upload detected (${contentLength} bytes), using streaming handler`);
  
  let filename = null;
  let filePath = null;
  
  // Configure Busboy with appropriate limits
  const busboy = Busboy({ 
    headers: req.headers,
    limits: {
      fileSize: config.largeFileSizeLimit || 5 * 1024 * 1024 * 1024 // 5GB limit by default
    } 
  });
  
  // File processing
  busboy.on('file', (fieldname, file, info) => {
    const { filename: originalFilename, mimeType } = info;
    const fileExtension = path.extname(originalFilename);
    const formattedDate = format(new Date(), "yyyy_MMM_dd-HH_mm_ss");
    
    // Create filename using same pattern as regular uploads
    filename = formattedDate + "_" + randomString({ length: config.fileNameLength }) + fileExtension;
    filePath = path.join(config.uploadDirectory, filename);
    
    logger.info(`Streaming file upload started: ${originalFilename} (${req.locals?.shortKey || 'unknown'})`);
    
    // Check file extension if extension checking is enabled
    if (config.fileExtensionCheck && config.fileExtensionCheck.enabled) {
      const ext = fileExtension.toLowerCase();
      if (!config.fileExtensionCheck.extensionsAllowed.includes(ext)) {
        file.resume(); // Discard the file
        return next(new Error("Invalid file extension"));
      }
    }
    
    // Stream directly to disk
    const writeStream = fs.createWriteStream(filePath);
    file.pipe(writeStream);

    let bytesReceived = 0;

    file.on('data', (chunk) => {
    bytesReceived += chunk.length;
    
    // Log progress every 100MB
    if (bytesReceived % (100 * 1024 * 1024) < chunk.length) {
        logger.info(`Upload progress: ${Math.floor(bytesReceived / (1024 * 1024))}MB received`);
    }
    });
    
    // Handle errors during streaming
    writeStream.on('error', (err) => {
      logger.error(`Error writing file: ${err} (${req.locals?.shortKey || 'unknown'})`);
      next(err);
    });
  });
  
  // Handle completion
  busboy.on('finish', () => {
    if (!filename) {
      return response.noFileUploaded(res);
    }
    
    logger.info(`Streaming file upload completed: ${filename} (${req.locals?.shortKey || 'unknown'})`);
    
    // Mimic the multer object structure to maintain compatibility with existing route handlers
    req.file = {
      filename: filename,
      path: filePath,
      originalname: filename
    };
    
    next();
  });
  
  // Handle errors
  busboy.on('error', (err) => {
    logger.error(`Upload error: ${err} (${req.locals?.shortKey || 'unknown'})`);
    next(err);
  });
  
  // Start processing the request
  req.pipe(busboy);
};

module.exports = {
  handleLargeUpload
};