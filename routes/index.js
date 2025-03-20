const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const config = require("../config.json");
const logger = require("silly-logger");
const response = require("../libs/response.js");
const middleware = require("../libs/middleware.js");
const multer = require("multer");
const randomString = require("random-string");
const { format } = require("date-fns");
const { handleLargeUpload } = require("../libs/handleLargeFile.js");

/**
 * Multer storage configuration
 */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, config.uploadDirectory);
  },
  filename: function (req, file, cb) {
    const fileExtension = path.extname(file.originalname);
    const formattedDate = format(new Date(), "yyyy_MMM_dd-HH_mm_ss");
    const newFileName =
      formattedDate +
      "_" +
      randomString({ length: config.fileNameLength }) +
      fileExtension;
    cb(null, newFileName);
  },
});

/**
 * File filter function to check allowed extensions
 */
const fileFilter = function (req, file, cb) {
  if (!config.fileExtensionCheck.enabled) {
    return cb(null, true);
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (config.fileExtensionCheck.extensionsAllowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file extension"), false);
  }
};

/**
 * Multer upload configuration
 */
const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.fileSizeLimit,
  },
  fileFilter: fileFilter,
});

router.get("/f/:filename", function (req, res) {
  const filePath = path.join(config.uploadDirectory, req.params.filename);

  // Verify file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(req.params.filename).toLowerCase();

  const contentTypes = {
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
  };

  // For video files
  if ([".mp4", ".webm", ".m4v", ".mkv"].includes(ext)) {
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });

      const headers = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentTypes[ext],
        "Content-Disposition": "inline",
      };

      res.writeHead(206, headers);
      file.pipe(res);
    } else {
      const headers = {
        "Content-Length": fileSize,
        "Content-Type": contentTypes[ext],
        "Accept-Ranges": "bytes",
        "Content-Disposition": "inline",
      };

      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  } else if (Object.keys(contentTypes).includes(ext)) {
    // For images (including GIF) and other supported files
    res.writeHead(200, {
      "Content-Type": contentTypes[ext],
      "Content-Length": fileSize,
      "Content-Disposition": "inline",
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // For unsupported files, handle normally
    res.sendFile(filePath);
  }
});

// Update upload route with proper error handling
router.post(
  "/upload",
  middleware.keyRequired,
  // First try the large file handler
  handleLargeUpload,
  // Then fall back to multer for normal-sized files
  upload.single("file"),
  function (req, res) {
    // This part can remain the same as your existing code
    const key = req.body.key;

    if (!req.file) {
      logger.info(
        "No file was sent, aborting... (" +
          (req.locals?.shortKey || "unknown") +
          ")"
      );
      return response.noFileUploaded(res);
    }

    const fileName = req.file.filename;
    const filePath = req.file.path;

    logger.info(
      "Uploaded file " +
        req.file.originalname +
        " to " +
        filePath +
        " (" +
        (req.locals?.shortKey || "unknown") +
        ")"
    );

    response.uploaded(
      res,
      config.staticFileServerUrl + fileName,
      config.serverUrl + "/delete?filename=" + fileName + "&key=" + key
    );
  },
  // Keep your error handler
  function (err, req, res, next) {
    // Error handler
    if (err.message === "Invalid file extension") {
      logger.info(
        "File has an invalid extension, aborting... (" +
          (req.locals?.shortKey || "unknown") +
          ")"
      );
      response.invalidFileExtension(res);
    } else if (err.code === "LIMIT_FILE_SIZE") {
      logger.info(
        "File exceeds size limit, aborting... (" +
          (req.locals?.shortKey || "unknown") +
          ")"
      );
      response.fileTooLarge(res);
    } else {
      logger.error(err + " (" + (req.locals?.shortKey || "unknown") + ")");
      res.status(500).send(err.message);
    }
  }
);

// Delete file - improved with async/await and better error handling
router.get("/delete", middleware.keyRequired, async function (req, res) {
  if (!req.query.filename) {
    return response.responseFileNameIsEmpty(res);
  }

  // Generate file informations
  const fileName = req.query.filename;
  const filePath = path.join(config.uploadDirectory, fileName);
  const shortKey = req.locals?.shortKey || "unknown";

  logger.info(`Trying to delete ${fileName} (${shortKey})`);

  try {
    // Check if file exists
    const exists = await fs.promises
      .access(filePath)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      logger.info(`File ${fileName} doesn't exist, aborting... (${shortKey})`);
      return response.fileDoesNotExists(res);
    }

    // File exists => Delete file
    await fs.promises.unlink(filePath);
    logger.info(`Deleted file ${fileName} (${shortKey})`);
    response.deleted(res, fileName);
  } catch (err) {
    logger.error(`${err} (${shortKey})`);
    res.status(500).send("An error occurred while deleting the file");
  }
});

router.get("/config", function (req, res) {
  const sharexConfig = {
    Version: "17.0.0",
    Name: `${config.name}-Uploader`,
    DestinationType: "ImageUploader",
    RequestMethod: "POST",
    RequestURL: `${config.serverUrl}/upload`,
    Body: "MultipartFormData",
    Arguments: {
      key: config.keys[req.locals.username],
    },
    FileFormName: "file",
    URL: "{json:file.url}",
  };

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${config.name}-Uploader.sxcu"`
  );
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Length", JSON.stringify(sharexConfig).length);

  res.send(JSON.stringify(sharexConfig, null, 2));
});

// / page
router.get("/", function (req, res) {
  res.render("home");
});

module.exports = router;
