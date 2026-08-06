import { randomUUID } from 'crypto';
import path from 'path';
import sharp from 'sharp';
import { getStorageAdapter, storageKey } from '@/lib/storage/adapter';

// --------------------------------------------------------
// Configuration
// --------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};

// --------------------------------------------------------
// Types
// --------------------------------------------------------

export interface UploadResult {
  fileId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface UploadError {
  error: string;
  code: 'INVALID_MIME' | 'FILE_TOO_LARGE' | 'NO_FILE' | 'WRITE_ERROR';
}

// --------------------------------------------------------
// MIME Validation
// --------------------------------------------------------

/**
 * Validate file MIME type by checking both the declared type and
 * the file extension. Returns true only if both match allowed types.
 */
export function isValidMimeType(mimeType: string, fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  const allowedExts = ALLOWED_MIME_TYPES[mimeType];
  if (!allowedExts) return false;
  return allowedExts.includes(ext);
}

/**
 * Validate the magic bytes of common image/PDF formats to prevent
 * extension spoofing. Returns the detected MIME type or null.
 */
export function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  // WEBP: RIFF....WEBP
  if (buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'image/webp';
  }
  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  return null;
}

async function normalizeValidatedFile(
  buffer: Buffer,
  mimeType: string,
): Promise<Buffer | null> {
  if (mimeType === 'application/pdf') {
    const header = buffer.subarray(0, 8).toString('ascii');
    const trailer = buffer.subarray(Math.max(0, buffer.length - 2_048)).toString('latin1');
    return /^%PDF-\d\.\d/.test(header) && trailer.includes('%%EOF')
      ? buffer
      : null;
  }

  try {
    const inputOptions = {
      failOn: 'error' as const,
      limitInputPixels: 40_000_000,
      pages: 1,
    };
    const metadata = await sharp(buffer, inputOptions).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 1 || metadata.height < 1) {
      return null;
    }

    const decoded = sharp(buffer, inputOptions).rotate();
    if (mimeType === 'image/jpeg') {
      return await decoded.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    }
    if (mimeType === 'image/png') {
      return await decoded.png({ compressionLevel: 9 }).toBuffer();
    }
    if (mimeType === 'image/webp') {
      return await decoded.webp({ quality: 90 }).toBuffer();
    }
  } catch {
    return null;
  }
  return null;
}

// --------------------------------------------------------
// File Upload Handler
// --------------------------------------------------------

/**
 * Process and store an uploaded file securely.
 * - Validates MIME type and file extension
 * - Validates magic bytes
 * - Validates file size
 * - Generates a unique filename
 * - Stores file in private upload directory
 */
export async function processUpload(
  file: File,
  subDirectory: string = 'general'
): Promise<UploadResult | UploadError> {
  if (!file || file.size === 0) {
    return { error: 'لم يتم اختيار ملف', code: 'NO_FILE' };
  }

  // Size validation
  if (file.size > MAX_FILE_SIZE) {
    return {
      error: `حجم الملف يتجاوز الحد الأقصى المسموح (${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB)`,
      code: 'FILE_TOO_LARGE',
    };
  }

  // MIME + extension validation
  if (!isValidMimeType(file.type, file.name)) {
    return {
      error: 'نوع الملف غير مسموح. الأنواع المسموحة: JPG, PNG, WEBP, PDF',
      code: 'INVALID_MIME',
    };
  }

  // Read file buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Magic bytes validation
  const detectedMime = detectMimeFromBuffer(buffer);
  if (!detectedMime || detectedMime !== file.type) {
    return {
      error: 'محتوى الملف لا يتطابق مع نوعه المعلن',
      code: 'INVALID_MIME',
    };
  }

  // Decode the complete image (or validate the PDF trailer) before storage.
  // Re-encoding images rejects truncated payloads and strips unsafe metadata.
  const validatedBuffer = await normalizeValidatedFile(buffer, detectedMime);
  if (!validatedBuffer) {
    return {
      error: 'الملف تالف أو غير مكتمل ولا يمكن قراءته بأمان',
      code: 'INVALID_MIME',
    };
  }
  if (validatedBuffer.length > MAX_FILE_SIZE) {
    return {
      error: `حجم الملف بعد التحقق يتجاوز الحد الأقصى المسموح (${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB)`,
      code: 'FILE_TOO_LARGE',
    };
  }

  // Generate unique filename
  const fileId = randomUUID();
  const ext = path.extname(file.name).toLowerCase();
  const safeFileName = `${fileId}${ext}`;

  const key = storageKey(subDirectory, safeFileName);
  const storage = getStorageAdapter();
  try {
    await storage.put(key, validatedBuffer);
  } catch (err) {
    console.error('File write error:', err);
    return { error: 'فشل في حفظ الملف', code: 'WRITE_ERROR' };
  }

  return {
    fileId,
    fileName: safeFileName,
    filePath: storage.describe(key),
    mimeType: file.type,
    sizeBytes: validatedBuffer.length,
    url: `/api/files/${subDirectory}/${safeFileName}`,
  };
}

// --------------------------------------------------------
// File Read (for authorized serving)
// --------------------------------------------------------

/**
 * Read a file from the upload directory.
 * Returns the buffer and mime type, or null if not found.
 */
export async function readUploadedFile(
  subDirectory: string,
  fileName: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  // Sanitize filename - only allow alphanumeric, hyphens, dots, underscores
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9\-_.]/g, '');
  if (sanitizedName !== fileName) return null;

  try {
    const buffer = await getStorageAdapter().read(storageKey(subDirectory, sanitizedName));
    if (!buffer) return null;
    const ext = path.extname(sanitizedName).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';
    return { buffer, mimeType };
  } catch {
    return null;
  }
}

/**
 * Delete an uploaded file.
 */
export async function deleteUploadedFile(
  subDirectory: string,
  fileName: string
): Promise<boolean> {
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9\-_.]/g, '');
  try {
    return await getStorageAdapter().delete(storageKey(subDirectory, sanitizedName));
  } catch {
    return false;
  }
}
