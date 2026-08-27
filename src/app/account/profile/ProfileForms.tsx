'use client';

import { useState, useTransition } from 'react';
import { Mail, Phone, Save, Shield, User } from 'lucide-react';
import { changePasswordAction, updateProfileAction } from '@/app/actions/customer';

interface ProfileFormsProps {
  user: {
    fullName: string;
    phone: string;
    whatsapp: string | null;
    email: string | null;
    mustChangePwd: boolean;
  };
}

type Notice = { kind: 'success' | 'error'; text: string } | null;

const inputClass = 'w-full rounded-xl border border-neutral-800 bg-[#080808] p-3 text-sm text-white outline-none transition focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20';

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-xs font-bold ${notice.kind === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
      {notice.text}
    </p>
  );
}

export default function ProfileForms({ user }: ProfileFormsProps) {
  const [isPending, startTransition] = useTransition();
  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(
    user.mustChangePwd ? { kind: 'error', text: 'يجب تغيير كلمة المرور المؤقتة قبل متابعة استخدام الحساب.' } : null
  );

  function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setProfileNotice(null);
    startTransition(async () => {
      const result = await updateProfileAction(data);
      setProfileNotice(result.error
        ? { kind: 'error', text: result.error }
        : { kind: 'success', text: 'تم حفظ بيانات الحساب.' });
    });
  }

  function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPasswordNotice(null);
    startTransition(async () => {
      const result = await changePasswordAction(data);
      if (result.error) {
        setPasswordNotice({ kind: 'error', text: result.error });
        return;
      }
      form.reset();
      setPasswordNotice({ kind: 'success', text: 'تم تغيير كلمة المرور وإنهاء كل الجلسات القديمة.' });
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#c9a227]/25 bg-[#121212] p-5 sm:p-6" aria-labelledby="profile-information-title">
        <h2 id="profile-information-title" className="flex items-center gap-2 border-b border-neutral-800 pb-4 text-base font-black text-[#e5c45a]">
          <User className="size-4" aria-hidden="true" /> البيانات الشخصية
        </h2>
        <form onSubmit={submitProfile} className="mt-5 space-y-4">
          <NoticeBox notice={profileNotice} />
          <label className="block text-xs font-bold text-neutral-300">الاسم بالكامل<input name="fullName" required minLength={3} defaultValue={user.fullName} className={`mt-2 ${inputClass}`} autoComplete="name" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-bold text-neutral-300"><span className="flex items-center gap-1.5"><Phone className="size-3.5 text-[#c9a227]" aria-hidden="true" />رقم الهاتف</span><input name="phone" type="tel" required defaultValue={user.phone} className={`mt-2 ${inputClass}`} autoComplete="tel" dir="ltr" /></label>
            <label className="block text-xs font-bold text-neutral-300">رقم واتساب<input name="whatsapp" type="tel" defaultValue={user.whatsapp ?? user.phone} className={`mt-2 ${inputClass}`} autoComplete="tel" dir="ltr" /></label>
          </div>
          <label className="block text-xs font-bold text-neutral-300"><span className="flex items-center gap-1.5"><Mail className="size-3.5 text-[#c9a227]" aria-hidden="true" />البريد الإلكتروني</span><input name="email" type="email" defaultValue={user.email ?? ''} className={`mt-2 ${inputClass}`} autoComplete="email" dir="ltr" /></label>
          <div className="flex justify-end"><button type="submit" disabled={isPending} className="inline-flex min-h-11 items-center gap-2 rounded-xl gold-gradient px-6 text-xs font-black text-[#080808] disabled:opacity-50"><Save className="size-4" aria-hidden="true" />{isPending ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}</button></div>
        </form>
      </section>

      <section className="rounded-3xl border border-neutral-800 bg-[#121212] p-5 sm:p-6" aria-labelledby="password-title">
        <h2 id="password-title" className="flex items-center gap-2 border-b border-neutral-800 pb-4 text-base font-black text-white"><Shield className="size-4 text-[#c9a227]" aria-hidden="true" />كلمة المرور والجلسات</h2>
        <form onSubmit={submitPassword} className="mt-5 space-y-4">
          <NoticeBox notice={passwordNotice} />
          <label className="block text-xs font-bold text-neutral-300">كلمة المرور الحالية<input name="currentPassword" type="password" required className={`mt-2 ${inputClass}`} autoComplete="current-password" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-bold text-neutral-300">كلمة المرور الجديدة<input name="newPassword" type="password" required minLength={8} className={`mt-2 ${inputClass}`} autoComplete="new-password" /></label>
            <label className="block text-xs font-bold text-neutral-300">تأكيد كلمة المرور<input name="confirmPassword" type="password" required minLength={8} className={`mt-2 ${inputClass}`} autoComplete="new-password" /></label>
          </div>
          <p className="text-[11px] leading-5 text-neutral-500">استخدم 8 خانات على الأقل (أرقام أو حروف). تغيير كلمة المرور يلغي كل الجلسات السابقة تلقائيًا.</p>
          <div className="flex justify-end"><button type="submit" disabled={isPending} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#c9a227]/35 bg-[#c9a227]/10 px-6 text-xs font-black text-[#e5c45a] disabled:opacity-50"><Shield className="size-4" aria-hidden="true" />{isPending ? 'جارٍ التحديث…' : 'تحديث كلمة المرور'}</button></div>
        </form>
      </section>
    </div>
  );
}
