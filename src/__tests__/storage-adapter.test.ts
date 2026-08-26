import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  LocalVolumeStorageAdapter,
  StorageConfigurationError,
  type StorageAdapter,
  setStorageAdapterForTests,
  storageKey,
} from '@/lib/storage/adapter';
import { deleteUploadedFile, processUpload, readUploadedFile } from '@/lib/upload';

afterEach(() => {
  setStorageAdapterForTests(null);
});

describe('replaceable private storage adapter', () => {
  it('normalizes controlled directory/file pairs into portable keys', () => {
    expect(storageKey('payment-proofs', 'proof_01.png')).toBe('payment-proofs/proof_01.png');
    expect(() => storageKey('../outside', 'proof.png')).toThrow(StorageConfigurationError);
    expect(() => storageKey('payment-proofs', '../proof.png')).toThrow(StorageConfigurationError);
  });

  it('rejects absolute and traversal keys before touching the filesystem', async () => {
    const adapter = new LocalVolumeStorageAdapter('data/test-storage-adapter');
    await expect(adapter.put('../escape.bin', Buffer.from('x'))).rejects.toThrow(StorageConfigurationError);
    await expect(adapter.read('/absolute.bin')).rejects.toThrow(StorageConfigurationError);
  });

  it('routes upload, authorized read, and deletion through an injected adapter', async () => {
    const objects = new Map<string, Buffer>();
    const adapter: StorageAdapter = {
      async put(key, data) { objects.set(key, Buffer.from(data)); },
      async read(key) { return objects.get(key) ?? null; },
      async delete(key) { return objects.delete(key); },
      describe(key) { return `memory://${key}`; },
    };
    setStorageAdapterForTests(adapter);

    const validPng = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 212, g: 175, b: 55, alpha: 1 },
      },
    }).png().toBuffer();
    const file = new File(
      [validPng],
      'proof.png',
      { type: 'image/png' },
    );
    const uploaded = await processUpload(file, 'payment-proofs');
    expect(uploaded).not.toHaveProperty('error');
    if ('error' in uploaded) throw new Error(uploaded.error);
    expect(uploaded.filePath).toBe(`memory://payment-proofs/${uploaded.fileName}`);
    const stored = await readUploadedFile('payment-proofs', uploaded.fileName);
    expect(stored?.mimeType).toBe('image/png');
    expect(stored?.buffer.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await expect(deleteUploadedFile('payment-proofs', uploaded.fileName)).resolves.toBe(true);
    await expect(readUploadedFile('payment-proofs', uploaded.fileName)).resolves.toBeNull();
  });

  it('rejects a truncated image even when its MIME, extension, and magic prefix match', async () => {
    const objects = new Map<string, Buffer>();
    setStorageAdapterForTests({
      async put(key, data) { objects.set(key, Buffer.from(data)); },
      async read(key) { return objects.get(key) ?? null; },
      async delete(key) { return objects.delete(key); },
      describe(key) { return `memory://${key}`; },
    });

    const file = new File(
      [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
      'truncated.png',
      { type: 'image/png' },
    );
    await expect(processUpload(file, 'before-service')).resolves.toEqual({
      error: 'الملف تالف أو غير مكتمل ولا يمكن قراءته بأمان',
      code: 'INVALID_MIME',
    });
    expect(objects.size).toBe(0);
  });

  it('validates SupabaseStorageAdapter configuration and operations', async () => {
    const { SupabaseStorageAdapter } = await import('@/lib/storage/adapter');
    expect(() => new SupabaseStorageAdapter({ supabaseUrl: '', serviceRoleKey: '' })).toThrow(
      StorageConfigurationError
    );

    const adapter = new SupabaseStorageAdapter({
      supabaseUrl: 'https://test-project.supabase.co',
      serviceRoleKey: 'test-service-key',
      bucket: 'test-bucket',
    });
    expect(adapter.describe('payment-proofs/test.png')).toBe(
      'supabase://test-bucket/payment-proofs/test.png'
    );
  });
});
