const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const mime = require('mime-types');

router.get("/", (req, res) => {
  const uploadsDir = path.join(__dirname, `../${config.uploadDirectory}`);
  
  // Get pagination parameters from query string
  const page = parseInt(req.query.page) || 1;
  const itemsPerPage = config.pagination?.itemsPerPage || 12; // Default to 12 items per page
  
  // Read the uploads directory
  fs.readdir(uploadsDir, (err, files) => {
      if (err) {
          console.error('Error reading uploads directory:', err);
          return res.status(500).render('error', { message: 'Error reading files' });
      }
      
      // Process each file to determine its type
      const allFiles = files
          .filter(file => {
              if (config.fileExtensionCheck && config.fileExtensionCheck.enabled) {
                  const extension = path.extname(file).toLowerCase();
                  return config.fileExtensionCheck.extensionsAllowed.includes(extension);
              }
              return true; // Include all files if extension check is disabled
          })
          .map(file => {
              const filePath = path.join(uploadsDir, file);
              const stats = fs.statSync(filePath);
              
              let fileType = 'other';
              const mimeType = mime.lookup(file) || 'application/octet-stream';
              
              if (mimeType.startsWith('image/')) {
                  fileType = 'image';
              } else if (mimeType.startsWith('video/')) {
                  fileType = 'video';
              }
              
              return {
                  name: file,
                  path: `/f/${file}`,
                  size: humanReadableSize(stats.size),
                  type: fileType,
                  date: stats.mtime.toLocaleDateString()
              };
          });
      
      // Calculate pagination values
      const totalFiles = allFiles.length;
      const totalPages = Math.ceil(totalFiles / itemsPerPage);
      const currentPage = Math.min(Math.max(1, page), totalPages || 1);
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      
      // Get files for current page
      const paginatedFiles = allFiles.slice(startIndex, endIndex);
      
      res.render('fileIndex', { 
          files: paginatedFiles,
          pagination: {
              currentPage,
              totalPages,
              hasNextPage: currentPage < totalPages,
              hasPrevPage: currentPage > 1
          }
      });
  });
});

function humanReadableSize(size) {
    let i = size == 0 ? 0 : Math.floor(Math.log(size) / Math.log(1000));
    return (
      (size / Math.pow(1000, i)).toFixed(2) * 1 +
      " " +
      ["B", "kB", "MB", "GB", "TB"][i]
    );
}

module.exports = router;
