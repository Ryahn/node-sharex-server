/**
 * Utility functions for the ShareX upload server
 * Common helper functions for validation, formatting, and file operations
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

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
    
    // Check for reserved names (Windows)
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    const nameWithoutExt = path.parse(sanitized).name.toUpperCase();
    if (reservedNames.includes(nameWithoutExt)) {
        return null;
    }
    
    return sanitized;
}

/**
 * Formats file size in human readable format
 * @param {number} bytes - File size in bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} - Formatted file size
 */
function formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Generates a secure random string
 * @param {number} length - Length of the string
 * @param {string} charset - Character set to use
 * @returns {string} - Random string
 */
function generateSecureRandomString(length = 32, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
    let result = '';
    const bytes = crypto.randomBytes(length);
    
    for (let i = 0; i < length; i++) {
        result += charset[bytes[i] % charset.length];
    }
    
    return result;
}

/**
 * Calculates file hash (SHA-256)
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} - File hash
 */
async function calculateFileHash(filePath) {
    const hash = crypto.createHash('sha256');
    const fileBuffer = await fs.readFile(filePath);
    hash.update(fileBuffer);
    return hash.digest('hex');
}

/**
 * Checks if a file exists and is accessible
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} - True if file exists and is accessible
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Gets file stats safely
 * @param {string} filePath - Path to the file
 * @returns {Promise<Object|null>} - File stats or null if error
 */
async function getFileStats(filePath) {
    try {
        return await fs.stat(filePath);
    } catch {
        return null;
    }
}

/**
 * Validates file extension against allowed extensions
 * @param {string} filename - Filename to check
 * @param {Array} allowedExtensions - Array of allowed extensions
 * @returns {boolean} - True if extension is allowed
 */
function isFileExtensionAllowed(filename, allowedExtensions) {
    if (!allowedExtensions || allowedExtensions.length === 0) {
        return true;
    }
    
    const ext = path.extname(filename).toLowerCase();
    return allowedExtensions.includes(ext);
}

/**
 * Validates MIME type against allowed types
 * @param {string} mimeType - MIME type to check
 * @param {Array} allowedTypes - Array of allowed MIME types
 * @returns {boolean} - True if MIME type is allowed
 */
function isMimeTypeAllowed(mimeType, allowedTypes) {
    if (!allowedTypes || allowedTypes.length === 0) {
        return true;
    }
    
    return allowedTypes.includes(mimeType);
}

/**
 * Safely deletes a file
 * @param {string} filePath - Path to the file to delete
 * @returns {Promise<boolean>} - True if deleted successfully
 */
async function safeDeleteFile(filePath) {
    try {
        if (await fileExists(filePath)) {
            await fs.unlink(filePath);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Creates directory recursively if it doesn't exist
 * @param {string} dirPath - Directory path to create
 * @returns {Promise<boolean>} - True if created or already exists
 */
async function ensureDirectory(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
        return true;
    } catch {
        return false;
    }
}

/**
 * Validates IP address format
 * @param {string} ip - IP address to validate
 * @returns {boolean} - True if valid IP address
 */
function isValidIP(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Sanitizes user input to prevent XSS
 * @param {string} input - Input to sanitize
 * @returns {string} - Sanitized input
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') {
        return '';
    }
    
    return input
        .replace(/[<>]/g, '') // Remove < and >
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+=/gi, '') // Remove event handlers
        .trim();
}

/**
 * Validates URL format
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL
 */
function isValidURL(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Throttles function execution
 * @param {Function} func - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Throttled function
 */
function throttle(func, delay) {
    let timeoutId;
    let lastExecTime = 0;
    
    return function (...args) {
        const currentTime = Date.now();
        
        if (currentTime - lastExecTime > delay) {
            func.apply(this, args);
            lastExecTime = currentTime;
        } else {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
                lastExecTime = Date.now();
            }, delay - (currentTime - lastExecTime));
        }
    };
}

/**
 * Debounces function execution
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(func, delay) {
    let timeoutId;
    
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Retries an async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} - Promise that resolves with the function result
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            if (i === maxRetries) {
                throw lastError;
            }
            
            const delay = baseDelay * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

module.exports = {
    validateAndSanitizeFilename,
    formatFileSize,
    generateSecureRandomString,
    calculateFileHash,
    fileExists,
    getFileStats,
    isFileExtensionAllowed,
    isMimeTypeAllowed,
    safeDeleteFile,
    ensureDirectory,
    isValidIP,
    sanitizeInput,
    isValidURL,
    throttle,
    debounce,
    retryWithBackoff
}; 