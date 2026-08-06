import { z } from 'zod';

export const DATABASE_ID_MAX_LENGTH = 200;
export const DATABASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Prisma entity IDs are strings in this project. Production rows normally use
 * UUIDs, while deterministic seed rows use readable IDs such as
 * `seed-booking-under-review`. Keep the accepted surface deliberately narrow:
 * ASCII letters/numbers plus `_` and `-`, with no trimming or path characters.
 */
export const databaseIdSchema = z
  .string()
  .min(1, 'المعرّف مطلوب.')
  .max(DATABASE_ID_MAX_LENGTH, 'المعرّف أطول من الحد المسموح.')
  .regex(DATABASE_ID_PATTERN, 'المعرّف غير صالح.');

