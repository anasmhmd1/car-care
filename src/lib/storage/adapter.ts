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
    const isServerless = Boolean(
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT
    );
    this.fallbackRoot = path.resolve(os.tmpdir(), 'bareeq-uploads');
    if (isServerless && !path.isAbsolute(process.env.UPLOAD_DIR?.trim() || '')) {
      this.root = this.fallbackRoot;
    } else {
      this.root = path.resolve(root);
    }
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
    const destination = this.resolveKey(key);
    try {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, data);
    } catch (error) {
      // A configured production volume must fail closed. Falling back to the
      // process temp directory would make an upload appear successful while
      // losing it on restart. The fallback remains useful for local tests and
      // development environments that intentionally exercise ephemeral storage.
      if (process.env.NODE_ENV === 'production') throw error;
      const fallbackDest = this.resolveKey(key, true);
      await mkdir(path.dirname(fallbackDest), { recursive: true });
      await writeFile(fallbackDest, data);
    }
    try {
      const publicDest = path.resolve(process.cwd(), 'public', 'uploads', normalizedKey(key));
      await mkdir(path.dirname(publicDest), { recursive: true });
      await writeFile(publicDest, data);
    } catch {
      // Ignore if public directory write fails
    }
  }

  async read(key: string) {
    const destination = this.resolveKey(key);
    try {
      return await readFile(destination);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        try {
          return await readFile(this.resolveKey(key, true));
        } catch {
          try {
            const publicPath = path.resolve(process.cwd(), 'public', 'uploads', normalizedKey(key));
            return await readFile(publicPath);
          } catch {
            return null;
          }
        }
      }
      throw error;
    }
  }

  async delete(key: string) {
    const destination = this.resolveKey(key);
    let deleted = false;
    try {
      await unlink(destination);
      deleted = true;
    } catch {
      // ignore
    }
    try {
      await unlink(this.resolveKey(key, true));
      deleted = true;
    } catch {
      // ignore
    }
    return deleted;
  }

  describe(key: string) {
    return this.resolveKey(key);
  }
}

export class SupabaseStorageAdapter implements StorageAdapter {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly bucket: string;

  constructor(options?: { supabaseUrl?: string; serviceRoleKey?: string; bucket?: string }) {
    const url = options?.supabaseUrl || process.env.SUPABASE_URL || '';
    this.supabaseUrl = url.replace(/\/+$/, '');
    this.serviceRoleKey = options?.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    this.bucket = options?.bucket || process.env.SUPABASE_STORAGE_BUCKET || 'bareeq-uploads';

    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new StorageConfigurationError(
        'Supabase Storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
      );
    }
    try {
      if (new URL(this.supabaseUrl).protocol !== 'https:') {
        throw new Error('non-HTTPS URL');
      }
    } catch {
      throw new StorageConfigurationError('Supabase Storage requires a valid HTTPS SUPABASE_URL.');
    }
  }

  async put(key: string, data: Buffer): Promise<void> {
    const url = `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${normalizedKey(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        'x-upsert': 'true',
      },
      body: new Uint8Array(data),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new StorageConfigurationError(`Supabase storage upload failed (${res.status}): ${errText}`);
    }
  }

  async read(key: string): Promise<Buffer | null> {
    const url = `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${normalizedKey(key)}`;
    const res = await fetch(url, {
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new StorageConfigurationError(`Supabase storage read failed (${res.status})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(key: string): Promise<boolean> {
    const url = `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${normalizedKey(key)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
    });
    return res.ok;
  }

  describe(key: string): string {
    return `supabase://${this.bucket}/${normalizedKey(key)}`;
  }
}

let testAdapter: StorageAdapter | null = null;

/**
 * Runtime composition point for private file storage. The local persistent
 * volume is production-safe for a single shared-volume deployment; an S3 or
 * Supabase compatible implementation can be injected without changing upload routes,
 * authorization, or database anchors.
 */
export function getStorageAdapter(): StorageAdapter {
  if (testAdapter) return testAdapter;
  const driver = process.env.STORAGE_DRIVER?.trim().toLowerCase() || 'local';
  if (driver === 'local') {
    const root = process.env.UPLOAD_DIR?.trim() || path.join(process.cwd(), 'data', 'uploads');
    return new LocalVolumeStorageAdapter(root);
  }
  if (driver === 'supabase') {
    return new SupabaseStorageAdapter();
  }
  throw new StorageConfigurationError(
    `Unsupported STORAGE_DRIVER "${driver}". Supported drivers: "local", "supabase".`,
  );
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
