let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.warn('Notice: sharp native module not loaded in this environment, using raw image fallback');
}
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');

/**
 * Computes standard relative path from uploadDir and filename.
 */
function getRelativeUploadPath(uploadDir, filename) {
    if (uploadDir && uploadDir.includes('public')) {
        const sep = path.sep;
        const publicToken = `public${sep}`;
        const parts = uploadDir.split(publicToken);
        const afterPublic = (parts.length > 1 ? parts.pop() : uploadDir.split('public').pop()).replace(/\\/g, '/');
        const cleanAfterPublic = afterPublic.replace(/^\/+|\/+$/g, '');
        return `/${cleanAfterPublic}/${filename}`.replace(/\/+/g, '/');
    }
    return `/uploads/${filename}`;
}

/**
 * Saves a buffer both to the local filesystem (if writable) and to PostgreSQL uploaded_files table.
 * Crucial for serverless environments like Vercel where the filesystem is read-only (/var/task).
 * 
 * @param {string} relativePath - The URL relative path, e.g. /uploads/products/123.webp
 * @param {Buffer} buffer - The file buffer.
 * @param {string} mimeType - The MIME type (e.g. image/webp, video/mp4).
 * @param {string} [uploadDir] - The target local directory (optional).
 * @param {string} [filename] - The target filename (optional).
 * @returns {Promise<string>} - The relative URL path to access the file.
 */
async function saveUploadedBuffer(relativePath, buffer, mimeType, uploadDir, filename) {
    // 1. Attempt local disk write (works in local dev, fails gracefully on Vercel read-only filesystem)
    if (uploadDir && filename) {
        try {
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            const outputPath = path.join(uploadDir, filename);
            await fs.promises.writeFile(outputPath, buffer);
        } catch (fsErr) {
            // Silently ignore read-only file system or permission errors on serverless
        }
    }

    // 2. Persist to PostgreSQL so it survives across serverless cold starts and server restarts
    try {
        await pool.query(
            `INSERT INTO uploaded_files (file_path, mime_type, data)
             VALUES ($1, $2, $3)
             ON CONFLICT (file_path) DO UPDATE SET data = EXCLUDED.data, mime_type = EXCLUDED.mime_type`,
            [relativePath, mimeType || 'image/webp', buffer]
        );
    } catch (dbErr) {
        console.error(`Warning: Failed to save upload ${relativePath} to database:`, dbErr.message);
    }

    return relativePath;
}

/**
 * Processes an image buffer into a compressed WebP file (or direct image if sharp is unavailable).
 * Persists in DB so it functions properly on read-only serverless environments.
 * @param {Buffer} buffer - The image data as a buffer.
 * @param {string} uploadDir - The directory to save the file in.
 * @param {string} filenameBase - The base filename (without extension).
 * @returns {Promise<string>} - The relative path to the saved image file.
 */
async function processImageToWebP(buffer, uploadDir, filenameBase) {
    let finalBuffer = buffer;
    let filename = `${filenameBase}.webp`;
    let mimeType = 'image/webp';

    if (sharp) {
        try {
            finalBuffer = await sharp(buffer)
                .webp({ quality: 80 })
                .toBuffer();
        } catch (sharpErr) {
            console.warn('Sharp compression failed, falling back to raw buffer:', sharpErr.message);
            filename = `${filenameBase}.jpg`;
            mimeType = 'image/jpeg';
        }
    } else {
        filename = `${filenameBase}.jpg`;
        mimeType = 'image/jpeg';
    }

    const relativePath = getRelativeUploadPath(uploadDir, filename);
    return await saveUploadedBuffer(relativePath, finalBuffer, mimeType, uploadDir, filename);
}

/**
 * Processes a media file. If it's an image, converts to WebP. If video, saves it directly.
 * @param {Object} file - The multer file object.
 * @param {string} uploadDir - The directory to save the file in.
 * @param {string} filenameBase - The base filename (without extension).
 * @returns {Promise<string>} - The relative path to the saved media file.
 */
async function processMediaFile(file, uploadDir, filenameBase) {
    const isVideo = file.mimetype && file.mimetype.startsWith('video/');
    
    if (isVideo) {
        const ext = path.extname(file.originalname) || '.mp4';
        const filename = `${filenameBase}${ext}`;
        const mimeType = file.mimetype || 'video/mp4';
        const relativePath = getRelativeUploadPath(uploadDir, filename);
        return await saveUploadedBuffer(relativePath, file.buffer, mimeType, uploadDir, filename);
    } else {
        return await processImageToWebP(file.buffer, uploadDir, filenameBase);
    }
}

module.exports = { processImageToWebP, processMediaFile, saveUploadedBuffer, getRelativeUploadPath };
