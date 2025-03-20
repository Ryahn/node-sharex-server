/**
 * Response utility functions for the ShareX upload server
 */

// Base response function
const basicResponse = (res, status, json) => {
  res.status(status).json(json);
};

// Responds with 400 bad request and the supplied error message/fix
const responseBadRequest = (res, errorMessage, errorFix) => {
  basicResponse(res, 400, {
    success: false,
    error: {
      message: errorMessage,
      fix: errorFix,
    },
  });
};

// Responds with 401 unauthorized and the supplied error message/fix
const responseUnauthorized = (res, errorMessage, errorFix) => {
  basicResponse(res, 401, {
    success: false,
    error: {
      message: errorMessage,
      fix: errorFix,
    },
  });
};

// Responds with empty key error
const responseEmptyKey = (res) => {
  responseBadRequest(res, "Key is empty.", "Submit a key.");
};

// Responds with invalid key error
const responseInvalidKey = (res) => {
  responseUnauthorized(res, "Key is invalid.", "Submit a valid key.");
};

// Responds with no uploaded file error
const responseNoFileUploaded = (res) => {
  responseBadRequest(res, "No file was uploaded.", "Upload a file.");
};

// Responds with invalid extension error
const responseInvalidFileExtension = (res) => {
  responseBadRequest(
    res,
    "Invalid file extension.",
    "Upload a file with a valid extension."
  );
};

// Responds with a uploaded response
const responseUploaded = (res, url, deleteUrl) => {
  basicResponse(res, 200, {
    success: true,
    file: {
      url: url,
      delete_url: deleteUrl,
    },
  });
};

// Responds with deleted response
const responseDeleted = (res, fileName) => {
  basicResponse(res, 200, {
    success: true,
    message: "Deleted file " + fileName,
  });
};

// Responds with a file does not exists error
const responseFileDoesntExists = (res) => {
  responseBadRequest(
    res,
    "The file does not exists.",
    "Submit a existing file name."
  );
};

// Responds with a file name is empty error
const responseFileNameIsEmpty = (res) => {
  responseBadRequest(res, "File name is empty.", "Provide a file name.");
};

const responseFileTooLarge = (res) => {
  responseBadRequest(
    res,
    "File exceeds size limit.",
    "Upload a smaller file or contact administrator."
  );
};

module.exports.emptyKey = responseEmptyKey;
module.exports.invalidKey = responseInvalidKey;
module.exports.noFileUploaded = responseNoFileUploaded;
module.exports.invalidFileExtension = responseInvalidFileExtension;
module.exports.uploaded = responseUploaded;
module.exports.deleted = responseDeleted;
module.exports.fileDoesNotExists = responseFileDoesntExists;
module.exports.fileNameIsEmpty = responseFileNameIsEmpty;
module.exports.fileTooLarge = responseFileTooLarge;
