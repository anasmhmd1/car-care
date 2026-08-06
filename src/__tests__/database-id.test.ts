import { describe, expect, it } from 'vitest';
import {
  DATABASE_ID_MAX_LENGTH,
  databaseIdSchema,
} from '@/lib/validations/database-id';

describe('databaseIdSchema', () => {
  it('accepts generated UUID entity IDs', () => {
    expect(databaseIdSchema.safeParse('16b6a8c3-183a-4a45-9ac8-2901edfd1d2d').success).toBe(true);
  });

  it('accepts deterministic seed entity IDs', () => {
    expect(databaseIdSchema.safeParse('seed-booking-under_review-1').success).toBe(true);
  });

  it('accepts an identifier exactly at the shared length limit', () => {
    expect(databaseIdSchema.safeParse(`s${'a'.repeat(DATABASE_ID_MAX_LENGTH - 1)}`).success).toBe(true);
  });

  it.each([
    '../seed-booking-1',
    'seed/booking/1',
    'seed\\booking\\1',
    'seed booking 1',
    ' seed-booking-1',
    'seed-booking-1 ',
  ])('rejects paths and whitespace: %s', (value) => {
    expect(databaseIdSchema.safeParse(value).success).toBe(false);
  });

  it('rejects inputs longer than the shared database-ID limit', () => {
    expect(databaseIdSchema.safeParse(`seed-${'a'.repeat(DATABASE_ID_MAX_LENGTH)}`).success).toBe(false);
  });
});
