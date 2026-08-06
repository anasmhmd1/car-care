import { db } from '@/lib/db';
export { phoneHref, whatsappHref } from '@/lib/contact-links';

export const arabicDayNames = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;

export async function getPublicBranchContact() {
  return db.branch.findFirst({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      nameAr: true,
      address: true,
      phone: true,
      whatsapp: true,
      workingHours: {
        select: {
          dayOfWeek: true,
          isClosed: true,
          openTime: true,
          closeTime: true,
          breakStartTime: true,
          breakEndTime: true,
        },
        orderBy: { dayOfWeek: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}
