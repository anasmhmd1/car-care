import { describe, expect, it } from 'vitest';
import { faqListSchema } from '@/lib/homepage-content';

describe('homepage FAQ content', () => {
  it('accepts and normalizes a non-empty list of question-answer pairs', () => {
    const result = faqListSchema.safeParse([
      { q: '  هل تشمل الخدمة التنقل؟  ', a: '  نعم، يصل الفريق إلى عنوانك.  ' },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([
        { q: 'هل تشمل الخدمة التنقل؟', a: 'نعم، يصل الفريق إلى عنوانك.' },
      ]);
    }
  });

  it('rejects empty, incomplete, and oversized FAQ content', () => {
    expect(faqListSchema.safeParse([]).success).toBe(false);
    expect(faqListSchema.safeParse([{ q: ' ', a: 'إجابة' }]).success).toBe(false);
    expect(faqListSchema.safeParse([{ q: 'سؤال', a: ' '.repeat(1_201) }]).success).toBe(false);
  });
});
