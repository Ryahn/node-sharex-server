/**
 * Response utility functions for the ShareX upload server
 * Optimized with consistent error handling and response formatting
 */

// HTTP status codes constants
const HTTP_STATUS = Object.freeze({
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    PAYLOAD_TOO_LARGE: 413,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500
});

/**
 * Base response function with consistent formatting
 * @param {Object} res - Express response object
 * @param {number} status - HTTP status code
 * @param {Object} data - Response data
 */
const sendResponse = (res, status, data) => {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    res.status(status).json(data);
};

/**
 * Success response helper
 * @param {Object} res - Express response object
 * @param {Object} data - Success data
 * @param {string} message - Success message
 */
const sendSuccess = (res, data = {}, message = 'Success') => {
    sendResponse(res, HTTP_STATUS.OK, {
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
    });
};

/**
 * Error response helper
 * @param {Object} res - Express response object
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @param {string} fix - Suggested fix
 * @param {string} code - Error code
 */
const sendError = (res, status, message, fix = null, code = null) => {
    const errorResponse = {
        success: false,
        error: {
            message,
            code,
            timestamp: new Date().toISOString()
        }
    };
    
    if (fix) {
        errorResponse.error.fix = fix;
    }
    
    sendResponse(res, status, errorResponse);
};

// Authentication errors
const responseEmptyKey = (res) => {
    sendError(
        res, 
        HTTP_STATUS.BAD_REQUEST, 
        "API key is required", 
        "Provide a valid API key in the request",
        "EMPTY_KEY"
    );
};

const responseInvalidKey = (res) => {
    sendError(
        res, 
        HTTP_STATUS.UNAUTHORIZED, 
        "Invalid API key", 
        "Provide a valid API key",
        "INVALID_KEY"
    );
};

// File upload errors
const responseNoFileUploaded = (res) => {
    sendError(
        res, 
        HTTP_STATUS.BAD_REQUEST, 
        "No file was uploaded", 
        "Select and upload a file",
        "NO_FILE"
    );
};

const responseInvalidFileExtension = (res) => {
    sendError(
        res, 
        HTTP_STATUS.BAD_REQUEST, 
        "Invalid file extension", 
        "Upload a file with an allowed extension",
        "INVALID_EXTENSION"
    );
};

const responseFileTooLarge = (res) => {
    sendError(
        res, 
        HTTP_STATUS.PAYLOAD_TOO_LARGE, 
        "File exceeds size limit", 
        "Upload a smaller file or contact administrator",
        "FILE_TOO_LARGE"
    );
};

// File management errors
const responseFileDoesntExists = (res) => {
    sendError(
        res, 
        HTTP_STATUS.NOT_FOUND, 
        "File not found", 
        "Verify the filename and try again",
        "FILE_NOT_FOUND"
    );
};

const responseFileNameIsEmpty = (res) => {
    sendError(
        res, 
        HTTP_STATUS.BAD_REQUEST, 
        "Filename is required", 
        "Provide a valid filename",
        "EMPTY_FILENAME"
    );
};

// Success responses
const responseUploaded = (res, fileUrl, deleteUrl, metadata = {}) => {
    const responseData = {
        file: {
            url: fileUrl,
            delete_url: deleteUrl,
            ...metadata
        }
    };
    
    sendSuccess(res, responseData, "File uploaded successfully");
};

const responseDeleted = (res, fileName) => {
    sendSuccess(res, { filename: fileName }, `File '${fileName}' deleted successfully`);
};

// Rate limiting response
const responseRateLimited = (res, retryAfter = null) => {
    if (retryAfter) {
        res.setHeader('Retry-After', retryAfter);
    }
    
    sendError(
        res, 
        HTTP_STATUS.TOO_MANY_REQUESTS, 
        "Too many requests", 
        "Please wait before making more requests",
        "RATE_LIMITED"
    );
};

// Server error response
const responseServerError = (res, message = "Internal server error") => {
    sendError(
        res, 
        HTTP_STATUS.INTERNAL_SERVER_ERROR, 
        message, 
        "Please try again later or contact support",
        "SERVER_ERROR"
    );
};

// Validation error response
const responseValidationError = (res, errors = []) => {
    sendError(
        res, 
        HTTP_STATUS.BAD_REQUEST, 
        "Validation failed", 
        "Fix the validation errors and try again",
        "VALIDATION_ERROR"
    );
};

// Export all response functions
module.exports = {
    // Core functions
    sendResponse,
    sendSuccess,
    sendError,
    
    // Authentication
    emptyKey: responseEmptyKey,
    invalidKey: responseInvalidKey,
    
    // File upload
    noFileUploaded: responseNoFileUploaded,
    invalidFileExtension: responseInvalidFileExtension,
    fileTooLarge: responseFileTooLarge,
    uploaded: responseUploaded,
    
    // File management
    fileDoesNotExists: responseFileDoesntExists,
    fileNameIsEmpty: responseFileNameIsEmpty,
    deleted: responseDeleted,
    
    // Additional responses
    rateLimited: responseRateLimited,
    serverError: responseServerError,
    validationError: responseValidationError,
    
    // Constants
    HTTP_STATUS
};
