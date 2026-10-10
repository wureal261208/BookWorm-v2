const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');

// On serverless environments (Vercel, AWS Lambda), the app directory is read-only.
// Writable disk space is available only in os.tmpdir() (/tmp).
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const uploadDir = isServerless
  ? path.join(os.tmpdir(), 'uploads')
  : path.join(__dirname, '..', 'uploads');

try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (_) {
  // Graceful fallback if filesystem restricts directory creation
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const safeName = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    callback(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`);
  },
});

const allowedMimeTypes = new Set([
  'application/pdf', 'application/epub+zip', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a', 'audio/aac', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml',
]);

module.exports = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, allowedMimeTypes.has(file.mimetype)),
});
