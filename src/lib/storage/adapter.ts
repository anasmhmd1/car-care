import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<boolean>;
  describe(key: string): string;
}

export class StorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageConfigurationError';
  }
}

function normalizedKey(key: string) {
  const normalized = key.replaceAll('\\', '/');
  if (
    !normalized
    || normalized.startsWith('/')
    || normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new StorageConfigurationError('Storage key is not a safe relative path.');
  }
  return normalized;
}

export class LocalVolumeStorageAdapter implements StorageAdapter {
  readonly root: string;
  readonly fallbackRoot: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.fallbackRoot = path.resolve(os.tmpdir(), 'bareeq-uploads');
  }

  private resolveKey(key: string, useFallback = false) {
    const base = useFallback ? this.fallbackRoot : this.root;
    const candidate = path.resolve(base, normalizedKey(key));
    const relative = path.relative(base, candidate);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new StorageConfigurationError('Storage key resolves outside the configured root.');
    }
    return candidate;
  }

  async put(key: string, data: Buffer) {
    try {
      const destination = this.resolveKey(key);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, data);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err.code === 'EROFS' || err.code === 'EACCES' || err.code === 'EPERM')) {
        const fallbackDest = this.resolveKey(key, true);
        await mkdir(path.dirname(fallbackDest), { recursive: true });
        await writeFile(fallbackDest, data);
        return;
      }
      throw err;
    }
  }

  async read(key: string) {
    try {
      return await readFile(this.resolveKey(key));
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        try {
          return await readFile(this.resolveKey(key, true));
        } catch {
          return null;
        }
      }
      throw error;
    }
  }

  async delete(key: string) {
    try {
      await unlink(this.resolveKey(key));
      return true;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  describe(key: string) {
    return this.resolveKey(key);
  }
}

let testAdapter: StorageAdapter | null = null;

/**
 * Runtime composition point for private file storage. The local persistent
 * volume is production-safe for a single shared-volume deployment; an S3
 * compatible implementation can be injected without changing upload routes,
 * authorization, or database anchors.
 */
export function getStorageAdapter(): StorageAdapter {
  if (testAdapter) return testAdapter;
  const driver = process.env.STORAGE_DRIVER?.trim().toLowerCase() || 'local';
  if (driver !== 'local') {
    throw new StorageConfigurationError(
      `Unsupported STORAGE_DRIVER "${driver}". Register an adapter before handling files.`,
    );
  }
  const root = process.env.UPLOAD_DIR?.trim() || path.join(process.cwd(), 'data', 'uploads');
  return new LocalVolumeStorageAdapter(root);
}

export function setStorageAdapterForTests(adapter: StorageAdapter | null) {
  if (process.env.NODE_ENV === 'production') {
    throw new StorageConfigurationError('Storage adapter overrides are disabled in production.');
  }
  testAdapter = adapter;
}

export function storageKey(directory: string, fileName: string) {
  if (!/^[a-z0-9-]+$/.test(directory) || !/^[a-zA-Z0-9_.-]+$/.test(fileName)) {
    throw new StorageConfigurationError('Storage directory or file name is invalid.');
  }
  return `${directory}/${fileName}`;
}
