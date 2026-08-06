export interface ImagePreparationOptions {
  maxDimension?: number;
  quality?: number;
}

const RASTER_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Rasterizes a browser-selected image before upload. Re-encoding through a
 * canvas removes EXIF/GPS metadata and applies bounded WebP compression while
 * preserving the visible orientation produced by the browser decoder.
 */
export async function prepareImageForUpload(
  file: File,
  options: ImagePreparationOptions = {},
): Promise<File> {
  if (!RASTER_IMAGE_TYPES.has(file.type) || typeof document === 'undefined') return file;

  const maxDimension = Math.max(640, Math.min(options.maxDimension ?? 2560, 4096));
  const quality = Math.max(0.65, Math.min(options.quality ?? 0.84, 0.95));
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', quality);
    });
    if (!blob || blob.size === 0) return file;
    const stem = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_.-]/g, '-') || 'image';
    return new File([blob], `${stem}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch {
    // Older browsers keep the original file; the server still performs MIME,
    // magic-byte and size validation and stores it privately.
    return file;
  } finally {
    bitmap?.close();
  }
}
