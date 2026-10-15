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

  it('accepts a real image whose name and declared type disagree with its content', async () => {
    const objects = new Map<string, Buffer>();
    setStorageAdapterForTests({
      async put(key, data) { objects.set(key, Buffer.from(data)); },
      async read(key) { return objects.get(key) ?? null; },
      async delete(key) { return objects.delete(key); },
      describe(key) { return `memory://${key}`; },
    });
    const pixel = sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 20, b: 30 } },
    });
    const cases = [
      // A phone screenshot: PNG content saved under a .jpg name.
      { data: await pixel.clone().png().toBuffer(), name: 'Screenshot_transfer.jpg', type: 'image/jpeg', mime: 'image/png', ext: '.png' },
      // A picture forwarded by a chat app: WEBP content under a .jpg name.
      { data: await pixel.clone().webp().toBuffer(), name: 'IMG-0001.jpg', type: 'image/jpeg', mime: 'image/webp', ext: '.webp' },
      // A browser that reports no type at all, and an unusual extension.
      { data: await pixel.clone().jpeg().toBuffer(), name: 'receipt.jfif', type: '', mime: 'image/jpeg', ext: '.jpg' },
    ];
    for (const item of cases) {
      const uploaded = await processUpload(
        new File([new Uint8Array(item.data)], item.name, { type: item.type }),
        'payment-proofs',
      );
      if ('error' in uploaded) throw new Error(`${item.name}: ${uploaded.error}`);
      expect(uploaded.mimeType).toBe(item.mime);
      expect(uploaded.fileName.endsWith(item.ext)).toBe(true);
      const stored = await readUploadedFile('payment-proofs', uploaded.fileName);
      expect(stored?.mimeType).toBe(item.mime);
    }
    expect(objects.size).toBe(cases.length);
  });

  it('still rejects content that is not an allowed format, whatever it is called', async () => {
    const objects = new Map<string, Buffer>();
    setStorageAdapterForTests({
      async put(key, data) { objects.set(key, Buffer.from(data)); },
      async read(key) { return objects.get(key) ?? null; },
      async delete(key) { return objects.delete(key); },
      describe(key) { return `memory://${key}`; },
    });
    // Neither the content, the declared type nor the name says picture or PDF.
    for (const item of [
      { name: 'page.html', type: 'text/html', content: '<script>alert(1)</script>' },
      { name: 'setup.exe', type: 'application/x-msdownload', content: 'MZ\u0090\u0000 program' },
      { name: 'notes', type: '', content: 'plain words' },
    ]) {
      await expect(processUpload(
        new File([item.content], item.name, { type: item.type }),
        'payment-proofs',
      )).resolves.toEqual({
        error: 'اختر صورة أو ملف PDF لإثبات الدفع.',
        code: 'INVALID_MIME',
      });
    }
    expect(objects.size).toBe(0);
  });

  it('never refuses a picture or PDF for its format or its condition', async () => {
    const objects = new Map<string, Buffer>();
    setStorageAdapterForTests({
      async put(key, data) { objects.set(key, Buffer.from(data)); },
      async read(key) { return objects.get(key) ?? null; },
      async delete(key) { return objects.delete(key); },
      describe(key) { return `memory://${key}`; },
    });
    const picture = sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 30, b: 30 } },
    });
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic', 'latin1'), Buffer.alloc(64, 7),
    ]);
    const cases = [
      // Formats outside the usual three are converted to JPG.
      { data: await picture.clone().gif().toBuffer(), name: 'anim.gif', type: 'image/gif', mime: 'image/jpeg', ext: '.jpg' },
      { data: await picture.clone().tiff().toBuffer(), name: 'scan.tiff', type: 'image/tiff', mime: 'image/jpeg', ext: '.jpg' },
      // An iPhone picture the decoder cannot read is kept as sent.
      { data: heic, name: 'IMG_0042.HEIC', type: 'image/heic', mime: 'image/heic', ext: '.heic' },
      // A bank PDF without the standard ending.
      { data: Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n', 'latin1'), name: 'receipt.pdf', type: 'application/pdf', mime: 'application/pdf', ext: '.pdf' },
      // A picture cut short in transfer: kept as sent rather than refused.
      { data: Buffer.from([0x89, 0x50, 0x4e, 0x47]), name: 'cut.png', type: 'image/png', mime: 'image/png', ext: '.png' },
      // Declared as a picture but unreadable: kept, and never given a picture type.
      { data: Buffer.from('not really a picture'), name: 'proof.jpg', type: 'image/jpeg', mime: 'application/octet-stream', ext: '.bin' },
    ];
    for (const item of cases) {
      const uploaded = await processUpload(
        new File([new Uint8Array(item.data)], item.name, { type: item.type }),
        'payment-proofs',
      );
      if ('error' in uploaded) throw new Error(`${item.name}: ${uploaded.error}`);
      expect([item.name, uploaded.mimeType]).toEqual([item.name, item.mime]);
      expect(uploaded.fileName.endsWith(item.ext)).toBe(true);
      await expect(readUploadedFile('payment-proofs', uploaded.fileName)).resolves.not.toBeNull();
    }
    expect(objects.size).toBe(cases.length);
  });

  it('validates SupabaseStorageAdapter configuration and operations', async () => {
    const { SupabaseStorageAdapter } = await import('@/lib/storage/adapter');
    expect(() => new SupabaseStorageAdapter({ supabaseUrl: '', serviceRoleKey: '' })).toThrow(
      StorageConfigurationError
    );
    expect(() => new SupabaseStorageAdapter({
      supabaseUrl: 'http://test-project.supabase.co',
      serviceRoleKey: 'test-service-key',
    })).toThrow(/valid HTTPS SUPABASE_URL/);

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
