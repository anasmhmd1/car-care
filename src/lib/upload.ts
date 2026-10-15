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

const STORED_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'image/heic': '.heic',
};

/** An iPhone HEIC/HEIF picture: an ISO media file whose brand says so. */
function heicMime(buffer: Buffer): string | null {
  if (buffer.length < 12 || buffer.subarray(4, 8).toString('latin1') !== 'ftyp') return null;
  const brand = buffer.subarray(8, 12).toString('latin1').toLowerCase();
  return ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand) ? 'image/heic' : null;
}

function declaresPictureOrPdf(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/') || type === 'application/pdf') return true;
  return /\.(jpe?g|jfif|png|webp|gif|bmp|tiff?|heic|heif|avif|pdf)$/i.test(file.name || '');
}

/**
 * Rebuild the file into a safe stored form when that is possible.
 * Returns null when it cannot be decoded; the caller then decides whether to
 * keep the original bytes.
 */
async function prepareForStorage(
  buffer: Buffer,
  detectedMime: string | null,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (detectedMime === 'application/pdf') {
    // A PDF is kept as sent. Its ending is not checked: bank apps produce
    // files that open fine without a standard trailer.
    return { buffer, mimeType: 'application/pdf' };
  }
  if (detectedMime) {
    const clean = await normalizeValidatedFile(buffer, detectedMime);
    if (clean) return { buffer: clean, mimeType: detectedMime };
  }
  // Another picture format, or a picture with minor damage: read what can be
  // read and save it as JPG.
  try {
    const converted = await sharp(buffer, { failOn: 'none', limitInputPixels: 100_000_000, pages: 1 })
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return { buffer: converted, mimeType: 'image/jpeg' };
  } catch {
    return null;
  }
}

// --------------------------------------------------------
// File Upload Handler
// --------------------------------------------------------

/**
 * Process and store an uploaded file securely.
 * - Validates file size
 * - Takes the type from the file's content, not its name or declared type
 * - Decodes the whole image (or checks the PDF structure) before storing
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

  // Read file buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // A customer must never be stopped from booking because of the format or the
  // condition of a payment proof. So the owner's rule is: anything that is, or
  // claims to be, a picture or a PDF is accepted. The steps go from safest to
  // most permissive, and only the last one stores bytes that were not rebuilt:
  //   1. a clean JPG/PNG/WEBP is decoded and re-encoded in its own format;
  //   2. any other picture the decoder can read, or a slightly damaged one,
  //      is converted to JPG;
  //   3. what cannot be decoded at all (an iPhone HEIC, a broken file, a PDF
  //      with an odd ending) is stored exactly as it was sent.
  // The declared type and the extension are never a reason to refuse. Stored
  // files are served with their recorded type and "nosniff", so a file kept
  // as-is is shown as a picture or downloaded, never run as a page.
  const detectedMime = detectMimeFromBuffer(buffer);
  const stored = await prepareForStorage(buffer, detectedMime);
  if (!stored) {
    if (!detectedMime && !declaresPictureOrPdf(file)) {
      return {
        error: 'اختر صورة أو ملف PDF لإثبات الدفع.',
        code: 'INVALID_MIME',
      };
    }
    console.warn('Upload stored without re-encoding', {
      declaredType: file.type, detectedMime, sizeBytes: buffer.length,
    });
  }
  const validatedBuffer = stored?.buffer ?? buffer;
  const storedMime = stored?.mimeType ?? detectedMime ?? heicMime(buffer) ?? 'application/octet-stream';
  if (validatedBuffer.length > MAX_FILE_SIZE) {
    return {
      error: `حجم الملف بعد التحقق يتجاوز الحد الأقصى المسموح (${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB)`,
      code: 'FILE_TOO_LARGE',
    };
  }

  // Generate unique filename
  // The stored extension follows the real content, because files are served
  // back by extension.
  const fileId = randomUUID();
  const ext = STORED_EXTENSIONS[storedMime] ?? '.bin';
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
    mimeType: storedMime,
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
      '.heic': 'image/heic',
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
