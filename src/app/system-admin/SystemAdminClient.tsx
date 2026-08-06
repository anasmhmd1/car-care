'use client';

import { useState } from 'react';
import type { BranchRequestStatus } from '@prisma/client';
import SystemGovernancePanels, {
  type AppSettingDto,
  type SecurityEventDto,
  type SystemAuditDto,
  type SystemBranchDto,
} from './SystemGovernancePanels';
import { 
  reviewBranchRequestAction, 
  createOwnerAccountAction, 
  updateBrandMaxBranchesAction, 
  toggleUserActiveStatusAction 
} from '@/app/actions/system-admin';
import { 
  CheckCircle2, 
  XCircle, 
  Building, 
  UserCheck, 
  UserPlus, 
  Settings, 
  Power
} from 'lucide-react';

interface BrandDto {
  maxBranches: number;
}

interface BranchRequestDto {
  id: string;
  branchName: string;
  reason: string;
  status: BranchRequestStatus;
  createdAt: Date;
  owner: {
    fullName: string;
    phone: string;
  };
}

interface OwnerDto {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  active: boolean;
}

interface FeedbackMessage {
  kind: 'error' | 'success';
  message: string;
}

interface Props {
  brand: BrandDto | null;
  branchRequests: BranchRequestDto[];
  owners: OwnerDto[];
  branches: SystemBranchDto[];
  auditLogs: SystemAuditDto[];
  securityEvents: SecurityEventDto[];
  appSettings: AppSettingDto[];
}

export default function SystemAdminClient({
  brand,
  branchRequests,
  owners,
  branches,
  auditLogs,
  securityEvents,
  appSettings,
}: Props) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<BranchRequestDto | null>(null);
  const [branchCode, setBranchCode] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchWhatsapp, setBranchWhatsapp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);

  // Brand max branches form state
  const [maxBranchesInput, setMaxBranchesInput] = useState(brand?.maxBranches || 1);

  // New owner creation form state
  const [showNewOwnerModal, setShowNewOwnerModal] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');

  const closeReviewModal = () => {
    setSelectedRequest(null);
    setRejectionReason('');
    setBranchCode('');
    setBranchAddress('');
    setBranchPhone('');
    setBranchWhatsapp('');
    setFeedback(null);
  };

  const openReviewModal = (request: BranchRequestDto) => {
    setSelectedRequest(request);
    setRejectionReason('');
    setBranchCode('');
    setBranchAddress('');
    setBranchPhone('');
    setBranchWhatsapp('');
    setFeedback(null);
  };

  const handleReview = async (decision: 'APPROVE' | 'REJECT' | 'NEEDS_INFORMATION') => {
    if (!selectedRequest) return;

    if (decision !== 'APPROVE' && rejectionReason.trim().length < 5) {
      setFeedback({ kind: 'error', message: decision === 'REJECT' ? 'يرجى كتابة سبب الرفض' : 'يرجى توضيح المعلومات المطلوبة من المالك' });
      return;
    }
    if (
      decision === 'APPROVE' &&
      (!/^[A-Z0-9-]{3,24}$/.test(branchCode.trim().toUpperCase()) ||
        branchAddress.trim().length < 5 ||
        !/^\+?\d{10,15}$/.test(branchPhone.trim()) ||
        !/^\+?\d{10,15}$/.test(branchWhatsapp.trim()))
    ) {
      setFeedback({
        kind: 'error',
        message: 'أكمل كود الفرع والعنوان ورقمي الهاتف وواتساب بصيغة صحيحة قبل الموافقة.',
      });
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);
    const fd = new FormData();
    fd.append('requestId', selectedRequest.id);
    fd.append('decision', decision);
    fd.append('rejectionReason', rejectionReason);
    fd.append('branchCode', branchCode.trim().toUpperCase());
    fd.append('branchAddress', branchAddress.trim());
    fd.append('branchPhone', branchPhone.trim());
    fd.append('branchWhatsapp', branchWhatsapp.trim());

    const res = await reviewBranchRequestAction(fd);
    setIsSubmitting(false);

    if (res.error) {
      setFeedback({ kind: 'error', message: res.error });
    } else {
      closeReviewModal();
      setFeedback({
        kind: 'success',
        message: decision === 'APPROVE'
          ? 'تمت الموافقة وإنشاء الفرع بنجاح.'
          : decision === 'REJECT'
            ? 'تم رفض الطلب وحفظ السبب.'
            : 'تمت إعادة الطلب إلى المالك لاستكمال المعلومات.',
      });
    }
  };

  const handleUpdateMaxBranches = async () => {
    setFeedback(null);
    setIsSubmitting(true);
    const fd = new FormData();
    fd.append('maxBranches', String(maxBranchesInput));

    const res = await updateBrandMaxBranchesAction(fd);
    setIsSubmitting(false);

    if (res?.error) {
      setFeedback({ kind: 'error', message: res.error });
    } else {
      setFeedback({ kind: 'success', message: 'تم تحديث الحد الأقصى للفروع بنجاح' });
    }
  };

  const handleCreateOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerName || !ownerPhone || ownerPassword.length < 12) {
      setFeedback({ kind: 'error', message: 'يرجى إدخال اسم المالك ورقم الهاتف وكلمة مرور مؤقتة من 12 حرفًا على الأقل' });
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);
    const fd = new FormData();
    fd.append('fullName', ownerName);
    fd.append('phone', ownerPhone);
    fd.append('email', ownerEmail);
    fd.append('password', ownerPassword);

    const res = await createOwnerAccountAction(fd);
    setIsSubmitting(false);

    if (res?.error) {
      setFeedback({ kind: 'error', message: res.error });
    } else {
      setFeedback({ kind: 'success', message: 'تم إنشاء حساب المالك الأول (Owner Account) بنجاح' });
      setShowNewOwnerModal(false);
      setOwnerName('');
      setOwnerPhone('');
      setOwnerEmail('');
      setOwnerPassword('');
    }
  };

  const handleToggleActive = async (userId: string) => {
    setFeedback(null);
    setIsSubmitting(true);
    const fd = new FormData();
    fd.append('userId', userId);

    const res = await toggleUserActiveStatusAction(fd);
    setIsSubmitting(false);

    if (res?.error) {
      setFeedback({ kind: 'error', message: res.error });
    }
  };

  return (
    <div className="space-y-8">
      <nav aria-label="أقسام إدارة النظام" className="sticky top-3 z-30 overflow-x-auto rounded-2xl border border-white/10 bg-[#101010]/95 p-2 shadow-2xl backdrop-blur-xl">
        <div className="flex min-w-max gap-2 text-xs font-bold text-neutral-300">
          <a href="#brand-settings" className="rounded-xl px-3 py-2 hover:bg-white/[0.06] hover:text-white">إعدادات البراند</a>
          <a href="#owners" className="rounded-xl px-3 py-2 hover:bg-white/[0.06] hover:text-white">الملاك</a>
          <a href="#branch-requests" className="rounded-xl px-3 py-2 hover:bg-white/[0.06] hover:text-white">طلبات الفروع</a>
          <a href="#branches" className="rounded-xl px-3 py-2 hover:bg-white/[0.06] hover:text-white">الفروع</a>
          <a href="#owner-security" className="rounded-xl px-3 py-2 hover:bg-white/[0.06] hover:text-white">أمان الملاك</a>
          <a href="#system-settings" className="rounded-xl px-3 py-2 hover:bg-white/[0.06] hover:text-white">إعدادات النظام</a>
          <a href="#security-events" className="rounded-xl px-3 py-2 hover:bg-white/[0.06] hover:text-white">أحداث الأمان</a>
          <a href="#system-audit" className="rounded-xl px-3 py-2 hover:bg-white/[0.06] hover:text-white">سجل التدقيق</a>
        </div>
      </nav>
      {feedback && (
        <div
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          aria-live={feedback.kind === 'error' ? 'assertive' : 'polite'}
          className={`rounded-2xl border px-5 py-4 text-sm font-bold ${
            feedback.kind === 'error'
              ? 'border-red-500/40 bg-red-500/10 text-red-300'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {feedback.message}
        </div>
      )}
      
      {/* Top Banner: Brand Settings & Max Branches Control */}
      <div id="brand-settings" className="scroll-mt-24 bg-[#141414] p-8 rounded-3xl border border-[#c9a227]/30 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#c9a227]" />
            <span>إعدادات العلامة التجارية والحد الأقصى للفروع (Singleton max_branches)</span>
          </h2>
          <p className="text-xs text-neutral-400">
            القيمة الحالية: <strong className="text-[#e5c45a]">{brand?.maxBranches || 1} فرع مسموح به</strong> (تطبق على مستوى البراند وليس المالك)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="number"
            min="1"
            max="100"
            value={maxBranchesInput}
            onChange={(e) => setMaxBranchesInput(Number(e.target.value))}
            className="w-24 bg-[#080808] border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white text-center font-mono"
          />
          <button
            onClick={handleUpdateMaxBranches}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl gold-gradient text-[#080808] font-bold text-xs shadow-md"
          >
            تعديل max_branches
          </button>
        </div>
      </div>

      {/* Owner Accounts Management Section (First Owner Creation & Toggle) */}
      <div id="owners" className="scroll-mt-24 bg-[#141414] p-8 rounded-3xl border border-[#c9a227]/30 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-[#c9a227]" />
              <span>إدارة الحسابات العليا للملاك (Owners Management)</span>
            </h2>
            <p className="text-xs text-neutral-400">إنشاء حساب Owner الأول، تفعيل أو تعطيل الحسابات، وإدارة الصلاحية التشغيلية العليا</p>
          </div>

          <button
            onClick={() => setShowNewOwnerModal(true)}
            className="px-5 py-2.5 rounded-xl bg-[#080808] border border-[#c9a227]/40 text-[#e5c45a] font-bold text-xs flex items-center gap-2 hover:bg-[#c9a227]/10"
          >
            <UserPlus className="w-4 h-4 text-[#c9a227]" />
            <span>إنشاء Owner جديد / الأول</span>
          </button>
        </div>

        {owners.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500 bg-[#080808] rounded-2xl">
            لا توجد حسابات ملاك (Owners) مسجلة في النظام. اضغط على &quot;إنشاء Owner جديد / الأول&quot; لإعداد الحساب الأول.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {owners.map((o) => (
              <div key={o.id} className="p-5 rounded-2xl bg-[#080808] border border-neutral-800 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">{o.fullName}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-[#c9a227]/20 text-[#e5c45a]">OWNER</span>
                  </div>
                  <div className="text-xs text-neutral-400 font-mono">{o.phone} | {o.email || 'لا يوجد بريد'}</div>
                </div>

                <button
                  onClick={() => handleToggleActive(o.id)}
                  disabled={isSubmitting}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    o.active
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{o.active ? 'نشط (تعطيل)' : 'معطل (تفعيل)'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Branch Requests Queue */}
      <div id="branch-requests" className="scroll-mt-24 bg-[#141414] p-8 rounded-3xl border border-red-500/30 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Building className="w-5 h-5 text-red-400" />
            <span>طلبات الفروع المقدمة من المالك (Owner Branch Requests)</span>
          </h2>
          <span className="text-xs text-neutral-400">الموافقة تنشئ الفرع وتحدّث الحد الأقصى ذريًا في العملية نفسها</span>
        </div>

        {branchRequests.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500 bg-[#080808] rounded-2xl">
            لا توجد طلبات فروع جديدة بانتظار الموافقة.
          </div>
        ) : (
          <div className="space-y-4">
            {branchRequests.map((req) => (
              <div key={req.id} className="p-6 rounded-2xl bg-[#080808] border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm text-[#e5c45a]">{req.branchName}</span>
                    <span className="text-xs text-neutral-400">طلب بواسطة Owner: {req.owner.fullName}</span>
                  </div>
                  <p className="text-xs text-neutral-300">السبب والخطة: {req.reason}</p>
                  <div className="text-[11px] text-neutral-500">تاريخ الطلب: {new Date(req.createdAt).toLocaleString('ar-EG')}</div>
                </div>

                {req.status === 'PENDING' || req.status === 'NEEDS_INFORMATION' ? (
                  <button
                    onClick={() => openReviewModal(req)}
                    className="px-5 py-2.5 rounded-xl gold-gradient text-[#080808] font-bold text-xs shadow-md shrink-0"
                  >
                    مراجعة الطلب واتخاذ القرار
                  </button>
                ) : (
                  <span className={`px-4 py-1.5 rounded-full text-xs font-bold ${req.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    الحالة: {req.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <SystemGovernancePanels
        branches={branches}
        owners={owners}
        auditLogs={auditLogs}
        securityEvents={securityEvents}
        appSettings={appSettings}
      />

      {/* New Owner Modal */}
      {showNewOwnerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#c9a227]/40 p-8 rounded-3xl max-w-md w-full space-y-6">
            <h3 className="text-xl font-bold text-white">إنشاء حساب المالك الأول (New Owner Account)</h3>

            <form onSubmit={handleCreateOwner} className="space-y-4">
              <div>
                <label className="text-xs text-neutral-300 block mb-1">الاسم الكامل *</label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="المهندس طارق المالكي..."
                  className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs text-neutral-300 block mb-1">رقم الهاتف *</label>
                <input
                  type="text"
                  required
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="01111111111"
                  className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-neutral-300 block mb-1">البريد الإلكتروني (اختياري)</label>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="owner@bareeq.car"
                  className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs text-neutral-300 block mb-1">كلمة المرور المؤقتة *</label>
                <input
                  type="password"
                  required
                  minLength={12}
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  placeholder="12 حرفاً على الأقل"
                  className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-xs text-white font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewOwnerModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-neutral-800 text-neutral-300 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl gold-gradient text-[#080808] font-bold text-xs"
                >
                  حفظ وإنشاء الحساب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="branch-review-title">
          <div className="bg-[#141414] border border-[#c9a227]/40 p-6 sm:p-8 rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto space-y-6">
            <h3 id="branch-review-title" className="text-xl font-bold text-white">قرار طلب الفرع: {selectedRequest.branchName}</h3>
            
            <div className="space-y-2 font-mono text-xs text-neutral-300 p-4 rounded-xl bg-[#080808]">
              <div>المالك طالب الفرع: {selectedRequest.owner.fullName} ({selectedRequest.owner.phone})</div>
              <div>مبرر الإضافة: {selectedRequest.reason}</div>
            </div>

            {feedback && (
              <div
                role={feedback.kind === 'error' ? 'alert' : 'status'}
                className={`rounded-xl border px-4 py-3 text-xs font-bold ${
                  feedback.kind === 'error'
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                }`}
              >
                {feedback.message}
              </div>
            )}

            <fieldset className="space-y-4 rounded-2xl border border-neutral-800 p-4">
              <legend className="px-2 text-sm font-bold text-[#e5c45a]">بيانات الفرع الذي سيُنشأ عند الموافقة</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="branch-code" className="mb-1 block text-xs text-neutral-300">كود الفرع *</label>
                  <input
                    id="branch-code"
                    value={branchCode}
                    onChange={(event) => setBranchCode(event.target.value.toUpperCase())}
                    placeholder="CAI-02"
                    pattern="[A-Z0-9-]{3,24}"
                    maxLength={24}
                    dir="ltr"
                    className="w-full rounded-xl border border-neutral-800 bg-[#080808] p-3 text-left font-mono text-xs text-white focus:border-[#c9a227] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="branch-address" className="mb-1 block text-xs text-neutral-300">العنوان التفصيلي *</label>
                  <input
                    id="branch-address"
                    value={branchAddress}
                    onChange={(event) => setBranchAddress(event.target.value)}
                    placeholder="المحافظة، المنطقة، الشارع..."
                    className="w-full rounded-xl border border-neutral-800 bg-[#080808] p-3 text-xs text-white focus:border-[#c9a227] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="branch-phone" className="mb-1 block text-xs text-neutral-300">هاتف الفرع *</label>
                  <input
                    id="branch-phone"
                    type="tel"
                    inputMode="tel"
                    value={branchPhone}
                    onChange={(event) => setBranchPhone(event.target.value)}
                    placeholder="01012345678"
                    dir="ltr"
                    className="w-full rounded-xl border border-neutral-800 bg-[#080808] p-3 text-left font-mono text-xs text-white focus:border-[#c9a227] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="branch-whatsapp" className="mb-1 block text-xs text-neutral-300">واتساب الفرع *</label>
                  <input
                    id="branch-whatsapp"
                    type="tel"
                    inputMode="tel"
                    value={branchWhatsapp}
                    onChange={(event) => setBranchWhatsapp(event.target.value)}
                    placeholder="01012345678"
                    dir="ltr"
                    className="w-full rounded-xl border border-neutral-800 bg-[#080808] p-3 text-left font-mono text-xs text-white focus:border-[#c9a227] focus:outline-none"
                  />
                </div>
              </div>
              <p className="text-[11px] leading-5 text-neutral-500">لن تُستخدم هذه البيانات عند الرفض. عند الموافقة يُنشأ الفرع وعضوية المالك وساعات العمل الافتراضية داخل معاملة واحدة.</p>
            </fieldset>

            <div>
              <label className="block text-xs font-bold text-neutral-400 mb-2">سبب الرفض أو المعلومات المطلوب استكمالها:</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="اكتب مبرر رفض إضافة الفرع ليظهر للمالك..."
                className="w-full h-24 bg-[#080808] border border-neutral-800 rounded-2xl p-4 text-xs text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-neutral-800">
              <button
                onClick={closeReviewModal}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-neutral-800 text-neutral-300 text-xs font-bold hover:bg-neutral-700"
              >
                إلغاء
              </button>
              <button
                onClick={() => handleReview('NEEDS_INFORMATION')}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/50 text-amber-200 text-xs font-bold hover:bg-amber-500/25"
              >
                طلب معلومات
              </button>
              <button
                onClick={() => handleReview('REJECT')}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-red-500/20 border border-red-500 text-red-400 text-xs font-bold hover:bg-red-500/30 flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>رفض الطلب</span>
              </button>
              <button
                onClick={() => handleReview('APPROVE')}
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 text-black text-xs font-bold hover:brightness-110 flex items-center gap-1.5 shadow-lg"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>موافقة وإنشاء الفرع</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
