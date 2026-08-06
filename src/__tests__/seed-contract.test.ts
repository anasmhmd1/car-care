import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const seedSource = readFileSync(resolve(process.cwd(), 'prisma/seed.ts'), 'utf8');

describe('development seed contract', () => {
  it('requires externally supplied passwords and refuses production', () => {
    expect(seedSource).toContain("requireSeedSecret('SEED_PASSWORD'");
    expect(seedSource).toContain("requireSeedSecret('SEED_ADMIN_PASSWORD'");
    expect(seedSource).toContain("NODE_ENV?.trim().toLowerCase() === 'production'");
    expect(seedSource).toContain('mustChangePwd: true');
  });

  it('does not regress to fixed secrets, remote stock images, or non-idempotent create calls', () => {
    expect(seedSource).not.toMatch(/bcrypt\.hash\(\s*['"]/);
    expect(seedSource).not.toMatch(/unsplash/i);
    expect(seedSource).not.toMatch(/prisma\.[a-zA-Z]+\.create\s*\(/);
    expect(seedSource).not.toMatch(/console\.(log|error)\([^)]*(password|secret).*process\.env/i);
  });

  it('stores seeded operational evidence behind the authenticated file route', () => {
    expect(seedSource).toContain('ensureSeedPrivateSvg');
    expect(seedSource).toContain("'seed-payment-proofs'");
    expect(seedSource).toContain("'seed-before'");
    expect(seedSource).toContain("'seed-after'");
    expect(seedSource).toContain('proofFileId: proofBookingFile.id');
    expect(seedSource).not.toMatch(/LOCAL_IMAGE\s*\+\s*['"]\?seed=/);
  });

  it('contains the required deterministic demo shape', () => {
    expect(seedSource.match(/slug: 'bareeq-[^']+'/g)).toHaveLength(7);
    expect(seedSource.match(/key: 'employee-[1-4]'/g)).toHaveLength(4);
    expect(seedSource.match(/key: 'customer-[1-3]'/g)).toHaveLength(6);
    expect(seedSource).toContain("bookingNumber: 'BQ-2026-1006'");
    expect(seedSource).toContain('serviceCount: 7');
    expect(seedSource).toContain('areaCount: 14');
  });
});
