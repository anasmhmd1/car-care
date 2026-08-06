import { User } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import ProfileForms from './ProfileForms';

export const metadata = {
  title: 'الملف الشخصي | بريق للعناية بالسيارات',
};

export default async function ProfilePage() {
  const user = await getCurrentUser({ allowPasswordChangeRequired: true });
  if (!user) redirect('/login');

  return (
    <div className="space-y-8 pb-12" dir="rtl">
      <header className="border-b border-neutral-800 pb-6">
        <p className="flex items-center gap-2 text-xs font-bold text-[#e5c45a]"><User className="size-4" aria-hidden="true" />إعدادات الحساب</p>
        <h1 className="mt-2 text-3xl font-black text-white">الملف الشخصي والأمان</h1>
        <p className="mt-2 text-sm text-neutral-400">حدّث بيانات الاتصال وكلمة المرور، مع إبطال تلقائي للجلسات القديمة.</p>
      </header>
      <ProfileForms user={{ fullName: user.fullName, phone: user.phone, whatsapp: user.whatsapp, email: user.email, mustChangePwd: user.mustChangePwd }} />
    </div>
  );
}
