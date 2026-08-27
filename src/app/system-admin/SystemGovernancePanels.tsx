'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AssignmentMode, BranchStatus, UserRole } from '@prisma/client';
import {
  resetOwnerPasswordAction,
  updateBranchStatusAction,
  upsertAppSettingAction,
} from '@/app/actions/system-admin';
import {
  Activity,
  Building2,
  KeyRound,
  Save,
  ScrollText,
  Settings2,
  ShieldAlert,
  X,
} from 'lucide-react';

export interface SystemBranchDto {
  id: string;
  nameAr: string;
  code: string;
  address: string;
  phone: string;
  whatsapp: string;
  status: BranchStatus;
  assignmentMode: AssignmentMode;
  createdAt: Date | string;
  _count: {
    teams: number;
    coverageZones: number;
    memberships: number;
  };
}

export interface SystemOwnerDto {
  id: string;
  fullName: string;
  phone: string;
  active: boolean;
}

export interface SystemAuditDto {
  id: string;
  action: string;
  actorRole: UserRole;
  entityType: string;
  entityId: string;
  reason: string | null;
  createdAt: Date | string;
  actor: { fullName: string } | null;
}

export interface SecurityEventDto {
  id: string;
  eventType: string;
  description: string;
  ipAddress: string | null;
  createdAt: Date | string;
  user: { fullName: string; role: UserRole } | null;
}

export interface AppSettingDto {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: Date | string;
}

interface Props {
  branches: SystemBranchDto[];
  owners: SystemOwnerDto[];
  auditLogs: SystemAuditDto[];
  securityEvents: SecurityEventDto[];
  appSettings: AppSettingDto[];
}

type Feedback = { kind: 'success' | 'error'; message: string } | null;

const inputClass = 'w-full rounded-xl border border-neutral-800 bg-[#080808] px-3 py-2.5 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/70';

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}

function statusLabel(status: BranchStatus) {
  if (status === 'ACTIVE') return 'نشط';
  if (status === 'PAUSED') return 'متوقف مؤقتًا';
  return 'معطّل';
}

function statusClass(status: BranchStatus) {
  if (status === 'ACTIVE') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'PAUSED') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-red-500/30 bg-red-500/10 text-red-300';
}

export default function SystemGovernancePanels({
  branches,
  owners,
  auditLogs,
  securityEvents,
  appSettings,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [branchDialog, setBranchDialog] = useState<SystemBranchDto | null>(null);
  const [branchStatus, setBranchStatus] = useState<BranchStatus>('ACTIVE');
  const [branchReason, setBranchReason] = useState('');
  const [ownerDialog, setOwnerDialog] = useState<SystemOwnerDto | null>(null);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerResetReason, setOwnerResetReason] = useState('');

  function openBranchDialog(branch: SystemBranchDto) {
    setBranchDialog(branch);
    setBranchStatus(branch.status);
    setBranchReason('');
    setFeedback(null);
  }

  function openOwnerDialog(owner: SystemOwnerDto) {
    setOwnerDialog(owner);
    setOwnerPassword('');
    setOwnerResetReason('');
    setFeedback(null);
  }

  async function handleBranchStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!branchDialog) return;
    if (branchReason.trim().length < 5) {
      setFeedback({ kind: 'error', message: 'اكتب سببًا واضحًا لا يقل عن 5 أحرف.' });
      return;
    }
    setPending(true);
    setFeedback(null);
    const formData = new FormData();
    formData.set('branchId', branchDialog.id);
    formData.set('status', branchStatus);
    formData.set('reason', branchReason.trim());
    const result = await updateBranchStatusAction(formData);
    setPending(false);
    if (result.error) {
      setFeedback({ kind: 'error', message: result.error });
      return;
    }
    setBranchDialog(null);
    setFeedback({ kind: 'success', message: 'تم تعديل حالة الفرع وتسجيل التدخل في سجل التدقيق.' });
    router.refresh();
  }

  async function handleOwnerReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerDialog) return;
    if (ownerPassword.length < 12 || ownerResetReason.trim().length < 5) {
      setFeedback({ kind: 'error', message: 'أدخل كلمة مؤقتة من 12 حرفًا على الأقل وسببًا واضحًا.' });
      return;
    }
    setPending(true);
    setFeedback(null);
    const formData = new FormData();
    formData.set('ownerId', ownerDialog.id);
    formData.set('password', ownerPassword);
    formData.set('reason', ownerResetReason.trim());
    const result = await resetOwnerPasswordAction(formData);
    setPending(false);
    if (result.error) {
      setFeedback({ kind: 'error', message: result.error });
      return;
    }
    setOwnerDialog(null);
    setOwnerPassword('');
    setFeedback({ kind: 'success', message: 'تم تعيين كلمة مؤقتة وإلغاء كل جلسات المالك الحالية.' });
    router.refresh();
  }

  async function handleSetting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);
    const form = event.currentTarget;
    const result = await upsertAppSettingAction(new FormData(form));
    setPending(false);
    if (result.error) {
      setFeedback({ kind: 'error', message: result.error });
      return;
    }
    form.reset();
    setFeedback({ kind: 'success', message: 'تم حفظ إعداد النظام وتسجيل التغيير.' });
    router.refresh();
  }

  const modalFeedback = feedback ? (
    <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm font-bold ${feedback.kind === 'error' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
      {feedback.message}
    </div>
  ) : null;

  return (
    <div className="space-y-8">
      {feedback && !branchDialog && !ownerDialog ? (
        <div role={feedback.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`rounded-2xl border px-5 py-4 text-sm font-bold ${feedback.kind === 'error' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
          {feedback.message}
        </div>
      ) : null}

      <section id="branches" aria-labelledby="system-branches-title" className="space-y-5 rounded-3xl border border-[#c9a227]/30 bg-[#141414] p-6 sm:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#c9a227]">Branches</p>
          <h2 id="system-branches-title" className="mt-2 flex items-center gap-2 text-xl font-bold text-white"><Building2 className="size-5" aria-hidden="true" /> جميع فروع بريق</h2>
          <p className="mt-2 text-xs leading-6 text-neutral-400">عرض مركزي لكل الفروع. تغيير الحالة تدخل تقني حساس ويتطلب سببًا ويُسجل ذريًا.</p>
        </div>
        {branches.length === 0 ? <p className="rounded-2xl bg-[#080808] p-8 text-center text-sm text-neutral-500">لا توجد فروع مسجلة.</p> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {branches.map((branch) => (
              <article key={branch.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="font-bold text-white">{branch.nameAr}</h3><p dir="ltr" className="mt-1 text-left font-mono text-xs text-neutral-500">{branch.code}</p></div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(branch.status)}`}>{statusLabel(branch.status)}</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-neutral-400">{branch.address}</p>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-neutral-500">الفرق</dt><dd className="mt-1 font-bold text-white">{branch._count.teams}</dd></div>
                  <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-neutral-500">الزونات</dt><dd className="mt-1 font-bold text-white">{branch._count.coverageZones}</dd></div>
                  <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-neutral-500">العضويات</dt><dd className="mt-1 font-bold text-white">{branch._count.memberships}</dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500">
                  <span>{branch.assignmentMode === 'AUTOMATIC' ? 'توزيع تلقائي' : 'توزيع يدوي'}</span>
                  <button type="button" onClick={() => openBranchDialog(branch)} className="min-h-10 rounded-xl border border-[#c9a227]/35 px-4 font-bold text-[#e5c45a] hover:bg-[#c9a227]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]">تصحيح الحالة</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="owner-security" aria-labelledby="owner-security-title" className="space-y-5 rounded-3xl border border-[#c9a227]/30 bg-[#141414] p-6 sm:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#c9a227]">Owner security</p>
          <h2 id="owner-security-title" className="mt-2 flex items-center gap-2 text-xl font-bold"><KeyRound className="size-5" aria-hidden="true" /> إعادة تعيين وصول الملاك</h2>
          <p className="mt-2 text-xs leading-6 text-neutral-400">ينشئ كلمة مؤقتة، يفرض تغييرها عند الدخول التالي، ويلغي كل الجلسات المفتوحة.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {owners.map((owner) => (
            <article key={owner.id} className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-[#080808] p-4">
              <div className="min-w-0"><p className="truncate font-bold text-white">{owner.fullName}</p></div>
              <button type="button" onClick={() => openOwnerDialog(owner)} className="min-h-10 shrink-0 rounded-xl border border-[#c9a227]/35 px-4 text-xs font-bold text-[#e5c45a] hover:bg-[#c9a227]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]">كلمة مؤقتة</button>
            </article>
          ))}
        </div>
      </section>

      <section id="system-settings" aria-labelledby="system-settings-title" className="space-y-6 rounded-3xl border border-[#c9a227]/30 bg-[#141414] p-6 sm:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#c9a227]">System settings</p>
          <h2 id="system-settings-title" className="mt-2 flex items-center gap-2 text-xl font-bold"><Settings2 className="size-5" aria-hidden="true" /> إعدادات النظام العامة</h2>
          <p className="mt-2 text-xs leading-6 text-neutral-400">قيم JSON تشغيلية غير سرية. الأسرار تبقى في متغيرات البيئة ولا تُحفظ هنا.</p>
        </div>
        <form onSubmit={handleSetting} className="grid gap-4 rounded-2xl border border-neutral-800 bg-[#080808] p-5 lg:grid-cols-2">
          <div><label htmlFor="setting-key" className="mb-2 block text-xs font-bold text-neutral-300">المفتاح</label><input id="setting-key" name="key" required maxLength={64} dir="ltr" placeholder="BOOKING.NOTICE_DAYS" className={`${inputClass} text-left font-mono`} /></div>
          <div><label htmlFor="setting-description" className="mb-2 block text-xs font-bold text-neutral-300">الوصف</label><input id="setting-description" name="description" required minLength={3} maxLength={300} placeholder="الغرض التشغيلي من الإعداد" className={inputClass} /></div>
          <div className="lg:col-span-2"><label htmlFor="setting-value" className="mb-2 block text-xs font-bold text-neutral-300">قيمة JSON</label><textarea id="setting-value" name="value" required maxLength={10000} rows={4} dir="ltr" placeholder={'{"enabled": true, "days": 3}'} className={`${inputClass} resize-y text-left font-mono`} /></div>
          <div><label htmlFor="setting-reason" className="mb-2 block text-xs font-bold text-neutral-300">سبب الإنشاء أو التعديل</label><input id="setting-reason" name="reason" required minLength={5} maxLength={500} className={inputClass} /></div>
          <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-[#d4af37] px-5 text-sm font-black text-[#080808] disabled:opacity-50"><Save className="size-4" aria-hidden="true" /> حفظ الإعداد</button>
        </form>
        {appSettings.length ? <div className="grid gap-3 lg:grid-cols-2">{appSettings.map((setting) => <article key={setting.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 dir="ltr" className="break-all text-left font-mono text-sm font-bold text-[#e5c45a]">{setting.key}</h3><time className="text-[11px] text-neutral-600">{formatDateTime(setting.updatedAt)}</time></div><p className="mt-2 text-xs leading-5 text-neutral-400">{setting.description || 'بلا وصف'}</p><pre dir="ltr" className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-black/40 p-3 text-left text-xs text-neutral-300">{JSON.stringify(setting.value, null, 2)}</pre></article>)}</div> : <p className="text-sm text-neutral-500">لا توجد إعدادات عامة مسجلة بعد.</p>}
      </section>

      <section id="security-events" aria-labelledby="security-events-title" className="space-y-5 rounded-3xl border border-red-500/20 bg-[#141414] p-6 sm:p-8">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">Security</p><h2 id="security-events-title" className="mt-2 flex items-center gap-2 text-xl font-bold"><ShieldAlert className="size-5" aria-hidden="true" /> أحداث الأمان</h2><p className="mt-2 text-xs text-neutral-400">آخر 100 حدث أمني مسجل، للعرض فقط.</p></div>
        {securityEvents.length ? <div className="space-y-3">{securityEvents.map((event) => <article key={event.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p dir="ltr" className="break-words font-mono text-xs font-bold text-red-200">{event.eventType}</p><p className="mt-2 text-sm leading-6 text-neutral-300">{event.description}</p></div><time className="shrink-0 text-xs text-neutral-600">{formatDateTime(event.createdAt)}</time></div><p className="mt-3 text-xs text-neutral-500">{event.user ? `${event.user.fullName} · ${event.user.role}` : 'غير مرتبط بمستخدم'}{event.ipAddress ? ` · ${event.ipAddress}` : ''}</p></article>)}</div> : <p className="rounded-2xl bg-[#080808] p-8 text-center text-sm text-neutral-500">لا توجد أحداث أمان مسجلة.</p>}
      </section>

      <section id="system-audit" aria-labelledby="system-audit-title" className="space-y-5 rounded-3xl border border-[#c9a227]/30 bg-[#141414] p-6 sm:p-8">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#c9a227]">Audit</p><h2 id="system-audit-title" className="mt-2 flex items-center gap-2 text-xl font-bold"><ScrollText className="size-5" aria-hidden="true" /> سجل التدقيق العام</h2><p className="mt-2 text-xs text-neutral-400">آخر 100 عملية حساسة على مستوى النظام. السجل غير قابل للتعديل أو الحذف.</p></div>
        {auditLogs.length ? <div className="space-y-3">{auditLogs.map((log) => <article key={log.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p dir="ltr" className="break-words font-mono text-sm font-bold text-[#e5c45a]">{log.action}</p><p className="mt-1 text-xs text-neutral-500">{log.actor?.fullName || 'System'} · {log.actorRole}</p></div><time className="shrink-0 text-xs text-neutral-600">{formatDateTime(log.createdAt)}</time></div><div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-400"><span dir="ltr" className="rounded-full bg-white/[0.05] px-2 py-1">{log.entityType}</span><span dir="ltr" className="max-w-full truncate rounded-full bg-white/[0.05] px-2 py-1">{log.entityId}</span></div>{log.reason ? <p className="mt-3 text-sm leading-6 text-neutral-400">{log.reason}</p> : null}</article>)}</div> : <p className="rounded-2xl bg-[#080808] p-8 text-center text-sm text-neutral-500">لا توجد عمليات تدقيق مسجلة.</p>}
      </section>

      {branchDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="branch-status-dialog-title">
          <form onSubmit={handleBranchStatus} className="w-full max-w-lg space-y-5 rounded-3xl border border-[#c9a227]/40 bg-[#141414] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4"><div><h2 id="branch-status-dialog-title" className="text-xl font-bold">تصحيح حالة {branchDialog.nameAr}</h2><p className="mt-2 text-xs leading-5 text-neutral-400">لن يُحذف أي سجل. قد يوقف هذا الإجراء ظهور الفرع وقبول الحجوزات الجديدة.</p></div><button type="button" disabled={pending} onClick={() => { setBranchDialog(null); setFeedback(null); }} aria-label="إغلاق" className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]"><X className="size-5" aria-hidden="true" /></button></div>
            {modalFeedback}
            <div><label htmlFor="corrected-branch-status" className="mb-2 block text-xs font-bold text-neutral-300">الحالة الجديدة</label><select id="corrected-branch-status" value={branchStatus} onChange={(event) => setBranchStatus(event.target.value as BranchStatus)} className={inputClass}><option value="ACTIVE">نشط</option><option value="PAUSED">متوقف مؤقتًا</option><option value="DISABLED">معطّل</option></select></div>
            <div><label htmlFor="branch-status-reason" className="mb-2 block text-xs font-bold text-neutral-300">سبب التدخل</label><textarea id="branch-status-reason" value={branchReason} onChange={(event) => setBranchReason(event.target.value)} required minLength={5} maxLength={500} rows={4} autoFocus className={`${inputClass} resize-y`} /></div>
            <div className="flex justify-end gap-3"><button type="button" disabled={pending} onClick={() => { setBranchDialog(null); setFeedback(null); }} className="min-h-11 rounded-xl bg-neutral-800 px-5 text-sm font-bold text-neutral-200">إلغاء</button><button type="submit" disabled={pending || branchStatus === branchDialog.status} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d4af37] px-5 text-sm font-black text-[#080808] disabled:opacity-50"><Activity className="size-4" aria-hidden="true" /> تأكيد التعديل</button></div>
          </form>
        </div>
      ) : null}

      {ownerDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="owner-reset-dialog-title">
          <form onSubmit={handleOwnerReset} className="w-full max-w-lg space-y-5 rounded-3xl border border-[#c9a227]/40 bg-[#141414] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4"><div><h2 id="owner-reset-dialog-title" className="text-xl font-bold">إعادة تعيين كلمة مرور {ownerDialog.fullName}</h2><p className="mt-2 text-xs leading-5 text-neutral-400">ستُلغى جلساته فورًا وسيُجبر على استبدال الكلمة المؤقتة بعد تسجيل الدخول.</p></div><button type="button" disabled={pending} onClick={() => { setOwnerDialog(null); setFeedback(null); }} aria-label="إغلاق" className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]"><X className="size-5" aria-hidden="true" /></button></div>
            {modalFeedback}
            <div><label htmlFor="owner-temp-password" className="mb-2 block text-xs font-bold text-neutral-300">كلمة المرور المؤقتة</label><input id="owner-temp-password" type="password" autoComplete="new-password" value={ownerPassword} onChange={(event) => setOwnerPassword(event.target.value)} minLength={8} required autoFocus className={inputClass} /></div>
            <div><label htmlFor="owner-reset-reason" className="mb-2 block text-xs font-bold text-neutral-300">سبب إعادة التعيين</label><textarea id="owner-reset-reason" value={ownerResetReason} onChange={(event) => setOwnerResetReason(event.target.value)} minLength={5} maxLength={500} required rows={3} className={`${inputClass} resize-y`} /></div>
            <div className="flex justify-end gap-3"><button type="button" disabled={pending} onClick={() => { setOwnerDialog(null); setFeedback(null); }} className="min-h-11 rounded-xl bg-neutral-800 px-5 text-sm font-bold text-neutral-200">إلغاء</button><button type="submit" disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d4af37] px-5 text-sm font-black text-[#080808] disabled:opacity-50"><KeyRound className="size-4" aria-hidden="true" /> إلغاء الجلسات وتعيين الكلمة</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
