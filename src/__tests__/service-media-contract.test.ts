import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = process.cwd();
const seedSource = readFileSync(resolve(workspaceRoot, 'prisma/seed.ts'), 'utf8');

const serviceMediaAssets = [
  '/images/services/exterior-care.svg',
  '/images/services/interior-care.svg',
  '/images/services/complete-care.svg',
  '/images/services/vip-care.svg',
  '/images/services/upholstery-care.svg',
  '/images/services/roof-care.svg',
  '/images/services/engine-care.svg',
];

describe('service media contract', () => {
  it('ships a distinct local illustration for every seeded catalog service', () => {
    expect(seedSource).toContain('const SERVICE_MEDIA');
    expect(seedSource).toContain('coverImage: media.coverImage');
    expect(seedSource).toContain('galleryImages: media.galleryImages');

    for (const asset of serviceMediaAssets) {
      expect(seedSource).toContain(asset);
      expect(existsSync(resolve(workspaceRoot, 'public', asset.slice(1)))).toBe(true);
    }
  });

  it('keeps the initial operations resources wired into the development seed', () => {
    expect(seedSource).toContain("sku: 'BRQ-SHAMPOO-PH'");
    expect(seedSource).toContain('prisma.serviceMaterialRequirement.upsert');
    expect(seedSource).toContain("code: 'BRQ-OPS-01'");
    expect(seedSource).toContain('prisma.operationalVehicle.upsert');
  });
});
