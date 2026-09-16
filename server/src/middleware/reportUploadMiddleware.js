import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Secure storage directory outside any public or web-accessible static paths
export const STORAGE_BASE_DIR = path.resolve(__dirname, '../../storage/reports');

// Ensure directory exists with restrictive permissions
if (!fs.existsSync(STORAGE_BASE_DIR)) {
  fs.mkdirSync(STORAGE_BASE_DIR, { recursive: true });
}

// Allowed MIME types and strictly corresponding extensions
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const EXT_TO_MIME_MAP = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, STORAGE_BASE_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Cryptographically random unique filename (prevents directory traversal and naming collisions)
    const randomName = `${crypto.randomUUID()}${ext}`;
    cb(null, randomName);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const expectedMime = EXT_TO_MIME_MAP[ext];

  // Validate extension
  if (!expectedMime) {
    const err = new Error(
      `Unsupported file extension '${ext}'. Only PDF (.pdf), JPEG (.jpg, .jpeg), and PNG (.png) files are permitted.`
    );
    err.code = 'INVALID_FILE_TYPE';
    return cb(err, false);
  }

  // Validate declared MIME type
  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || file.mimetype !== expectedMime) {
    const err = new Error(
      `File MIME type '${file.mimetype}' does not match permitted formats (application/pdf, image/jpeg, image/png).`
    );
    err.code = 'INVALID_FILE_TYPE';
    return cb(err, false);
  }

  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB maximum limit
    files: 1, // Single file per upload
  },
}).single('file');

/**
 * Report Upload Middleware with unified, user-friendly error formatting
 */
export function handleReportUpload(req, res, next) {
  upload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File too large',
          message: 'The uploaded file exceeds the 10MB maximum size limit.',
        });
      }
      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({
          error: 'Invalid file type',
          message: err.message,
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          error: 'Unexpected field',
          message: "Uploaded file must be provided in the form field named 'file'.",
        });
      }
      return res.status(400).json({
        error: 'Upload error',
        message: err.message || 'An error occurred during file upload.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'Missing file',
        message: "A file must be provided in the multipart form under the 'file' field.",
      });
    }

    next();
  });
}
