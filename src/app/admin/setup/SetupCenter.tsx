'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Boxes,
  Building2,
  CalendarClock,
  Check,
  ClipboardCheck,
  Clock3,
  CreditCard,
  Gauge,
  MapPinned,
  Pencil,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  UsersRound,
  X,
} from 'lucide-react';
import OperationsResourcesBoard, {
  type EmployeeStockDto,
  type OperationsEmployeeDto,
  type ResourceBookingDto,
  type ResourceMaterialDto,
  type ResourceStockDto,
  type ResourceVehicleDto,
  type ServiceMaterialDto,
} from '@/app/operations/resources/OperationsResourcesBoard';
import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  deactivateSetupEmployeeAction,
  deactivateSetupTeamAction,
  deleteBlackoutDateAction,
  deleteChecklistTemplateAction,
  deletePaymentMethodAction,
  deleteSetupAreaAction,
  deleteSetupTimeOffAction,
  revokeSetupPermissionOverrideAction,
  saveBlackoutDateAction,
  saveBranchIdentityAction,
  saveBranchOperationsConfigAction,
  saveBranchWorkingHoursAction,
  saveChecklistTemplateAction,
  savePaymentMethodAction,
  saveSetupAreaAction,
  saveSetupEmployeeAction,
  saveSetupPermissionOverrideAction,
  saveSetupTeamAction,
  saveSetupTimeOffAction,
  saveTeamWorkingHoursAction,
  type SetupActionResult,
} from '@/app/actions/setup';
import {
  createBranchDirectAction,
  deleteBranchAction,
  updateBranchAction,
} from '@/app/actions/owner-brand';

type AssignmentModeCode = 'MANUAL' | 'AUTOMATIC';
type WorkforceRoleCode = 'OPERATIONS_MANAGER' | 'EMPLOYEE';
type PermissionEffectCode = 'GRANT' | 'DENY';
type PermissionScopeCode = 'GLOBAL' | 'BRANCH';
type PaymentMethodCode =
  | 'VODAFONE_CASH'
  | 'INSTAPAY'
  | 'BANK_TRANSFER'
  | 'CASH_DEPOSIT'
  | 'OTHER_MANUAL';
type ChecklistStageCode =
  | 'BOOKING_REVIEW'
  | 'TEAM_PREPARATION'
  | 'ARRIVAL_INSPECTION'
  | 'SERVICE_EXECUTION'
  | 'CLOSING'
  | 'QUALITY_REVIEW';

interface BranchHoursDto {
  id: string;
  dayOfWeek: number;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
  breakStartTime: string | null;
  breakEndTime: string | null;
}

interface TeamHoursDto {
  id: string;
  dayOfWeek: number;
  isOff: boolean;
  openTime: string;
  closeTime: string;
  breakStartTime: string | null;
  breakEndTime: string | null;
}

interface SetupTimeOffDto {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

interface SetupAreaDto {
  id: string;
  governorate: string;
  city: string;
  district: string;
  compound: string;
  active: boolean;
  priority: number;
  travelBufferOverride: number | null;
  bookingCount: number;
}

interface SetupZoneDto {
  id: string;
  name: string;
  description: string | null;
  areas: SetupAreaDto[];
}

interface SetupTeamDto {
  id: string;
  name: string;
  leaderId: string | null;
  baseZoneId: string | null;
  dailyCapacity: number;
  active: boolean;
  assignmentPriority: number;
  memberIds: string[];
  zoneIds: string[];
  serviceIds: string[];
  workingHours: TeamHoursDto[];
  timeOff: SetupTimeOffDto[];
  bookingCount: number;
}

interface SetupPaymentMethodDto {
  id: string;
  name: string;
  type: PaymentMethodCode;
  accountNumber: string;
  accountName: string;
  instructions: string | null;
  active: boolean;
  isDefault: boolean;
  proofCount: number;
}

export interface SetupBranchDto {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  address: string;
  phone: string;
  whatsapp: string;
  status: string;
  timezone: string;
  slotUnitMinutes: number;
  arrivalWindowMinutes: number;
  travelBufferMinutes: number;
  restBufferMinutes: number;
  dailyBookingLimit: number;
  assignmentMode: AssignmentModeCode;
  workingHours: BranchHoursDto[];
  blackoutDates: Array<{ id: string; date: string; reason: string | null }>;
  paymentMethods: SetupPaymentMethodDto[];
  zones: SetupZoneDto[];
  teams: SetupTeamDto[];
  travelTimes: Array<{
    id: string;
    fromZoneId: string;
    toZoneId: string;
    durationMinutes: number;
  }>;
}

export interface SetupEmployeeDto {
  id: string;
  fullName: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  role: WorkforceRoleCode;
  active: boolean;
  branchIds: string[];
  teamId: string | null;
  timeOff: SetupTimeOffDto[];
  permissionOverrides: Array<{
    id: string;
    permissionCode: string;
    effect: PermissionEffectCode;
    scopeType: PermissionScopeCode;
    scopeId: string;
    expiresAt: string | null;
  }>;
}

export interface SetupPermissionDto {
  code: string;
  nameAr: string;
  description: string | null;
  canGrantToEmployee: boolean;
  defaultForEmployee: boolean;
  defaultForOperationsManager: boolean;
}

export interface SetupChecklistItemDto {
  id: string;
  labelAr: string;
  descriptionAr: string | null;
  required: boolean;
  requiresNote: boolean;
  displayOrder: number;
  active: boolean;
}

export interface SetupChecklistTemplateDto {
  id: string;
  stage: ChecklistStageCode;
  name: string;
  items: SetupChecklistItemDto[];
}

export interface SetupServiceDto {
  id: string;
  nameAr: string;
  active: boolean;
  cancellationPolicyId: string;
  cancellationPolicyNameAr: string;
  cancellationPolicyActive: boolean;
  checklistTemplates: SetupChecklistTemplateDto[];
}

export interface SetupCenterProps {
  actor: {
    fullName: string;
    role: 'OWNER' | 'SYSTEM_SUPER_ADMIN';
  };
  branches: SetupBranchDto[];
  employees: SetupEmployeeDto[];
  permissions: SetupPermissionDto[];
  services: SetupServiceDto[];
  inventory?: {
    materials: ResourceMaterialDto[];
    services: ServiceMaterialDto[];
    stocks: ResourceStockDto[];
    employeeStocks: EmployeeStockDto[];
    employees: OperationsEmployeeDto[];
    vehicles: ResourceVehicleDto[];
    bookings: ResourceBookingDto[];
  };
}

type SetupMutation = (formData: FormData) => Promise<SetupActionResult>;
export type SectionId =
  | 'branches'
  | 'overview'
  | 'inventory'
  | 'operations_management'
  | 'workforce'
  | 'teams'
  | 'coverage'
  | 'schedule'
  | 'payments'
  | 'checklists';

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

interface ConfirmationRequest {
  title: string;
  description: string;
  action: SetupMutation;
  entityId: string;
  branchId?: string;
  additionalFields?: Record<string, string>;
  confirmLabel?: string;
}

interface SectionTools {
  pending: boolean;
  execute: (action: SetupMutation, data: FormData) => void;
  requestConfirmation: (request: ConfirmationRequest) => void;
}

const inputClass = 'mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:cursor-not-allowed disabled:opacity-50';
const textareaClass = inputClass + ' min-h-24 py-3 leading-6';
const primaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-4 text-sm font-black text-black transition hover:bg-[#e4c65f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d978] disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.035] px-4 text-sm font-bold text-white/75 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/50 disabled:cursor-not-allowed disabled:opacity-50';
const dangerButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-400/25 bg-red-400/10 px-4 text-sm font-bold text-red-200 transition hover:bg-red-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 disabled:cursor-not-allowed disabled:opacity-50';

const DAYS = [
  { value: 6, label: 'السبت' },
  { value: 0, label: 'الأحد' },
  { value: 1, label: 'الإثنين' },
  { value: 2, label: 'الثلاثاء' },
  { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' },
  { value: 5, label: 'الجمعة' },
];

const STAGES: Array<{ value: ChecklistStageCode; label: string }> = [
  { value: 'BOOKING_REVIEW', label: 'مراجعة الحجز' },
  { value: 'TEAM_PREPARATION', label: 'تحضير الفريق' },
  { value: 'ARRIVAL_INSPECTION', label: 'فحص الوصول' },
  { value: 'SERVICE_EXECUTION', label: 'تنفيذ الخدمة' },
  { value: 'CLOSING', label: 'الإغلاق والتسليم' },
  { value: 'QUALITY_REVIEW', label: 'مراجعة الجودة' },
];

const PAYMENT_TYPES: Array<{ value: PaymentMethodCode; label: string }> = [
  { value: 'VODAFONE_CASH', label: 'Vodafone Cash' },
  { value: 'INSTAPAY', label: 'InstaPay' },
  { value: 'BANK_TRANSFER', label: 'تحويل بنكي' },
  { value: 'CASH_DEPOSIT', label: 'إيداع نقدي' },
  { value: 'OTHER_MANUAL', label: 'وسيلة يدوية أخرى' },
];

function Panel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.4rem] border border-white/10 bg-[#0d0e10]/90 shadow-[0_28px_80px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <h2 className="text-lg font-black tracking-tight text-white">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-white/45">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

function BooleanField({
  name,
  label,
  defaultChecked,
  description,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  description?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/75 transition hover:border-white/20">
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 accent-[#d4af37]"
      />
      <input type="hidden" name={name} value="false" />
      <span>
        <span className="block font-bold text-white/85">{label}</span>
        {description ? <span className="mt-1 block text-xs leading-5 text-white/40">{description}</span> : null}
      </span>
    </label>
  );
}

function StatusPill({ active, activeLabel = 'نشط', inactiveLabel = 'متوقف' }: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ' + (
      active
        ? 'bg-emerald-400/10 text-emerald-300'
        : 'bg-white/[0.06] text-white/40'
    )}>
      <span className={'size-1.5 rounded-full ' + (active ? 'bg-emerald-300' : 'bg-white/25')} />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 bg-black/20 px-5 py-10 text-center">
      <p className="font-bold text-white/75">{title}</p>
      <p className="mt-2 text-sm text-white/40">{text}</p>
    </div>
  );
}

function formDataFrom(event: FormEvent<HTMLFormElement>): FormData {
  event.preventDefault();
  return new FormData(event.currentTarget);
}

function ToggleChoice({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className={'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ' + (
      checked
        ? 'border-[#d4af37]/35 bg-[#d4af37]/8'
        : 'border-white/10 bg-black/25 hover:border-white/20'
    )}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-[#d4af37]"
      />
      <span>
        <span className="block text-sm font-bold text-white/80">{label}</span>
        {hint ? <span className="mt-1 block text-xs text-white/40">{hint}</span> : null}
      </span>
    </label>
  );
}

function ConfirmationDialog({
  request,
  pending,
  onCancel,
  onConfirm,
}: {
  request: ConfirmationRequest;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-confirm-title"
        className="w-full max-w-lg rounded-3xl border border-red-400/25 bg-[#101113] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">إجراء يحتاج تأكيدًا</p>
            <h2 id="setup-confirm-title" className="mt-2 text-xl font-black">{request.title}</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={pending} className="rounded-lg p-2 text-white/45 hover:bg-white/8 hover:text-white">
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">إغلاق</span>
          </button>
        </div>
        <p className="mt-4 text-sm leading-7 text-white/55">{request.description}</p>
        <label className="mt-5 block text-xs font-bold text-white/70">
          سبب الإجراء
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={5}
            maxLength={500}
            autoFocus
            className={textareaClass}
            placeholder="اكتب سببًا سيظهر في سجل التدقيق"
          />
        </label>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={pending} className={secondaryButtonClass}>رجوع</button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={pending || reason.trim().length < 5}
            className={dangerButtonClass}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {request.confirmLabel ?? 'تأكيد الإجراء'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveButton({ pending, label = 'حفظ التغييرات' }: { pending: boolean; label?: string }) {
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass}>
      <Save className="size-4" aria-hidden="true" />
      {pending ? 'جارٍ الحفظ…' : label}
    </button>
  );
}

function BranchesSection({
  branches,
  tools,
  onSelectBranch,
}: {
  branches: SetupBranchDto[];
  tools: SectionTools;
  onSelectBranch: (branchId: string) => void;
}) {
  const [editingBranch, setEditingBranch] = useState<SetupBranchDto | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleStartCreate() {
    setEditingBranch(null);
    formRef.current?.reset();
  }

  function handleStartEdit(branch: SetupBranchDto) {
    setEditingBranch(branch);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="space-y-8">
      {/* Form for Create / Edit */}
      <Panel
        title={editingBranch ? `تعديل بيانات فرع "${editingBranch.nameAr}"` : 'إضافة فرع جديد للمنظومة'}
        description="أنشئ فرعًا جديدًا أو عدّل بيانات وسعة الفرع الحالي. التغييرات تنعكس فوراً على محرك الحجوزات ونطاقات التغطية."
        actions={
          editingBranch ? (
            <button
              type="button"
              onClick={handleStartCreate}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-[#d4af37] px-3.5 text-xs font-black text-black hover:bg-[#e4c65f] transition-all shadow-md shadow-[#d4af37]/20"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>إنشاء فرع جديد</span>
            </button>
          ) : undefined
        }
      >
        <form
          ref={formRef}
          key={editingBranch ? `edit-${editingBranch.id}` : 'create-new'}
          onSubmit={(event) => {
            const data = formDataFrom(event);
            tools.execute(editingBranch ? updateBranchAction : createBranchDirectAction, data);
            if (!editingBranch) {
              formRef.current?.reset();
            }
          }}
          className="space-y-5"
        >
          {editingBranch ? <input type="hidden" name="branchId" value={editingBranch.id} /> : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs font-bold text-white/65">
              اسم الفرع بالعربية *
              <input
                name="nameAr"
                required
                minLength={2}
                maxLength={200}
                defaultValue={editingBranch?.nameAr ?? ''}
                placeholder="مثال: فرع القاهرة الجديدة"
                className={inputClass}
              />
            </label>
            <label className="text-xs font-bold text-white/65">
              اسم الفرع بالإنجليزية
              <input
                name="nameEn"
                dir="ltr"
                maxLength={200}
                defaultValue={editingBranch?.nameEn ?? ''}
                placeholder="e.g. New Cairo Branch"
                className={inputClass}
              />
            </label>
            <label className="text-xs font-bold text-white/65">
              كود الفرع (فريد) *
              <input
                name="code"
                required
                dir="ltr"
                minLength={2}
                maxLength={20}
                defaultValue={editingBranch?.code ?? ''}
                placeholder="مثال: CAIRO-NC-01"
                className={inputClass}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs font-bold text-white/65">
              رقم الهاتف *
              <input
                name="phone"
                required
                dir="ltr"
                defaultValue={editingBranch?.phone ?? ''}
                placeholder="010XXXXXXXX"
                className={inputClass}
              />
            </label>
            <label className="text-xs font-bold text-white/65">
              رقم الواتساب *
              <input
                name="whatsapp"
                required
                dir="ltr"
                defaultValue={editingBranch?.whatsapp ?? ''}
                placeholder="010XXXXXXXX"
                className={inputClass}
              />
            </label>
            <label className="text-xs font-bold text-white/65">
              حد الحجوزات اليومي *
              <input
                name="dailyBookingLimit"
                type="number"
                required
                min={1}
                max={200}
                defaultValue={editingBranch?.dailyBookingLimit ?? 20}
                className={inputClass}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-white/65">
              العنوان / المقر التشغيلي *
              <input
                name="address"
                required
                minLength={5}
                maxLength={500}
                defaultValue={editingBranch?.address ?? ''}
                placeholder="مثال: التجمع الخامس، محور التسعين الشمالي"
                className={inputClass}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-white/65">
                نمط الإسناد
                <select
                  name="assignmentMode"
                  defaultValue={editingBranch?.assignmentMode ?? 'MANUAL'}
                  className={inputClass}
                >
                  <option value="MANUAL">يدوي</option>
                  <option value="AUTOMATIC">تلقائي</option>
                </select>
              </label>
              <label className="text-xs font-bold text-white/65">
                حالة الفرع
                <select
                  name="status"
                  defaultValue={editingBranch?.status ?? 'ACTIVE'}
                  className={inputClass}
                >
                  <option value="ACTIVE">نشط</option>
                  <option value="PAUSED">متوقف مؤقتاً</option>
                  <option value="DISABLED">معطل</option>
                </select>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
            <p className="text-xs text-white/40">
              {editingBranch
                ? 'تحديث بيانات الفرع يُسجل في سجل التدقيق فوراً.'
                : 'عند إنشاء الفرع سيتم إضافة ساعات العمل الافتراضية وإتاحة إعداد فرقه ومناطقه.'}
            </p>
            <div className="flex items-center gap-3">
              {editingBranch ? (
                <button
                  type="button"
                  onClick={handleStartCreate}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-white/70 hover:bg-white/5"
                >
                  إلغاء التعديل
                </button>
              ) : null}
              <SaveButton
                pending={tools.pending}
                label={editingBranch ? 'حفظ تعديلات الفرع' : 'إنشاء الفرع الآن'}
              />
            </div>
          </div>
        </form>
      </Panel>

      {/* List of Registered Branches */}
      <Panel
        title={`الفروع المسجلة في المنظومة (${branches.length})`}
        description="يمكنك تفعيل أو إيقاف أو تعديل أو حذف أي فرع. حذف الفرع يقوم بمسح كافة السجلات التابعة له نهائياً."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {branches.map((b) => (
            <article
              key={b.id}
              className="flex flex-col justify-between rounded-2xl border border-white/10 bg-black/40 p-5 shadow-lg"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-black text-white">{b.nameAr}</h4>
                      <StatusPill
                        active={b.status === 'ACTIVE'}
                        activeLabel={b.status === 'ACTIVE' ? 'نشط' : b.status === 'PAUSED' ? 'متوقف مؤقتاً' : 'معطل'}
                        inactiveLabel="غير نشط"
                      />
                    </div>
                    <p dir="ltr" className="mt-1 font-mono text-xs text-[#d4af37]">
                      {b.code}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-white/60">{b.address}</p>

                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-white/[0.03] p-3 text-center text-xs">
                  <div>
                    <span className="block text-[10px] text-white/35">الفرق</span>
                    <span className="mt-0.5 block font-bold text-white">{b.teams.length}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-white/35">الزونات</span>
                    <span className="mt-0.5 block font-bold text-white">{b.zones.length}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-white/35">سعة اليوم</span>
                    <span className="mt-0.5 block font-bold text-[#e5c45a]">{b.dailyBookingLimit}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3.5">
                <button
                  type="button"
                  onClick={() => onSelectBranch(b.id)}
                  className="text-xs font-bold text-[#e5c45a] hover:underline"
                >
                  إعداد تفاصيل هذا الفرع ←
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(b)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#d4af37]/35 bg-[#d4af37]/10 px-3 py-1.5 text-xs font-bold text-[#f3e4a8] hover:bg-[#d4af37]/20 transition-all"
                  >
                    <Pencil className="size-3.5" />
                    <span>تعديل</span>
                  </button>
                  <button
                    type="button"
                    disabled={tools.pending}
                    onClick={() =>
                      tools.requestConfirmation({
                        title: `حذف فرع "${b.nameAr}" نهائياً`,
                        description: `سيتم مسح فرع "${b.nameAr}" (${b.code}) وكافة السجلات والحجوزات والفرق والمناطق التابعة له نهائياً من قاعدة البيانات. هل تريد المتابعة؟`,
                        action: deleteBranchAction,
                        entityId: b.id,
                        branchId: b.id,
                        confirmLabel: 'تأكيد الحذف نهائياً',
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 transition-all disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5 text-red-400" />
                    <span>حذف</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function OverviewSection({
  branch,
  employees,
  services,
  inventory,
  tools,
  onNavigate,
}: {
  branch: SetupBranchDto;
  employees: SetupEmployeeDto[];
  services: SetupServiceDto[];
  inventory?: SetupCenterProps['inventory'];
  tools: SectionTools;
  onNavigate: (section: SectionId) => void;
}) {
  const activeTeams = branch.teams.filter((team) => team.active).length;
  const activeAreas = branch.zones.reduce(
    (total, zone) => total + zone.areas.filter((area) => area.active).length,
    0,
  );
  const configuredHours = branch.workingHours.length;
  const activePaymentMethods = branch.paymentMethods.filter((method) => method.active).length;
  const checklistServices = services.filter((service) => service.checklistTemplates.length > 0).length;
  const governedServices = services.filter((service) => service.cancellationPolicyActive).length;
  const vehicleCount = inventory ? inventory.vehicles.filter((v) => v.branchId === branch.id).length : 0;
  const readiness = [
    {
      label: 'مخزون وأسطول السيارات',
      value: vehicleCount,
      suffix: 'سيارة تشغيل',
      ready: vehicleCount > 0,
      section: 'inventory' as SectionId,
      icon: Boxes,
    },
    {
      label: 'إدارة التشغيل',
      value: employees.filter((employee) => employee.role === 'OPERATIONS_MANAGER' && employee.active).length,
      suffix: 'مدير تشغيل',
      ready: employees.some((employee) => employee.role === 'OPERATIONS_MANAGER' && employee.active),
      section: 'operations_management' as SectionId,
      icon: ShieldCheck,
    },
    {
      label: 'موظفو التنفيذ',
      value: employees.filter((employee) => employee.role === 'EMPLOYEE' && employee.active).length,
      suffix: 'فني بالفرع',
      ready: employees.some((employee) => employee.role === 'EMPLOYEE' && employee.active),
      section: 'workforce' as SectionId,
      icon: UserRoundCog,
    },
    {
      label: 'فرق التنفيذ',
      value: activeTeams,
      suffix: 'فريق جاهز',
      ready: activeTeams > 0 && branch.teams.every((team) => !team.active || team.memberIds.length > 0),
      section: 'teams' as SectionId,
      icon: UsersRound,
    },
    {
      label: 'نطاق التغطية',
      value: activeAreas,
      suffix: 'منطقة نشطة',
      ready: activeAreas > 0 && branch.zones.length > 0,
      section: 'coverage' as SectionId,
      icon: MapPinned,
    },
    {
      label: 'أيام الجدولة',
      value: configuredHours,
      suffix: 'يوم مضبوط',
      ready: configuredHours === 7,
      section: 'schedule' as SectionId,
      icon: CalendarClock,
    },
    {
      label: 'قنوات التحصيل',
      value: activePaymentMethods,
      suffix: 'وسيلة نشطة',
      ready: activePaymentMethods > 0 && branch.paymentMethods.some((method) => method.active && method.isDefault),
      section: 'payments' as SectionId,
      icon: CreditCard,
    },
    {
      label: 'الخدمات الموثقة',
      value: checklistServices,
      suffix: 'خدمة بقوائم',
      ready: checklistServices === services.length && services.length > 0,
      section: 'checklists' as SectionId,
      icon: ClipboardCheck,
    },
    {
      label: 'سياسات الإلغاء',
      value: governedServices,
      suffix: 'خدمة بسياسة نشطة',
      ready: governedServices === services.length && services.length > 0,
      section: 'overview' as SectionId,
      icon: ShieldCheck,
    },
  ];
  const readyCount = readiness.filter((item) => item.ready).length;

  return (
    <>
      <BranchIdentityForm branch={branch} tools={tools} />

      <Panel
        title="خريطة جاهزية الفرع"
        description="سبع طبقات مترابطة تحكم ما يراه العميل وما يستطيع فريق التشغيل تنفيذه."
        actions={<StatusPill active={readyCount === readiness.length} activeLabel="جاهزية مكتملة" inactiveLabel={readyCount + ' / ' + readiness.length + ' مكتمل'} />}
      >
        <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-3">
          {readiness.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onNavigate(item.section)}
                className="group bg-[#0a0b0c] p-5 text-right transition hover:bg-[#111215] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d4af37]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={'grid size-10 place-items-center rounded-xl ' + (
                    item.ready ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'
                  )}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  {item.ready ? <Check className="size-4 text-emerald-300" aria-hidden="true" /> : <span className="size-2 rounded-full bg-amber-300" />}
                </div>
                <p className="mt-6 text-sm font-black text-white/70">{item.label}</p>
                <p className="mt-2 text-3xl font-black tabular-nums text-white">{item.value}</p>
                <p className="mt-1 text-xs text-white/35">{item.suffix}</p>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
          <Link
            href="/admin/branches"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-5 text-xs font-black text-black hover:bg-[#e4c65f] transition-all shadow-md shadow-[#d4af37]/20"
          >
            <Building2 className="size-4" aria-hidden="true" />
            <span>إدارة وتعديل وحذف الفروع (+ إضافة فرع)</span>
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate('coverage')}
              className={secondaryButtonClass}
            >
              <MapPinned className="size-4 text-[#d4af37]" aria-hidden="true" />
              <span>ضبط مناطق التغطية</span>
            </button>
            <Link href="/admin/catalog#cancellation-policies-title" className={secondaryButtonClass}>
              إدارة سياسات الإلغاء في الكتالوج
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Panel>

      <Panel title="قواعد التشغيل والمواعيد الحالية" description="إعدادات الفرع الأساسية المعتمدة لحساب وتوزيع فترات الحجز.">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['مدة السلوت التشغيلي', branch.slotUnitMinutes + ' دقيقة'],
            ['فاصل الانتقال بين العملاء', branch.travelBufferMinutes + ' دقيقة'],
            ['الحد الأقصى اليومي', branch.dailyBookingLimit + ' موعد / يوم'],
            ['نمط إسناد الفرق', branch.assignmentMode === 'AUTOMATIC' ? 'تلقائي ذكي' : 'يدوي من اللوحة'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/8 bg-black/30 p-4">
              <dt className="text-xs text-white/35">{label}</dt>
              <dd className="mt-2 font-black text-[#e3c65f]">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </>
  );
}

function BranchIdentityForm({ branch, tools }: {
  branch: SetupBranchDto;
  tools: SectionTools;
}) {
  return (
    <Panel
      title="هوية الفرع وبيانات التواصل"
      description="هذه البيانات الأساسية تخص المالك والنظام فقط، وتظهر آثار تغيير الاسم أو الكود أو المنطقة الزمنية عبر أجزاء التشغيل."
      actions={(
        <div className="flex items-center gap-2">
          <Link href="/admin/branches" className={primaryButtonClass}>
            <Plus className="size-4" aria-hidden="true" />
            <span>إضافة فرع جديد</span>
          </Link>
          <Settings2 className="size-5 text-[#d4af37]" aria-hidden="true" />
        </div>
      )}
    >
      <form
        onSubmit={(event) => tools.execute(saveBranchIdentityAction, formDataFrom(event))}
        className="space-y-5"
      >
        <input type="hidden" name="branchId" value={branch.id} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold text-white/65">
            اسم الفرع بالعربية
            <input name="nameAr" required minLength={2} maxLength={200} defaultValue={branch.nameAr} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            اسم الفرع بالإنجليزية
            <input name="nameEn" dir="ltr" maxLength={200} defaultValue={branch.nameEn ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            كود الفرع
            <input name="code" dir="ltr" required minLength={2} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" defaultValue={branch.code} className={inputClass + ' uppercase'} />
          </label>
          <label className="text-xs font-bold text-white/65">
            المنطقة الزمنية
            <input name="timezone" dir="ltr" required list={'setup-timezones-' + branch.id} defaultValue={branch.timezone} className={inputClass} />
            <datalist id={'setup-timezones-' + branch.id}>
              <option value="Africa/Cairo" />
              <option value="Asia/Riyadh" />
              <option value="Asia/Dubai" />
              <option value="UTC" />
            </datalist>
          </label>
          <input type="hidden" name="phone" value={branch.phone} />
          <input type="hidden" name="whatsapp" value={branch.whatsapp} />
          <label className="text-xs font-bold text-white/65 sm:col-span-2 xl:col-span-4">
            العنوان / النطاق التشغيلي
            <input name="address" required minLength={3} maxLength={500} defaultValue={branch.address} className={inputClass} />
          </label>
        </div>
        <label className="block text-xs font-bold text-white/65">
          سبب هذا التعديل
          <input name="changeReason" required minLength={5} maxLength={500} placeholder="سبب واضح يظهر في سجل التدقيق" className={inputClass} />
        </label>
        <div className="flex justify-end border-t border-white/8 pt-5">
          <SaveButton pending={tools.pending} label="حفظ بيانات الفرع" />
        </div>
      </form>
    </Panel>
  );
}

function OperationsManagementSection({
  branch,
  allBranches,
  employees,
  permissions,
  tools,
}: {
  branch: SetupBranchDto;
  allBranches: SetupBranchDto[];
  employees: SetupEmployeeDto[];
  permissions: SetupPermissionDto[];
  tools: SectionTools;
}) {
  const [selectedId, setSelectedId] = useState<string>('new');
  const operationsManagers = employees.filter((e) => e.role === 'OPERATIONS_MANAGER');
  const selected = operationsManagers.find((m) => m.id === selectedId);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(300px,0.85fr)_minmax(480px,1.15fr)]">
      <Panel
        title="إدارة التشغيل (المدراء)"
        description={`${operationsManagers.length} مدير تشغيل مسجل بالنظام · يمكن للمدير إدارة أكثر من فرع`}
        actions={(
          <button type="button" onClick={() => setSelectedId('new')} className={secondaryButtonClass}>
            <Plus className="size-4" aria-hidden="true" />
            مدير تشغيل جديد
          </button>
        )}
      >
        {operationsManagers.length ? (
          <div className="space-y-2.5">
            {operationsManagers.map((manager) => {
              const managerBranches = allBranches.filter((b) => manager.branchIds.includes(b.id));
              return (
                <button
                  key={manager.id}
                  type="button"
                  onClick={() => setSelectedId(manager.id)}
                  className={'w-full rounded-xl border p-4 text-right transition ' + (
                    selectedId === manager.id
                      ? 'border-[#d4af37]/35 bg-[#d4af37]/8'
                      : 'border-white/8 bg-black/25 hover:border-white/18'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-white/85 flex items-center gap-2">
                        <ShieldCheck className="size-4 text-[#d4af37]" />
                        <span>{manager.fullName}</span>
                      </p>
                      <p dir="ltr" className="mt-1 text-left text-xs text-white/40">{manager.phone}</p>
                    </div>
                    <StatusPill active={manager.active} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-white/40 text-[10px]">الفروع المُدارة:</span>
                    {managerBranches.length > 0 ? (
                      managerBranches.map((b) => (
                        <span key={b.id} className="rounded-md border border-[#d4af37]/30 bg-[#d4af37]/15 px-2 py-0.5 font-bold text-[#f3e4a8]">
                          {b.nameAr}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-white/40">
                        لم يتم تحديد فروع
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState title="لا يوجد مدراء تشغيل" text="أنشئ أول حساب مدير تشغيل وحدد الفروع التي يشرف عليها." />
        )}
      </Panel>

      <div className="space-y-6">
        <OperationsManagerForm
          key={selected?.id ?? 'new'}
          branch={branch}
          allBranches={allBranches}
          manager={selected}
          tools={tools}
        />
        {selected ? (
          <PermissionOverridesPanel
            key={selected.id + '-permissions'}
            employee={selected}
            branches={allBranches.filter((candidate) => selected.branchIds.includes(candidate.id))}
            permissions={permissions}
            tools={tools}
          />
        ) : null}
      </div>
    </div>
  );
}

function OperationsManagerForm({
  branch,
  allBranches,
  manager,
  tools,
}: {
  branch: SetupBranchDto;
  allBranches: SetupBranchDto[];
  manager?: SetupEmployeeDto;
  tools: SectionTools;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    tools.execute(saveSetupEmployeeAction, formDataFrom(event));
  }

  return (
    <Panel
      title={manager ? 'تعديل مدير التشغيل: ' + manager.fullName : 'إنشاء مدير تشغيل جديد'}
      description="يمكن لمدير التشغيل إدارة وتنسيق العمليات عبر فرع واحد أو عدة فروع في نفس الوقت."
    >
      <form onSubmit={submit} className="space-y-5">
        {manager ? <input type="hidden" name="employeeId" value={manager.id} /> : null}
        <input type="hidden" name="branchId" value={branch.id} />
        <input type="hidden" name="role" value="OPERATIONS_MANAGER" />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-white/65">
            الاسم الكامل
            <input name="fullName" required minLength={2} maxLength={100} defaultValue={manager?.fullName ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            الهاتف (رقم تسجيل الدخول)
            <input name="phone" dir="ltr" required minLength={8} maxLength={20} defaultValue={manager?.phone ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            واتساب (اختياري)
            <input name="whatsapp" dir="ltr" maxLength={20} defaultValue={manager?.whatsapp ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            البريد الإلكتروني (اختياري)
            <input name="email" type="email" dir="ltr" defaultValue={manager?.email ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65 sm:col-span-2">
            {manager ? 'كلمة مرور مؤقتة جديدة (اتركها فارغة للإبقاء على الحالية)' : 'كلمة المرور المؤقتة'}
            <input
              name="temporaryPassword"
              type="password"
              required={!manager}
              minLength={manager ? undefined : 12}
              maxLength={128}
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
        </div>

        {/* Multi-Branch Selector */}
        <div className="rounded-2xl border border-[#d4af37]/25 bg-black/40 p-4">
          <p className="text-xs font-black text-[#f3e4a8] flex items-center gap-2">
            <ShieldCheck className="size-4 text-[#d4af37]" />
            <span>الفروع المُدارة بواسطة هذا المدير (إدارة فروع متعددة)</span>
          </p>
          <p className="mt-1 text-xs text-white/45">حدد كافة الفروع التي يستطيع مدير التشغيل إدارتها ومتابعة حجوزاتها وفرقها:</p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {allBranches.map((b) => {
              const isChecked = manager ? manager.branchIds.includes(b.id) : b.id === branch.id;
              return (
                <label key={b.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/50 p-3 text-xs font-bold text-white/85 hover:border-[#d4af37]/40 cursor-pointer transition">
                  <input
                    type="checkbox"
                    name="branchIds"
                    value={b.id}
                    defaultChecked={isChecked}
                    className="size-4 accent-[#d4af37]"
                  />
                  <span>{b.nameAr} <span dir="ltr" className="text-white/35 font-mono">({b.code})</span></span>
                </label>
              );
            })}
          </div>
        </div>

        <BooleanField
          name="active"
          label="الحساب نشط"
          defaultChecked={manager?.active ?? true}
          description="إيقاف الحساب يمنع مدير التشغيل من الدخول للنظام."
        />

        <div className="flex flex-col gap-3 border-t border-white/8 pt-5 sm:flex-row sm:justify-between">
          {manager && manager.active ? (
            <button
              type="button"
              disabled={tools.pending}
              onClick={() => tools.requestConfirmation({
                title: 'تعطيل حساب مدير التشغيل ' + manager.fullName,
                description: 'سيتم إنهاء جلساته الحالية مع الاحتفاظ بسجل عملياته وقراراته.',
                action: deactivateSetupEmployeeAction,
                entityId: manager.id,
                branchId: branch.id,
                confirmLabel: 'تعطيل الحساب',
              })}
              className={dangerButtonClass}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              تعطيل الحساب
            </button>
          ) : <span />}
          <SaveButton pending={tools.pending} label={manager ? 'حفظ تعديلات المدير' : 'إنشاء مدير التشغيل'} />
        </div>
      </form>
    </Panel>
  );
}

function WorkforceSection({
  branch,
  employees,
  tools,
}: {
  branch: SetupBranchDto;
  employees: SetupEmployeeDto[];
  tools: SectionTools;
}) {
  const [selectedId, setSelectedId] = useState<string>('new');
  const fieldEmployees = employees.filter((e) => e.role === 'EMPLOYEE' && e.branchIds.includes(branch.id));
  const selected = fieldEmployees.find((employee) => employee.id === selectedId);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.75fr)_minmax(480px,1.25fr)]">
      <Panel
        title="موظفو التنفيذ والفنيين"
        description={`${fieldEmployees.length} فني مسجل في فرع ${branch.nameAr}`}
        actions={(
          <button type="button" onClick={() => setSelectedId('new')} className={secondaryButtonClass}>
            <Plus className="size-4" aria-hidden="true" />
            فني جديد
          </button>
        )}
      >
        {fieldEmployees.length ? (
          <div className="space-y-2">
            {fieldEmployees.map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => setSelectedId(employee.id)}
                className={'w-full rounded-xl border p-4 text-right transition ' + (
                  selectedId === employee.id
                    ? 'border-[#d4af37]/35 bg-[#d4af37]/8'
                    : 'border-white/8 bg-black/25 hover:border-white/18'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-white/85">{employee.fullName}</p>
                    <p dir="ltr" className="mt-1 text-left text-xs text-white/40">{employee.phone}</p>
                  </div>
                  <StatusPill active={employee.active} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full bg-white/[0.055] px-2 py-1 text-white/45">
                    {employee.teamId ? 'مرتبط بفريق' : 'غير مرتبط بفريق'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : <EmptyState title="لا يوجد موظفو تنفيذ" text="أنشئ أول حساب فني للفرع ثم اربطه بفريق العمل." />}
      </Panel>

      <div className="space-y-6">
        <FieldEmployeeForm
          key={selected?.id ?? 'new'}
          branch={branch}
          employee={selected}
          tools={tools}
        />
      </div>
    </div>
  );
}

function FieldEmployeeForm({
  branch,
  employee,
  tools,
}: {
  branch: SetupBranchDto;
  employee?: SetupEmployeeDto;
  tools: SectionTools;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    tools.execute(saveSetupEmployeeAction, formDataFrom(event));
  }
  return (
    <Panel
      title={employee ? 'تعديل الفني: ' + employee.fullName : 'إنشاء حساب فني جديد'}
      description={employee
        ? 'اترك كلمة المرور فارغة ما لم تكن تريد إعادة ضبطها.'
        : 'سيُطلب من الفني تغيير كلمة المرور المؤقتة عند أول تسجيل دخول.'}
    >
      <form onSubmit={submit} className="space-y-5">
        {employee ? <input type="hidden" name="employeeId" value={employee.id} /> : null}
        <input type="hidden" name="branchId" value={branch.id} />
        <input type="hidden" name="role" value="EMPLOYEE" />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-white/65">
            الاسم الكامل
            <input name="fullName" required minLength={2} maxLength={100} defaultValue={employee?.fullName ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            الهاتف (رقم تسجيل الدخول)
            <input name="phone" dir="ltr" required minLength={8} maxLength={20} defaultValue={employee?.phone ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            واتساب (اختياري)
            <input name="whatsapp" dir="ltr" maxLength={20} defaultValue={employee?.whatsapp ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            البريد الإلكتروني (اختياري)
            <input name="email" type="email" dir="ltr" defaultValue={employee?.email ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65 sm:col-span-2">
            {employee ? 'كلمة مرور مؤقتة جديدة (اتركها فارغة للإبقاء على الحالية)' : 'كلمة المرور المؤقتة'}
            <input
              name="temporaryPassword"
              type="password"
              required={!employee}
              minLength={employee ? undefined : 12}
              maxLength={128}
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
        </div>
        <div className="rounded-xl border border-white/8 bg-black/20 p-3 text-xs text-white/50">
          الفرع المسند: <span className="font-bold text-white/80">{branch.nameAr}</span> ({branch.code})
        </div>
        <BooleanField
          name="active"
          label="الحساب نشط"
          defaultChecked={employee?.active ?? true}
          description="إيقاف الحساب يلغي وصوله عند الحفظ."
        />
        <div className="flex flex-col gap-3 border-t border-white/8 pt-5 sm:flex-row sm:justify-between">
          {employee && employee.active ? (
            <button
              type="button"
              disabled={tools.pending}
              onClick={() => tools.requestConfirmation({
                title: 'تعطيل حساب ' + employee.fullName,
                description: 'سيتم إنهاء جلساته الحالية وفك ارتباطه من فريق التنفيذ مع الاحتفاظ بسجل عملياته.',
                action: deactivateSetupEmployeeAction,
                entityId: employee.id,
                branchId: branch.id,
                confirmLabel: 'تعطيل الحساب',
              })}
              className={dangerButtonClass}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              تعطيل الحساب
            </button>
          ) : <span />}
          <SaveButton pending={tools.pending} label={employee ? 'حفظ الحساب' : 'إنشاء الحساب'} />
        </div>
      </form>
    </Panel>
  );
}

type SetupPermissionOverrideDto = SetupEmployeeDto['permissionOverrides'][number];

function permissionExpiresInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function PermissionOverridesPanel({
  employee,
  branches,
  permissions,
  tools,
}: {
  employee: SetupEmployeeDto;
  branches: SetupBranchDto[];
  permissions: SetupPermissionDto[];
  tools: SectionTools;
}) {
  const defaultCount = permissions.filter((permission) => (
    employee.role === 'OPERATIONS_MANAGER'
      ? permission.defaultForOperationsManager
      : permission.defaultForEmployee
  )).length;

  return (
    <Panel
      title={'صلاحيات ' + employee.fullName}
      description="صلاحيات الدور هي خط الأساس ولا تُنسخ كسجلات. أضف GRANT أو DENY فقط عندما تحتاج استثناءً صريحًا."
      actions={(
        <span className="rounded-full border border-[#d4af37]/20 bg-[#d4af37]/8 px-3 py-1.5 text-xs font-black text-[#e3c65f]">
          {defaultCount} افتراضيًا
        </span>
      )}
    >
      <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">خط أساس الدور</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {permissions.map((permission) => {
            const granted = employee.role === 'OPERATIONS_MANAGER'
              ? permission.defaultForOperationsManager
              : permission.defaultForEmployee;
            return (
              <div key={permission.code} className="rounded-xl border border-white/7 bg-white/[0.025] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white/72">{permission.nameAr}</p>
                    <p dir="ltr" className="mt-1 truncate text-left text-[10px] text-white/28">{permission.code}</p>
                  </div>
                  <span className={'shrink-0 rounded-full px-2 py-1 text-[9px] font-black ' + (
                    granted
                      ? 'bg-emerald-400/10 text-emerald-300'
                      : 'bg-white/[0.05] text-white/30'
                  )}>
                    {granted ? 'ممنوحة بالدور' : 'غير ممنوحة'}
                  </span>
                </div>
                {permission.description ? <p className="mt-2 text-[11px] leading-5 text-white/35">{permission.description}</p> : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <PermissionOverrideForm
          employee={employee}
          branches={branches}
          permissions={permissions}
          tools={tools}
        />
        {employee.permissionOverrides.map((override) => (
          <PermissionOverrideForm
            key={override.id}
            employee={employee}
            branches={branches}
            permissions={permissions}
            override={override}
            tools={tools}
          />
        ))}
        {!employee.permissionOverrides.length ? (
          <EmptyState
            title="لا توجد استثناءات صريحة"
            text="كل قرارات الوصول لهذا الحساب تأتي حاليًا من صلاحيات الدور فقط."
          />
        ) : null}
      </div>
    </Panel>
  );
}

function PermissionOverrideForm({
  employee,
  branches,
  permissions,
  override,
  tools,
}: {
  employee: SetupEmployeeDto;
  branches: SetupBranchDto[];
  permissions: SetupPermissionDto[];
  override?: SetupPermissionOverrideDto;
  tools: SectionTools;
}) {
  const [scopeType, setScopeType] = useState<PermissionScopeCode>(override?.scopeType ?? 'GLOBAL');
  const availablePermissions = permissions.filter((permission) => (
    employee.role !== 'EMPLOYEE' ||
    permission.canGrantToEmployee ||
    permission.code === override?.permissionCode
  ));

  function submit(event: FormEvent<HTMLFormElement>) {
    const data = formDataFrom(event);
    const localExpiry = data.get('expiresAtLocal');
    data.delete('expiresAtLocal');
    if (typeof localExpiry === 'string' && localExpiry) {
      const parsedExpiry = new Date(localExpiry);
      if (!Number.isNaN(parsedExpiry.getTime())) data.set('expiresAt', parsedExpiry.toISOString());
    } else {
      data.set('expiresAt', '');
    }
    tools.execute(saveSetupPermissionOverrideAction, data);
  }

  const scopedBranchExists = override?.scopeType === 'BRANCH'
    ? branches.some((branch) => branch.id === override.scopeId)
    : true;

  return (
    <form
      onSubmit={submit}
      className={'rounded-2xl border p-4 ' + (override
        ? 'border-white/8 bg-black/20'
        : 'border-[#d4af37]/20 bg-[#d4af37]/[0.045]')}
    >
      {override ? <input type="hidden" name="permissionOverrideId" value={override.id} /> : null}
      <input type="hidden" name="userId" value={employee.id} />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-white/82">{override ? 'تعديل استثناء صريح' : 'إضافة استثناء صريح'}</p>
          {override ? (
            <p className="mt-1 text-[11px] text-white/35">
              {override.effect === 'GRANT' ? 'منح' : 'منع'} · {override.scopeType === 'GLOBAL' ? 'عالمي' : 'فرع'}
            </p>
          ) : null}
        </div>
        {override ? (
          <button
            type="button"
            disabled={tools.pending}
            onClick={() => tools.requestConfirmation({
              title: 'سحب استثناء الصلاحية',
              description: 'لن يُحذف تعريف الصلاحية أو الدور؛ سيعود القرار إلى الاستثناءات الأخرى ثم خط أساس الدور.',
              action: revokeSetupPermissionOverrideAction,
              entityId: override.id,
              confirmLabel: 'سحب الاستثناء',
            })}
            className={dangerButtonClass}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            سحب
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-bold text-white/50">
          الصلاحية
          <select name="permissionCode" required defaultValue={override?.permissionCode ?? availablePermissions[0]?.code} className={inputClass}>
            {availablePermissions.map((permission) => (
              <option key={permission.code} value={permission.code}>{permission.nameAr} — {permission.code}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-bold text-white/50">
          الأثر
          <select name="effect" required defaultValue={override?.effect ?? 'GRANT'} className={inputClass}>
            <option value="GRANT">GRANT — منح صريح</option>
            <option value="DENY">DENY — منع صريح</option>
          </select>
        </label>
        <label className="text-[11px] font-bold text-white/50">
          النطاق
          <select
            name="scopeType"
            required
            value={scopeType}
            onChange={(event) => setScopeType(event.target.value as PermissionScopeCode)}
            className={inputClass}
          >
            <option value="GLOBAL">GLOBAL — كل الفروع</option>
            <option value="BRANCH">BRANCH — فرع محدد</option>
          </select>
        </label>
        <label className="text-[11px] font-bold text-white/50">
          الفرع
          <select
            name="branchId"
            required={scopeType === 'BRANCH'}
            disabled={scopeType !== 'BRANCH'}
            defaultValue={override?.scopeType === 'BRANCH' && scopedBranchExists ? override.scopeId : branches[0]?.id}
            className={inputClass}
          >
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nameAr}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-bold text-white/50 sm:col-span-2">
          ينتهي في (اختياري — بتوقيت جهازك)
          <input
            name="expiresAtLocal"
            type="datetime-local"
            defaultValue={permissionExpiresInput(override?.expiresAt ?? null)}
            className={inputClass}
          />
        </label>
      </div>
      <label className="mt-3 block text-[11px] font-bold text-white/50">
        سبب {override ? 'التعديل' : 'التفويض'}
        <input
          name="auditReason"
          required
          minLength={5}
          maxLength={500}
          placeholder="سبب واضح يظهر في سجل التدقيق"
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={tools.pending || !permissions.length} className={secondaryButtonClass + ' mt-4 w-full'}>
        <ShieldCheck className="size-4" aria-hidden="true" />
        {override ? 'حفظ تعديل الاستثناء' : 'إضافة الاستثناء'}
      </button>
    </form>
  );
}

function TeamsSection({
  branch,
  employees,
  services,
  tools,
}: {
  branch: SetupBranchDto;
  employees: SetupEmployeeDto[];
  services: SetupServiceDto[];
  tools: SectionTools;
}) {
  const [selectedId, setSelectedId] = useState<string>('new');
  const selected = branch.teams.find((team) => team.id === selectedId);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.7fr)_minmax(560px,1.3fr)]">
      <Panel
        title="فرق الفرع"
        description="الأولوية الأقل تُفاضل أولًا عند تساوي بقية العوامل."
        actions={(
          <button type="button" onClick={() => setSelectedId('new')} className={secondaryButtonClass}>
            <Plus className="size-4" aria-hidden="true" />
            فريق جديد
          </button>
        )}
      >
        {branch.teams.length ? (
          <div className="space-y-2">
            {branch.teams.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => setSelectedId(team.id)}
                className={'w-full rounded-xl border p-4 text-right transition ' + (
                  selectedId === team.id
                    ? 'border-[#d4af37]/35 bg-[#d4af37]/8'
                    : 'border-white/8 bg-black/25 hover:border-white/18'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-white/85">{team.name}</p>
                    <p className="mt-1 text-xs text-white/38">
                      {team.memberIds.length} عضو · {team.serviceIds.length} قدرة · {team.zoneIds.length} زون
                    </p>
                  </div>
                  <StatusPill active={team.active} />
                </div>
                <div className="mt-3 flex gap-2 text-[11px] text-white/40">
                  <span>السعة {team.dailyCapacity}</span>
                  <span>·</span>
                  <span>الأولوية {team.assignmentPriority}</span>
                  <span>·</span>
                  <span>{team.bookingCount} حجز</span>
                </div>
              </button>
            ))}
          </div>
        ) : <EmptyState title="لا توجد فرق" text="أنشئ فريقًا واربط أعضاءه وخدماته ونطاقه." />}
      </Panel>

      <TeamForm
        key={selected?.id ?? 'new'}
        branch={branch}
        team={selected}
        employees={employees}
        services={services}
        tools={tools}
      />
    </div>
  );
}

function TeamForm({
  branch,
  team,
  employees,
  services,
  tools,
}: {
  branch: SetupBranchDto;
  team?: SetupTeamDto;
  employees: SetupEmployeeDto[];
  services: SetupServiceDto[];
  tools: SectionTools;
}) {
  const [memberIds, setMemberIds] = useState<string[]>(team?.memberIds ?? []);
  const [zoneIds, setZoneIds] = useState<string[]>(team?.zoneIds ?? []);
  const [serviceIds, setServiceIds] = useState<string[]>(team?.serviceIds ?? []);
  const [leaderId, setLeaderId] = useState(team?.leaderId ?? '');
  const [baseZoneId, setBaseZoneId] = useState(team?.baseZoneId ?? '');
  const availableEmployees = employees.filter((employee) =>
    employee.role === 'EMPLOYEE' &&
    employee.active &&
    (!employee.teamId || employee.teamId === team?.id)
  );

  function toggle(values: string[], value: string, enabled: boolean, setter: (next: string[]) => void) {
    setter(enabled ? [...new Set([...values, value])] : values.filter((item) => item !== value));
    if (!enabled && value === leaderId) setLeaderId('');
    if (!enabled && value === baseZoneId) setBaseZoneId('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    const data = formDataFrom(event);
    data.set('memberIds', JSON.stringify(memberIds));
    data.set('zoneIds', JSON.stringify(zoneIds));
    data.set('serviceIds', JSON.stringify(serviceIds));
    data.set('leaderId', leaderId);
    data.set('baseZoneId', baseZoneId);
    tools.execute(saveSetupTeamAction, data);
  }

  return (
    <Panel
      title={team ? 'تكوين ' + team.name : 'تكوين فريق جديد'}
      description="الحفظ يستبدل روابط الأعضاء والزونات والقدرات دفعة واحدة داخل transaction."
    >
      <form onSubmit={submit} className="space-y-6">
        {team ? <input type="hidden" name="teamId" value={team.id} /> : null}
        <input type="hidden" name="branchId" value={branch.id} />
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-xs font-bold text-white/65 sm:col-span-1">
            اسم الفريق
            <input name="name" required minLength={2} maxLength={100} defaultValue={team?.name ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            السعة اليومية
            <input name="dailyCapacity" type="number" min={1} max={100} required defaultValue={team?.dailyCapacity ?? 5} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            أولوية الإسناد
            <input name="assignmentPriority" type="number" min={1} max={100} required defaultValue={team?.assignmentPriority ?? 1} className={inputClass} />
          </label>
        </div>
        <BooleanField name="active" label="الفريق متاح للإسناد" defaultChecked={team?.active ?? true} />

        <div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-black">أعضاء الفريق</h3>
              <p className="mt-1 text-xs text-white/38">الموظف لا يمكن أن ينتمي إلى فريقين في الوقت نفسه.</p>
            </div>
            <span className="text-xs tabular-nums text-[#d4af37]">{memberIds.length} محدد</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {availableEmployees.map((employee) => (
              <ToggleChoice
                key={employee.id}
                checked={memberIds.includes(employee.id)}
                onChange={(checked) => toggle(memberIds, employee.id, checked, setMemberIds)}
                label={employee.fullName}
                hint={employee.phone}
              />
            ))}
          </div>
          {!availableEmployees.length ? <p className="mt-3 rounded-xl bg-amber-400/8 p-3 text-xs text-amber-200">لا يوجد موظفون متاحون؛ أنشئ موظفًا أو فك ارتباطه من فريق آخر.</p> : null}
          <label className="mt-4 block text-xs font-bold text-white/65">
            قائد الفريق
            <select value={leaderId} onChange={(event) => setLeaderId(event.target.value)} className={inputClass}>
              <option value="">بدون قائد محدد</option>
              {availableEmployees
                .filter((employee) => memberIds.includes(employee.id))
                .map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
            </select>
          </label>
        </div>

        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-black">نطاق تغطية الفريق</h3>
              <p className="mt-1 text-xs text-white/38">حدد الزونات التي يستطيع الفريق استقبال حجوزاتها، واختر نقطة الانطلاق الأساسية.</p>
            </div>
            <span className="text-xs tabular-nums text-[#d4af37]">{zoneIds.length} محدد</span>
          </div>
          <label className="mt-3 block text-xs font-bold text-white/65">
            الزون الأساسي
            <select value={baseZoneId} onChange={(event) => setBaseZoneId(event.target.value)} className={inputClass}>
              <option value="">بدون زون أساسي محدد</option>
              {branch.zones.filter((zone) => zoneIds.includes(zone.id)).map((zone) => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
          </label>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {branch.zones.map((zone) => (
              <ToggleChoice
                key={zone.id}
                checked={zoneIds.includes(zone.id)}
                onChange={(checked) => toggle(zoneIds, zone.id, checked, setZoneIds)}
                label={zone.name}
                hint={`${zone.areas.length} منطقة تغطية`}
              />
            ))}
          </div>
          {!branch.zones.length ? <p className="mt-3 rounded-xl bg-amber-400/8 p-3 text-xs text-amber-200">أضف زون تغطية أولًا من قسم التغطية.</p> : null}
        </div>

        <div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-black">قدرات الخدمات</h3>
              <p className="mt-1 text-xs text-white/38">لن يظهر الفريق كمرشح لخدمة غير محددة هنا.</p>
            </div>
            <span className="text-xs tabular-nums text-[#d4af37]">{serviceIds.length} محدد</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {services.map((service) => (
              <ToggleChoice
                key={service.id}
                checked={serviceIds.includes(service.id)}
                onChange={(checked) => toggle(serviceIds, service.id, checked, setServiceIds)}
                label={service.nameAr}
                hint={service.active ? 'خدمة نشطة' : 'خدمة متوقفة'}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/8 pt-5 sm:flex-row sm:justify-between">
          {team && team.active ? (
            <button
              type="button"
              disabled={tools.pending}
              onClick={() => tools.requestConfirmation({
                title: 'إيقاف فريق ' + team.name,
                description: 'سيبقى سجل الحجوزات والإسنادات محفوظًا، لكن الفريق لن يظهر في حساب التوافر.',
                action: deactivateSetupTeamAction,
                entityId: team.id,
                branchId: branch.id,
                confirmLabel: 'إيقاف الفريق',
              })}
              className={dangerButtonClass}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              إيقاف الفريق
            </button>
          ) : <span />}
          <SaveButton pending={tools.pending} label={team ? 'حفظ تكوين الفريق' : 'إنشاء الفريق'} />
        </div>
      </form>
    </Panel>
  );
}

function CoverageSection({ branch, tools }: {
  branch: SetupBranchDto;
  tools: SectionTools;
}) {
  const defaultZone = branch.zones[0];
  const allAreas = useMemo(() => branch.zones.flatMap((z) => z.areas), [branch.zones]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('new');
  const selectedArea = allAreas.find((area) => area.id === selectedAreaId);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(480px,1.2fr)]">
        <Panel
          title="مناطق وكمبوندات التغطية"
          description="الكمبوندات والمناطق السكنية التي يخدمها هذا الفرع وتظهر للعملاء في شاشة حجز الخدمة."
          actions={(
            <button
              type="button"
              onClick={() => setSelectedAreaId('new')}
              className={secondaryButtonClass}
            >
              <Plus className="size-4" aria-hidden="true" />
              إضافة منطقة / كمبوند
            </button>
          )}
        >
          {allAreas.length ? (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {allAreas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => setSelectedAreaId(area.id)}
                  className={'w-full rounded-xl border p-3.5 text-right transition ' + (
                    selectedAreaId === area.id
                      ? 'border-[#d4af37]/35 bg-[#d4af37]/8'
                      : 'border-white/8 bg-black/25 hover:border-white/18'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white/85 text-sm">{area.compound}</span>
                    <StatusPill active={area.active} activeLabel="متاحة للحجز" inactiveLabel="متوقفة" />
                  </div>
                  <p className="mt-1 text-xs text-white/40">
                    {area.city} {area.district ? `· ${area.district}` : ''} {area.governorate ? `· ${area.governorate}` : ''}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-white/30">
                    <span>أولوية العرض: {area.priority}</span>
                    <span>·</span>
                    <span>{area.bookingCount} حجز سابق</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="لا توجد مناطق تغطية مضافة"
              text="أضف الكمبوندات والمناطق التي يخدمها هذا الفرع لتظهر للعملاء عند الحجز."
            />
          )}
        </Panel>

        <StreamlinedAreaEditor
          key={selectedArea?.id ?? 'new'}
          branch={branch}
          defaultZoneId={defaultZone?.id}
          area={selectedArea}
          tools={tools}
        />
      </div>
    </div>
  );
}

function StreamlinedAreaEditor({
  branch,
  defaultZoneId,
  area,
  tools,
}: {
  branch: SetupBranchDto;
  defaultZoneId?: string;
  area?: SetupAreaDto;
  tools: SectionTools;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    tools.execute(saveSetupAreaAction, formDataFrom(event));
  }

  const zoneIdToUse = defaultZoneId || branch.zones[0]?.id;

  return (
    <Panel
      title={area ? `تعديل منطقة "${area.compound}"` : 'إضافة كمبوند / منطقة جديدة'}
      description="تظهر هذه المنطقة في قائمة العناوين المتاحة للعميل عند اختيار حجز الخدمة."
    >
      <form onSubmit={submit} className="space-y-4">
        {area ? <input type="hidden" name="areaId" value={area.id} /> : null}
        <input type="hidden" name="branchId" value={branch.id} />
        {zoneIdToUse ? <input type="hidden" name="zoneId" value={zoneIdToUse} /> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-white/65 sm:col-span-2">
            اسم الكمبوند / المنطقة
            <input
              name="compound"
              required
              minLength={2}
              maxLength={200}
              defaultValue={area?.compound ?? ''}
              placeholder="مثال: KARMA 1، سوديك، بيفرلي هيلز، الحي المتميز..."
              className={inputClass}
            />
          </label>
          <label className="text-xs font-bold text-white/65">
            المدينة
            <input
              name="city"
              required
              defaultValue={area?.city ?? 'الشيخ زايد'}
              placeholder="مثال: الشيخ زايد، 6 أكتوبر، القاهرة الجديدة..."
              className={inputClass}
            />
          </label>
          <label className="text-xs font-bold text-white/65">
            الحي / المجاورة
            <input
              name="district"
              required
              defaultValue={area?.district ?? 'الشيخ زايد'}
              placeholder="مثال: الحي الأول، التوسعات..."
              className={inputClass}
            />
          </label>
          <label className="text-xs font-bold text-white/65">
            المحافظة
            <input
              name="governorate"
              required
              defaultValue={area?.governorate ?? 'الجيزة'}
              placeholder="مثال: الجيزة، القاهرة..."
              className={inputClass}
            />
          </label>
          <label className="text-xs font-bold text-white/65">
            أولوية العرض في القائمة
            <input
              name="priority"
              type="number"
              min={1}
              max={1000}
              required
              defaultValue={area?.priority ?? 1}
              className={inputClass}
            />
          </label>
        </div>

        <BooleanField name="active" label="متاحة للحجز للعملاء" defaultChecked={area?.active ?? true} description="عند إلغاء التحديد، ستختفي المنطقة من خيارات العميل دون حذف سجلاتها." />

        <div className="flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:justify-between">
          {area ? (
            <button
              type="button"
              disabled={tools.pending}
              onClick={() => tools.requestConfirmation({
                title: 'حذف منطقة ' + area.compound,
                description: area.bookingCount > 0
                  ? 'المنطقة مرتبطة بـ ' + area.bookingCount + ' حجز؛ يمكنك إيقاف إتاحتها للحجز بدل الحذف.'
                  : 'سيتم حذف المنطقة نهائيًا من قائمة التغطية.',
                action: deleteSetupAreaAction,
                entityId: area.id,
                branchId: branch.id,
                confirmLabel: 'حذف المنطقة',
              })}
              className={dangerButtonClass}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              حذف
            </button>
          ) : <span />}
          <SaveButton pending={tools.pending} label={area ? 'حفظ تعديلات المنطقة' : 'إضافة المنطقة'} />
        </div>
      </form>
    </Panel>
  );
}

function BranchEngineRulesInteractiveForm({
  branch,
  tools,
}: {
  branch: SetupBranchDto;
  tools: SectionTools;
}) {
  const [slotUnit, setSlotUnit] = useState<number>(branch.slotUnitMinutes ?? 60);
  const [travelBuffer, setTravelBuffer] = useState<number>(branch.travelBufferMinutes ?? 30);

  const totalGap = Math.max(0, travelBuffer);
  const totalSlotStride = slotUnit + totalGap;

  const previewSlots = useMemo(() => {
    const slots: string[] = [];
    // معاينة رياضية لتقسيم الفترات تبدأ من 09:00 ص لتعرض التوزيع المتتابع بدقة متناهية وبدون أي اقتطاع للوقت
    let currentMinutes = 9 * 60;
    const maxPreviewSlots = 7;

    while (slots.length < maxPreviewSlots) {
      const normalized = currentMinutes % 1440;
      const h = Math.floor(normalized / 60);
      const m = normalized % 60;
      const period = h >= 12 ? 'م' : 'ص';
      const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const offsetBadge = currentMinutes >= 1440 ? ' (+1)' : '';
      const formatted = `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}${offsetBadge}`;
      slots.push(formatted);
      currentMinutes += totalSlotStride;
    }
    return slots;
  }, [totalSlotStride]);

  return (
    <form
      onSubmit={(event) => tools.execute(saveBranchOperationsConfigAction, formDataFrom(event))}
      className="space-y-6"
    >
      <input type="hidden" name="branchId" value={branch.id} />
      <input type="hidden" name="restBufferMinutes" value="0" />
      <input type="hidden" name="arrivalWindowMinutes" value={String(branch.arrivalWindowMinutes || 30)} />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
          <label className="text-xs font-black text-white block">
            مدة السلوت التشغيلي (Slot Unit بالدقائق)
          </label>
          <input
            name="slotUnitMinutes"
            type="number"
            min={15}
            max={240}
            required
            value={slotUnit}
            onChange={(e) => setSlotUnit(Math.max(15, Number(e.target.value)))}
            className={inputClass}
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[30, 45, 60, 90, 120].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setSlotUnit(preset)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black border transition-colors cursor-pointer ${
                  slotUnit === preset
                    ? 'border-[#cea355] bg-[#cea355]/20 text-[#edce8b]'
                    : 'border-white/10 bg-black/40 text-neutral-400 hover:text-white'
                }`}
              >
                {preset} دقيقة {preset === 60 ? '(ساعة)' : ''}
              </button>
            ))}
          </div>
          <span className="block text-[11px] text-neutral-400">
            المدة الأساسية التي يُقاس بها حجز الخدمة في جدول التشغيل (مثلاً 60 دقيقة).
          </span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
          <label className="text-xs font-black text-white block">
            الفاصل الزمني بين المواعيد / وقت الانتقال (Travel Buffer بالدقائق)
          </label>
          <input
            name="travelBufferMinutes"
            type="number"
            min={0}
            max={180}
            required
            value={travelBuffer}
            onChange={(e) => setTravelBuffer(Math.max(0, Number(e.target.value)))}
            className={inputClass}
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[0, 15, 30, 45, 60].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setTravelBuffer(preset)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black border transition-colors cursor-pointer ${
                  travelBuffer === preset
                    ? 'border-[#cea355] bg-[#cea355]/20 text-[#edce8b]'
                    : 'border-white/10 bg-black/40 text-neutral-400 hover:text-white'
                }`}
              >
                {preset} دقيقة {preset === 0 ? '(بدون)' : ''}
              </button>
            ))}
          </div>
          <span className="block text-[11px] text-neutral-400">
            الوقت المتروك تلقائياً بين انتهاء الخدمة وبداية الموعد التالي لانتقال الفريق بين العملاء.
          </span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
          <label className="text-xs font-black text-white block">
            الحد الأقصى للحجوزات اليومية للفرع
          </label>
          <input
            name="dailyBookingLimit"
            type="number"
            min={1}
            max={500}
            required
            defaultValue={branch.dailyBookingLimit}
            className={inputClass}
          />
          <span className="block text-[11px] text-neutral-400">
            أقصى سعة حجوزات يمكن للنظام قبولها في اليوم الواحد للفرع.
          </span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
          <label className="text-xs font-black text-white block">
            نمط إسناد الحجوزات للفرق
          </label>
          <select name="assignmentMode" defaultValue={branch.assignmentMode} className={inputClass}>
            <option value="AUTOMATIC">تلقائي حسب المحرك وتوفر الفرق</option>
            <option value="MANUAL">يدوي من لوحة إدارة التشغيل</option>
          </select>
          <span className="block text-[11px] text-neutral-400">
            طريقة توزيع المهام والحجوزات اليومية على فرق العمل الميدانية.
          </span>
        </div>
      </div>

      {/* Live Preview of Slot Partitioning with Travel Gap */}
      <div className="rounded-2xl border border-[#cea355]/30 bg-[#cea355]/[0.06] p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#cea355]/20 pb-3">
          <div className="flex items-center gap-2">
            <Clock3 className="size-4 text-[#edce8b]" />
            <span className="text-xs font-black text-white">
              معاينة حية لتقسيم فترات التشغيل والمواعيد المعروضة للعميل:
            </span>
          </div>
          <span className="text-[11px] font-bold text-[#edce8b]">
            مدة الخدمة: {slotUnit} دقيقة · فاصل الانتقال: {totalGap} دقيقة · الخطوة الإجمالية: {totalSlotStride} دقيقة
          </span>
        </div>

        <p className="text-xs text-white/80 leading-5">
          بناءً على هذه الإعدادات (إذا بدأ اليوم 09:00 ص)، ستظهر مواعيد الحجز للعميل مقسمة بالفواصل الزمنية كالتالي:
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {previewSlots.map((slotTime, idx) => (
            <div
              key={slotTime}
              className="flex items-center gap-1.5 rounded-xl border border-[#cea355]/40 bg-black/60 px-3 py-2 text-xs font-black text-[#edce8b]"
            >
              <span className="size-1.5 rounded-full bg-[#cea355]" />
              <span>{slotTime}</span>
              {idx < previewSlots.length - 1 && totalGap > 0 && (
                <span className="text-[10px] text-neutral-400 font-normal mr-1">
                  (+{totalGap}د انتقال)
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end border-t border-white/8 pt-5">
        <SaveButton pending={tools.pending} label="حفظ قواعد المحرك وتوزيع السلوتات" />
      </div>
    </form>
  );
}

function ScheduleSection({ branch, employees, tools }: {
  branch: SetupBranchDto;
  employees: SetupEmployeeDto[];
  tools: SectionTools;
}) {
  const [teamId, setTeamId] = useState(branch.teams[0]?.id ?? '');
  const team = branch.teams.find((candidate) => candidate.id === teamId);
  return (
    <>
      <Panel
        title="قواعد السعة وتوزيع السلوتات التشغيلية"
        description="هذه القيم تدخل مباشرة في تقسيم فترات التشغيل، حساب مدة السلوت، ووقت الانتقال بين العملاء."
        actions={<Gauge className="size-5 text-[#d4af37]" aria-hidden="true" />}
      >
        <BranchEngineRulesInteractiveForm branch={branch} tools={tools} />
      </Panel>

      <Panel
        title="ساعات عمل الفرع"
        description={'الوقت محلي حسب ' + branch.timezone + '. احفظ كل يوم بعد تعديله.'}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {DAYS.map((day) => {
            const hours = branch.workingHours.find((item) => item.dayOfWeek === day.value);
            return (
              <HoursCard
                key={day.value}
                day={day}
                hours={hours ? {
                  disabled: hours.isClosed,
                  openTime: hours.openTime,
                  closeTime: hours.closeTime,
                  breakStartTime: hours.breakStartTime,
                  breakEndTime: hours.breakEndTime,
                } : undefined}
                hiddenName="branchId"
                hiddenValue={branch.id}
                disabledName="isClosed"
                disabledLabel="الفرع مغلق"
                action={saveBranchWorkingHoursAction}
                tools={tools}
                slotUnitMinutes={branch.slotUnitMinutes ?? 60}
                travelBufferMinutes={branch.travelBufferMinutes ?? 30}
                restBufferMinutes={branch.restBufferMinutes ?? 0}
              />
            );
          })}
        </div>
      </Panel>

      <Panel
        title="ساعات الفرق والاستراحات"
        description="يمكن تضييق ساعات فريق عن الفرع؛ لا يمكن توسيع الموعد خارج ساعات الفرع."
        actions={branch.teams.length ? (
          <label className="text-xs font-bold text-white/55">
            الفريق
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className={inputClass + ' min-w-56'}>
              {branch.teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        ) : null}
      >
        {team ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {DAYS.map((day) => {
              const hours = team.workingHours.find((item) => item.dayOfWeek === day.value);
              const branchHours = branch.workingHours.find((item) => item.dayOfWeek === day.value);
              return (
                <HoursCard
                  key={team.id + '-' + day.value}
                  day={day}
                  hours={hours ? {
                    disabled: hours.isOff,
                    openTime: hours.openTime,
                    closeTime: hours.closeTime,
                    breakStartTime: hours.breakStartTime,
                    breakEndTime: hours.breakEndTime,
                  } : {
                    disabled: branchHours?.isClosed ?? false,
                    openTime: branchHours?.openTime ?? '09:00',
                    closeTime: branchHours?.closeTime ?? '16:00',
                    breakStartTime: branchHours?.breakStartTime ?? null,
                    breakEndTime: branchHours?.breakEndTime ?? null,
                  }}
                  hiddenName="teamId"
                  hiddenValue={team.id}
                  disabledName="isOff"
                  disabledLabel="إجازة للفريق"
                  action={saveTeamWorkingHoursAction}
                  tools={tools}
                  slotUnitMinutes={branch.slotUnitMinutes ?? 60}
                  travelBufferMinutes={branch.travelBufferMinutes ?? 30}
                  restBufferMinutes={branch.restBufferMinutes ?? 0}
                />
              );
            })}
          </div>
        ) : <EmptyState title="لا توجد فرق" text="أنشئ فريقًا أولًا لضبط ساعاته." />}
      </Panel>

      <BlackoutsPanel branch={branch} tools={tools} />

      <TimeOffPanel
        branch={branch}
        subjectType="TEAM"
        subjects={branch.teams.map((item) => ({ id: item.id, name: item.name, timeOff: item.timeOff }))}
        tools={tools}
      />
      <TimeOffPanel
        branch={branch}
        subjectType="EMPLOYEE"
        subjects={employees.map((item) => ({ id: item.id, name: item.fullName, timeOff: item.timeOff }))}
        tools={tools}
      />
    </>
  );
}

function HoursCard({
  day,
  hours,
  hiddenName,
  hiddenValue,
  disabledName,
  disabledLabel,
  action,
  tools,
  slotUnitMinutes = 60,
  travelBufferMinutes = 30,
  restBufferMinutes = 0,
}: {
  day: { value: number; label: string };
  hours?: {
    disabled: boolean;
    openTime: string;
    closeTime: string;
    breakStartTime: string | null;
    breakEndTime: string | null;
  };
  hiddenName: 'branchId' | 'teamId';
  hiddenValue: string;
  disabledName: 'isClosed' | 'isOff';
  disabledLabel: string;
  action: SetupMutation;
  tools: SectionTools;
  slotUnitMinutes?: number;
  travelBufferMinutes?: number;
  restBufferMinutes?: number;
}) {
  const [disabled, setDisabled] = useState(hours?.disabled ?? false);
  const [openTime, setOpenTime] = useState(hours?.openTime ?? '09:00');
  const [closeTime, setCloseTime] = useState(hours?.closeTime ?? '17:00');
  const [breakStart, setBreakStart] = useState(hours?.breakStartTime ?? '');
  const [breakEnd, setBreakEnd] = useState(hours?.breakEndTime ?? '');

  const totalGap = Math.max(0, travelBufferMinutes + restBufferMinutes);
  const strideMinutes = slotUnitMinutes + totalGap;

  const parseMinutes = (timeStr: string) => {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };


  const formatMinutesToTime = (totalMin: number) => {
    const normalized = totalMin % 1440;
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const formatMinutesToDisplay = (totalMin: number, showDayOffset = false) => {
    const normalized = totalMin % 1440;
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    const period = h >= 12 ? 'م' : 'ص';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const offsetBadge = showDayOffset && totalMin >= 1440 ? ' (+1)' : '';
    return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}${offsetBadge}`;
  };

  const is24Hours = useMemo(() => {
    return openTime === closeTime;
  }, [openTime, closeTime]);

  const isOvernight = useMemo(() => {
    if (is24Hours) return false;
    const openMin = parseMinutes(openTime);
    const closeMin = parseMinutes(closeTime);
    return closeMin < openMin;
  }, [openTime, closeTime, is24Hours]);

  const operationalSlots = useMemo(() => {
    const slots: Array<{
      startFormatted: string;
      endFormatted: string;
      label: string;
    }> = [];
    const openMin = parseMinutes(openTime);
    let closeMin = parseMinutes(closeTime);
    if (closeMin <= openMin) {
      closeMin += 1440;
    }

    let cur = openMin;
    while (cur <= closeMin && slots.length < 48) {
      const slotStart = cur;
      const slotEnd = cur + slotUnitMinutes;
      slots.push({
        startFormatted: formatMinutesToTime(slotStart),
        endFormatted: formatMinutesToTime(slotEnd),
        label: `${formatMinutesToDisplay(slotStart)} إلى ${formatMinutesToDisplay(slotEnd, true)}`,
      });
      cur += strideMinutes;
    }
    return slots;
  }, [openTime, closeTime, slotUnitMinutes, strideMinutes]);

  const livePreview = useMemo(() => {
    if (disabled) return [];
    const preview: Array<{ timeDisplay: string; isBreak: boolean }> = [];
    const openMin = parseMinutes(openTime);
    let closeMin = parseMinutes(closeTime);
    if (closeMin <= openMin) {
      closeMin += 1440;
    }
    let bStart = breakStart ? parseMinutes(breakStart) : null;
    let bEnd = breakEnd ? parseMinutes(breakEnd) : null;
    if (bStart !== null && bEnd !== null) {
      if (bStart < openMin && closeMin > 1440) {
        bStart += 1440;
      }
      if (bEnd <= bStart) {
        bEnd += 1440;
      }
    }
    const hasBreak = bStart !== null && bEnd !== null && bStart < bEnd;

    let cur = openMin;
    while (cur <= closeMin && preview.length < 48) {
      const slotStart = cur;
      const slotEnd = cur + slotUnitMinutes;

      if (hasBreak && !(slotEnd <= bStart! || slotStart >= bEnd!)) {
        preview.push({
          timeDisplay: `${formatMinutesToDisplay(bStart!)} (استراحة ☕)`,
          isBreak: true,
        });
        const slotUnit = Math.max(15, slotUnitMinutes);
        const offset = bEnd! - openMin;
        const alignedOffset = Math.ceil(offset / slotUnit) * slotUnit;
        cur = openMin + Math.max(offset, alignedOffset);
        continue;
      }

      preview.push({
        timeDisplay: formatMinutesToDisplay(slotStart, true),
        isBreak: false,
      });
      cur += strideMinutes;
    }
    return preview;
  }, [disabled, openTime, closeTime, breakStart, breakEnd, slotUnitMinutes, strideMinutes]);

  return (
    <form
      onSubmit={(event) => tools.execute(action, formDataFrom(event))}
      className={`rounded-2xl border transition-all ${
        disabled
          ? 'border-white/5 bg-black/15 opacity-70'
          : 'border-white/10 bg-black/30 hover:border-white/20'
      } p-4 flex flex-col justify-between`}
    >
      <div>
        <input type="hidden" name={hiddenName} value={hiddenValue} />
        <input type="hidden" name="dayOfWeek" value={day.value} />
        <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
          <h3 className="font-black text-white text-sm sm:text-base">{day.label}</h3>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-white/60">
            <input
              type="checkbox"
              name={disabledName}
              value="true"
              checked={disabled}
              onChange={(e) => setDisabled(e.target.checked)}
              className="size-4 accent-red-500 rounded"
            />
            <input type="hidden" name={disabledName} value="false" />
            <span className={disabled ? 'text-red-400 font-bold' : ''}>{disabledLabel}</span>
          </label>
        </div>

        {!disabled && (
          <div className="mt-3.5 space-y-3.5">
            {/* Quick 24h preset & status indicator */}
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-1.5 min-h-[22px]">
                {is24Hours ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                    <span>✨</span> تشغيل 24 ساعة متواصل
                  </span>
                ) : isOvernight ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/15 border border-purple-500/30 text-purple-300">
                    <span>🌙</span> دوام ليلي (يمتد لليوم التالي)
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpenTime('00:00');
                  setCloseTime('00:00');
                }}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all ${
                  is24Hours
                    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300 shadow-sm'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-emerald-500/40 hover:text-emerald-300'
                }`}
                title="ضبط الفرع ليعمل 24 ساعة متواصلة بدون توقف"
              >
                ⚡ 24 ساعة متواصل
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="text-[11px] font-bold text-white/55">
                الفتح
                <input
                  name="openTime"
                  type="time"
                  step="900"
                  required
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  className={inputClass + ' mt-1'}
                />
              </label>
              <label className="text-[11px] font-bold text-white/55">
                الإغلاق
                <input
                  name="closeTime"
                  type="time"
                  step="900"
                  required
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  className={inputClass + ' mt-1'}
                />
              </label>
            </div>

            {/* Quick Slot Break Selector */}
            <div className="rounded-xl bg-white/[0.03] border border-white/5 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#edce8b] flex items-center gap-1">
                  <span>☕ استراحة التشغيل (اختيار سلوت مباشر)</span>
                </span>
                {breakStart && breakEnd && (
                  <button
                    type="button"
                    onClick={() => { setBreakStart(''); setBreakEnd(''); }}
                    className="text-[10px] text-red-400 hover:text-red-300 font-bold underline"
                  >
                    إلغاء الاستراحة
                  </button>
                )}
              </div>

              {operationalSlots.length > 0 ? (
                <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto p-1 custom-scrollbar">
                  <button
                    type="button"
                    onClick={() => { setBreakStart(''); setBreakEnd(''); }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                      !breakStart && !breakEnd
                        ? 'border-[#cea355] bg-[#cea355]/20 text-[#edce8b]'
                        : 'border-white/10 bg-black/40 text-neutral-400 hover:text-white'
                    }`}
                  >
                    بدون استراحة
                  </button>
                  {operationalSlots.map((slot) => {
                    const isSelected = breakStart === slot.startFormatted && breakEnd === slot.endFormatted;
                    return (
                      <button
                        key={slot.startFormatted}
                        type="button"
                        onClick={() => {
                          setBreakStart(slot.startFormatted);
                          setBreakEnd(slot.endFormatted);
                        }}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                          isSelected
                            ? 'border-amber-400 bg-amber-400/25 text-amber-200 shadow-sm'
                            : 'border-white/10 bg-black/40 text-neutral-300 hover:border-amber-400/50 hover:text-amber-200'
                        }`}
                      >
                        سلوت {slot.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                <label className="text-[10px] text-white/40">
                  بداية الاستراحة
                  <input
                    name="breakStartTime"
                    type="time"
                    step="900"
                    value={breakStart}
                    onChange={(e) => setBreakStart(e.target.value)}
                    placeholder="بدون"
                    className={inputClass + ' mt-0.5 text-xs py-1'}
                  />
                </label>
                <label className="text-[10px] text-white/40">
                  نهاية الاستراحة
                  <input
                    name="breakEndTime"
                    type="time"
                    step="900"
                    value={breakEnd}
                    onChange={(e) => setBreakEnd(e.target.value)}
                    placeholder="بدون"
                    className={inputClass + ' mt-0.5 text-xs py-1'}
                  />
                </label>
              </div>
            </div>

            {/* Live Customer Preview Window */}
            <div className="rounded-xl bg-[#09090b] border border-[#d4af37]/20 p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="size-1.5 rounded-full bg-[#cea355] animate-pulse" />
                <span className="text-[10px] font-black text-[#cea355]">معاينة حية للمواعيد المعروضة للعميل:</span>
              </div>
              {livePreview.length > 0 ? (
                <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-0.5 custom-scrollbar">
                  {livePreview.map((slot, idx) => (
                    <span
                      key={idx}
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        slot.isBreak
                          ? 'border border-amber-500/40 bg-amber-500/15 text-amber-300'
                          : 'border border-white/10 bg-white/5 text-neutral-200'
                      }`}
                    >
                      {slot.timeDisplay}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-neutral-500">لا توجد مواعيد متاحة في نطاق هذا الوقت.</p>
              )}
            </div>
          </div>
        )}

        {disabled && (
          <div className="py-6 text-center text-xs font-bold text-red-400/80">
            هذا اليوم محدد كإجازة (مغلق)
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={tools.pending}
        className={secondaryButtonClass + ' mt-4 w-full justify-center'}
      >
        <Save className="size-3.5" aria-hidden="true" />
        <span>حفظ {day.label}</span>
      </button>
    </form>
  );
}

function BlackoutsPanel({ branch, tools }: { branch: SetupBranchDto; tools: SectionTools }) {
  return (
    <Panel
      title="أيام الإغلاق الاستثنائية"
      description="تمنع إنشاء مواعيد جديدة في تاريخ محدد حتى لو كان يوم عمل عاديًا."
    >
      <form
        onSubmit={(event) => tools.execute(saveBlackoutDateAction, formDataFrom(event))}
        className="grid gap-4 rounded-2xl border border-white/8 bg-black/25 p-4 sm:grid-cols-[180px_1fr_auto] sm:items-end"
      >
        <input type="hidden" name="branchId" value={branch.id} />
        <label className="text-xs font-bold text-white/65">
          التاريخ
          <input name="date" type="date" required className={inputClass} />
        </label>
        <label className="text-xs font-bold text-white/65">
          السبب
          <input name="reason" required minLength={2} maxLength={500} placeholder="صيانة، عطلة رسمية…" className={inputClass} />
        </label>
        <SaveButton pending={tools.pending} label="إضافة إغلاق" />
      </form>

      <div className="mt-5 space-y-3">
        {branch.blackoutDates.map((blackout) => (
          <form
            key={blackout.id}
            onSubmit={(event) => tools.execute(saveBlackoutDateAction, formDataFrom(event))}
            className="grid gap-3 rounded-xl border border-white/8 bg-black/20 p-3 sm:grid-cols-[170px_1fr_auto_auto] sm:items-end"
          >
            <input type="hidden" name="blackoutId" value={blackout.id} />
            <input type="hidden" name="branchId" value={branch.id} />
            <label className="text-[11px] font-bold text-white/45">
              التاريخ
              <input name="date" type="date" required defaultValue={blackout.date} className={inputClass} />
            </label>
            <label className="text-[11px] font-bold text-white/45">
              السبب
              <input name="reason" required minLength={2} maxLength={500} defaultValue={blackout.reason ?? ''} className={inputClass} />
            </label>
            <button type="submit" disabled={tools.pending} className={secondaryButtonClass}>
              <Save className="size-4" aria-hidden="true" />
              حفظ
            </button>
            <button
              type="button"
              disabled={tools.pending}
              onClick={() => tools.requestConfirmation({
                title: 'حذف يوم الإغلاق ' + blackout.date,
                description: 'سيعود التاريخ للاعتماد على ساعات العمل الأسبوعية العادية.',
                action: deleteBlackoutDateAction,
                entityId: blackout.id,
                branchId: branch.id,
                confirmLabel: 'حذف الإغلاق',
              })}
              className={dangerButtonClass}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              حذف
            </button>
          </form>
        ))}
        {!branch.blackoutDates.length ? <EmptyState title="لا توجد إغلاقات استثنائية" text="الجدول يعتمد على ساعات الأسبوع فقط." /> : null}
      </div>
    </Panel>
  );
}

type TimeOffSubjectType = 'TEAM' | 'EMPLOYEE';

interface TimeOffSubject {
  id: string;
  name: string;
  timeOff: SetupTimeOffDto[];
}

function timeOffInputParts(value: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function TimeOffPanel({
  branch,
  subjectType,
  subjects,
  tools,
}: {
  branch: SetupBranchDto;
  subjectType: TimeOffSubjectType;
  subjects: TimeOffSubject[];
  tools: SectionTools;
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const subject = subjects.find((candidate) => candidate.id === subjectId) ?? subjects[0];
  const isTeam = subjectType === 'TEAM';

  return (
    <Panel
      title={isTeam ? 'إجازات الفرق' : 'إجازات الموظفين'}
      description={isTeam
        ? 'توقف الفريق بالكامل خلال الفترة ويُستبعد من محرك الإسناد.'
        : 'يُستبعد الموظف من أهلية الفريق خلال الفترة المحددة.'}
      actions={subjects.length ? (
        <label className="text-xs font-bold text-white/55">
          {isTeam ? 'الفريق' : 'الموظف'}
          <select
            value={subject?.id ?? ''}
            onChange={(event) => setSubjectId(event.target.value)}
            className={inputClass + ' min-w-52'}
          >
            {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      ) : null}
    >
      {subject ? (
        <div className="space-y-4">
          <TimeOffForm
            key={subject.id + '-new'}
            branch={branch}
            subjectType={subjectType}
            subject={subject}
            tools={tools}
          />
          {subject.timeOff.map((timeOff) => (
            <TimeOffForm
              key={timeOff.id}
              branch={branch}
              subjectType={subjectType}
              subject={subject}
              timeOff={timeOff}
              tools={tools}
            />
          ))}
          {!subject.timeOff.length ? (
            <EmptyState
              title="لا توجد إجازات مسجلة"
              text={'الإتاحة الحالية لـ ' + subject.name + ' تعتمد على ساعات العمل فقط.'}
            />
          ) : null}
        </div>
      ) : (
        <EmptyState
          title={isTeam ? 'لا توجد فرق' : 'لا يوجد موظفون'}
          text={isTeam ? 'أنشئ فريقًا أولًا لتسجيل إجازاته.' : 'أضف موظفًا للفرع أولًا لتسجيل إجازاته.'}
        />
      )}
    </Panel>
  );
}

function TimeOffForm({
  branch,
  subjectType,
  subject,
  timeOff,
  tools,
}: {
  branch: SetupBranchDto;
  subjectType: TimeOffSubjectType;
  subject: TimeOffSubject;
  timeOff?: SetupTimeOffDto;
  tools: SectionTools;
}) {
  const start = timeOff ? timeOffInputParts(timeOff.startDate, branch.timezone) : null;
  const end = timeOff ? timeOffInputParts(timeOff.endDate, branch.timezone) : null;
  return (
    <form
      onSubmit={(event) => tools.execute(saveSetupTimeOffAction, formDataFrom(event))}
      className={'rounded-2xl border p-4 ' + (timeOff
        ? 'border-white/8 bg-black/20'
        : 'border-[#d4af37]/20 bg-[#d4af37]/[0.045]')}
    >
      {timeOff ? <input type="hidden" name="timeOffId" value={timeOff.id} /> : null}
      <input type="hidden" name="branchId" value={branch.id} />
      <input type="hidden" name="subjectType" value={subjectType} />
      <input type="hidden" name="subjectId" value={subject.id} />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-white/82">
            {timeOff ? 'تعديل فترة الإجازة' : 'إضافة فترة جديدة'}
          </p>
          <p className="mt-1 text-[11px] text-white/35">الوقت محلي حسب {branch.timezone}</p>
        </div>
        {timeOff ? (
          <button
            type="button"
            disabled={tools.pending}
            onClick={() => tools.requestConfirmation({
              title: 'حذف إجازة ' + subject.name,
              description: 'سيصبح العنصر متاحًا لمحرك الإسناد مجددًا خلال هذه الفترة إذا سمحت بقية القواعد.',
              action: deleteSetupTimeOffAction,
              entityId: timeOff.id,
              branchId: branch.id,
              additionalFields: { subjectType },
              confirmLabel: 'حذف فترة الإجازة',
            })}
            className={dangerButtonClass}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            حذف
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-bold text-white/50">
          تاريخ البداية
          <input name="startDate" type="date" required defaultValue={start?.date ?? ''} className={inputClass} />
        </label>
        <label className="text-[11px] font-bold text-white/50">
          وقت البداية
          <input name="startTime" type="time" required defaultValue={start?.time ?? ''} className={inputClass} />
        </label>
        <label className="text-[11px] font-bold text-white/50">
          تاريخ النهاية
          <input name="endDate" type="date" required defaultValue={end?.date ?? ''} className={inputClass} />
        </label>
        <label className="text-[11px] font-bold text-white/50">
          وقت النهاية
          <input name="endTime" type="time" required defaultValue={end?.time ?? ''} className={inputClass} />
        </label>
      </div>
      <label className="mt-3 block text-[11px] font-bold text-white/50">
        سبب الإجازة
        <input
          name="reason"
          required
          minLength={2}
          maxLength={500}
          defaultValue={timeOff?.reason ?? ''}
          placeholder="إجازة سنوية، صيانة معدات…"
          className={inputClass}
        />
      </label>
      {timeOff ? (
        <label className="mt-3 block text-[11px] font-bold text-white/50">
          سبب هذا التعديل
          <input
            name="changeReason"
            required
            minLength={5}
            maxLength={500}
            placeholder="يسجل مع التعديل في سجل التدقيق"
            className={inputClass}
          />
        </label>
      ) : null}
      <button type="submit" disabled={tools.pending} className={secondaryButtonClass + ' mt-4 w-full'}>
        <Save className="size-4" aria-hidden="true" />
        {timeOff ? 'حفظ تعديل الإجازة' : 'إضافة الإجازة'}
      </button>
    </form>
  );
}

function PaymentsSection({ branch, tools }: {
  branch: SetupBranchDto;
  tools: SectionTools;
}) {
  const [selectedId, setSelectedId] = useState<string>('new');
  const selected = branch.paymentMethods.find((method) => method.id === selectedId);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(300px,0.75fr)_minmax(480px,1.25fr)]">
      <Panel
        title="قنوات التحصيل"
        description="الوسيلة الافتراضية تظهر أولًا للعميل."
        actions={(
          <button type="button" onClick={() => setSelectedId('new')} className={secondaryButtonClass}>
            <Plus className="size-4" aria-hidden="true" />
            وسيلة جديدة
          </button>
        )}
      >
        {branch.paymentMethods.length ? (
          <div className="space-y-2">
            {branch.paymentMethods.map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => setSelectedId(method.id)}
                className={'w-full rounded-xl border p-4 text-right transition ' + (
                  selectedId === method.id
                    ? 'border-[#d4af37]/35 bg-[#d4af37]/8'
                    : 'border-white/8 bg-black/25 hover:border-white/18'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-white/85">{method.name}</p>
                    <p dir="ltr" className="mt-1 text-left text-xs text-white/38">{method.accountNumber}</p>
                  </div>
                  <StatusPill active={method.active} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  {method.isDefault ? <span className="rounded-full bg-[#d4af37]/12 px-2 py-1 text-[#e6cb70]">افتراضية</span> : null}
                  <span className="rounded-full bg-white/[0.055] px-2 py-1 text-white/45">{method.proofCount} إثبات دفع</span>
                </div>
              </button>
            ))}
          </div>
        ) : <EmptyState title="لا توجد وسائل دفع" text="أضف وسيلة واحدة وحددها افتراضية." />}
      </Panel>

      <PaymentMethodForm
        key={selected?.id ?? 'new'}
        branch={branch}
        method={selected}
        tools={tools}
      />
    </div>
  );
}

function PaymentMethodForm({
  branch,
  method,
  tools,
}: {
  branch: SetupBranchDto;
  method?: SetupPaymentMethodDto;
  tools: SectionTools;
}) {
  return (
    <Panel
      title={method ? 'تعديل ' + method.name : 'إضافة وسيلة دفع'}
      description="لا تُدخل بيانات دخول بنكية؛ خزّن رقم أو معرّف التحويل وتعليمات العميل فقط."
    >
      <form
        onSubmit={(event) => tools.execute(savePaymentMethodAction, formDataFrom(event))}
        className="space-y-5"
      >
        {method ? <input type="hidden" name="paymentMethodId" value={method.id} /> : null}
        <input type="hidden" name="branchId" value={branch.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-white/65">
            الاسم الظاهر
            <input name="name" required minLength={2} maxLength={200} defaultValue={method?.name ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            النوع
            <select name="type" defaultValue={method?.type ?? 'VODAFONE_CASH'} className={inputClass}>
              {PAYMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-white/65">
            رقم الحساب / المعرّف
            <input name="accountNumber" dir="ltr" required maxLength={100} defaultValue={method?.accountNumber ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            اسم صاحب الحساب
            <input name="accountName" required minLength={2} maxLength={200} defaultValue={method?.accountName ?? ''} className={inputClass} />
          </label>
        </div>
        <label className="block text-xs font-bold text-white/65">
          تعليمات التحويل
          <textarea name="instructions" maxLength={1000} defaultValue={method?.instructions ?? ''} className={textareaClass} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <BooleanField name="active" label="متاحة للعملاء" defaultChecked={method?.active ?? true} />
          <BooleanField name="isDefault" label="الوسيلة الافتراضية" defaultChecked={method?.isDefault ?? false} description="سيتم إلغاء الافتراضية عن بقية وسائل الفرع." />
        </div>
        <div className="flex flex-col gap-3 border-t border-white/8 pt-5 sm:flex-row sm:justify-between">
          {method ? (
            <button
              type="button"
              disabled={tools.pending}
              onClick={() => tools.requestConfirmation({
                title: 'إزالة وسيلة ' + method.name,
                description: method.proofCount > 0
                  ? 'الوسيلة مستخدمة في إثباتات سابقة، لذلك سيجري تعطيلها بدل حذفها.'
                  : 'الوسيلة غير مستخدمة ويمكن حذفها نهائيًا.',
                action: deletePaymentMethodAction,
                entityId: method.id,
                branchId: branch.id,
                confirmLabel: method.proofCount > 0 ? 'تعطيل الوسيلة' : 'حذف الوسيلة',
              })}
              className={dangerButtonClass}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {method.proofCount > 0 ? 'تعطيل' : 'حذف'}
            </button>
          ) : <span />}
          <SaveButton pending={tools.pending} label={method ? 'حفظ وسيلة الدفع' : 'إضافة وسيلة الدفع'} />
        </div>
      </form>
    </Panel>
  );
}

interface EditableChecklistItem {
  clientKey: string;
  id?: string;
  labelAr: string;
  descriptionAr: string;
  required: boolean;
  requiresNote: boolean;
  displayOrder: number;
  active: boolean;
}

function ChecklistsSection({ services, tools }: {
  services: SetupServiceDto[];
  tools: SectionTools;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [templateId, setTemplateId] = useState<string>('new');
  const service = services.find((candidate) => candidate.id === serviceId);
  const template = service?.checklistTemplates.find((candidate) => candidate.id === templateId);

  if (!services.length) {
    return <EmptyState title="لا توجد خدمات" text="أنشئ خدمة من كتالوج الخدمات قبل بناء قوائم التنفيذ." />;
  }

  return (
    <>
      <Panel
        title="قوالب وقوائم مهام المراحل"
        description="أنشئ وطبّق قوائم مهام الفحص والتنفيذ على خدمة واحدة أو عدة خدمات معاً بضغطة واحدة."
        actions={(
          <label className="text-xs font-bold text-white/55">
            عرض قوالب خدمة:
            <select
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);
                setTemplateId('new');
              }}
              className={inputClass + ' min-w-64'}
            >
              {services.map((item) => <option key={item.id} value={item.id}>{item.nameAr}{item.active ? '' : ' — متوقفة'}</option>)}
            </select>
          </label>
        )}
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTemplateId('new')}
            className={(templateId === 'new' ? primaryButtonClass : secondaryButtonClass)}
          >
            <Plus className="size-4" aria-hidden="true" />
            + إضافة مرحلة / قائمة جديدة
          </button>
          {service?.checklistTemplates.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTemplateId(item.id)}
              className={(templateId === item.id ? primaryButtonClass : secondaryButtonClass)}
            >
              {item.name || STAGES.find((stage) => stage.value === item.stage)?.label || item.stage}
              <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px]">{item.items.length} بنود</span>
            </button>
          ))}
        </div>
      </Panel>

      <ChecklistEditor
        key={template?.id ?? 'new-' + (service?.id || 'all')}
        services={services}
        initialServiceId={service?.id || services[0]?.id || ''}
        template={template}
        tools={tools}
      />
    </>
  );
}

function ChecklistEditor({
  services,
  initialServiceId,
  template,
  tools,
}: {
  services: SetupServiceDto[];
  initialServiceId: string;
  template?: SetupChecklistTemplateDto;
  tools: SectionTools;
}) {
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(() =>
    template ? [initialServiceId] : services.map((s) => s.id)
  );

  const sequence = useRef(template?.items.length ?? 1);
  const [items, setItems] = useState<EditableChecklistItem[]>(() => template
    ? template.items.map((item) => ({
        clientKey: item.id,
        id: item.id,
        labelAr: item.labelAr,
        descriptionAr: item.descriptionAr ?? '',
        required: item.required,
        requiresNote: item.requiresNote,
        displayOrder: item.displayOrder,
        active: item.active,
      }))
    : [{
        clientKey: 'new-0',
        labelAr: '',
        descriptionAr: '',
        required: true,
        requiresNote: false,
        displayOrder: 1,
        active: true,
      }]
  );

  function updateItem(clientKey: string, patch: Partial<EditableChecklistItem>) {
    setItems((current) => current.map((item) => item.clientKey === clientKey ? { ...item, ...patch } : item));
  }

  function addItem() {
    const next = sequence.current;
    sequence.current += 1;
    setItems((current) => [
      ...current,
      {
        clientKey: 'new-' + next,
        labelAr: '',
        descriptionAr: '',
        required: true,
        requiresNote: false,
        displayOrder: current.length + 1,
        active: true,
      },
    ]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    const data = formDataFrom(event);
    data.set('serviceIds', JSON.stringify(selectedServiceIds));
    data.set('items', JSON.stringify(items.map((item) => ({
      id: item.id,
      labelAr: item.labelAr,
      descriptionAr: item.descriptionAr,
      required: item.required,
      requiresNote: item.requiresNote,
      displayOrder: item.displayOrder,
      active: item.active,
    }))));
    tools.execute(saveChecklistTemplateAction, data);
  }

  return (
    <Panel
      title={template ? 'تحرير مرحلة: ' + template.name : 'إنشاء مرحلة / قائمة مهام جديدة'}
      description="اكتب اسم المرحلة وأضف بنود المهام المطلوب تنفيذها، وحدد الخدمات التابعة لها."
      actions={<ShieldCheck className="size-5 text-[#d4af37]" aria-hidden="true" />}
    >
      <form onSubmit={submit} className="space-y-6">
        {template ? <input type="hidden" name="templateId" value={template.id} /> : null}
        <input type="hidden" name="stage" value={template?.stage ?? 'SERVICE_EXECUTION'} />

        {/* Stage Name Input */}
        <div>
          <label className="text-xs font-bold text-white/80 block mb-1">
            اسم المرحلة / القائمة
          </label>
          <input
            name="name"
            required
            minLength={2}
            maxLength={200}
            placeholder="مثال: تحضير الفريق وتجهيز المواد، فحص السيارة قبل البدء، تنفيذ الغسيل والفرش..."
            defaultValue={template?.name ?? ''}
            className={inputClass}
          />
        </div>

        {/* Multi-Select Target Services */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="text-xs font-bold text-[#f3e4a8]">
              الخدمات المطبق عليها هذا القالب ({selectedServiceIds.length} من {services.length} خدمة):
            </span>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedServiceIds(services.map((s) => s.id))}
                className="font-bold text-[#d4af37] hover:underline"
              >
                تحديد كافة الخدمات
              </button>
              <span className="text-white/20">|</span>
              <button
                type="button"
                onClick={() => setSelectedServiceIds([])}
                className="font-bold text-white/40 hover:underline"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {services.map((s) => {
              const isChecked = selectedServiceIds.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-xs font-bold transition-all cursor-pointer ${
                    isChecked
                      ? 'border-[#d4af37]/60 bg-[#d4af37]/15 text-white shadow-sm'
                      : 'border-white/10 bg-white/[0.02] text-white/50 hover:bg-white/[0.05]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedServiceIds((prev) => [...prev, s.id]);
                      } else {
                        setSelectedServiceIds((prev) => prev.filter((id) => id !== s.id));
                      }
                    }}
                    className="size-4 accent-[#d4af37]"
                  />
                  <span className="truncate">{s.nameAr}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="font-black text-white">بنود ومهام المرحلة</h3>
              <p className="mt-1 text-xs text-white/45">أضف المهام والخطوات التي يجب على الفنيين تنفيذها وتأكيدها.</p>
            </div>
            <button type="button" onClick={addItem} className={secondaryButtonClass}>
              <Plus className="size-4" aria-hidden="true" />
              إضافة بند مهمة
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {items.map((item, index) => (
              <article key={item.clientKey} className="rounded-2xl border border-white/8 bg-black/25 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-lg bg-white/[0.055] text-xs font-black tabular-nums text-white/45">{index + 1}</span>
                    <p className="text-sm font-black text-white/75">{item.labelAr || 'بند جديد'}</p>
                  </div>
                  <button
                    type="button"
                    disabled={items.length === 1}
                    onClick={() => setItems((current) => current.filter((candidate) => candidate.clientKey !== item.clientKey))}
                    className="rounded-lg p-2 text-red-300/65 hover:bg-red-400/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-25"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    <span className="sr-only">حذف البند</span>
                  </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px]">
                  <label className="text-[11px] font-bold text-white/45">
                    نص البند
                    <input
                      required
                      minLength={2}
                      maxLength={500}
                      value={item.labelAr}
                      onChange={(event) => updateItem(item.clientKey, { labelAr: event.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="text-[11px] font-bold text-white/45">
                    الترتيب
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={item.displayOrder}
                      onChange={(event) => updateItem(item.clientKey, { displayOrder: Number(event.target.value) })}
                      className={inputClass}
                    />
                  </label>
                </div>
                <label className="mt-3 block text-[11px] font-bold text-white/45">
                  وصف أو تعليمات إضافية
                  <input
                    maxLength={1000}
                    value={item.descriptionAr}
                    onChange={(event) => updateItem(item.clientKey, { descriptionAr: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    ['required', 'إلزامي'],
                    ['requiresNote', 'يتطلب ملاحظة'],
                    ['active', 'نشط'],
                  ].map(([field, label]) => (
                    <label key={field} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] p-2.5 text-xs font-bold text-white/55">
                      <input
                        type="checkbox"
                        checked={item[field as keyof Pick<EditableChecklistItem, 'required' | 'requiresNote' | 'active'>] as boolean}
                        onChange={(event) => updateItem(item.clientKey, { [field]: event.target.checked })}
                        className="size-4 accent-[#d4af37]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/8 pt-5 sm:flex-row sm:justify-between">
          {template ? (
            <button
              type="button"
              disabled={tools.pending}
              onClick={() => tools.requestConfirmation({
                title: 'حذف قالب ' + template.name,
                description: 'سيتم حذف تعريف القالب وبنوده. نسخ التنفيذ التاريخية للحجوزات ستبقى محفوظة.',
                action: deleteChecklistTemplateAction,
                entityId: template.id,
                confirmLabel: 'حذف القالب',
              })}
              className={dangerButtonClass}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              حذف القالب
            </button>
          ) : <span />}
          <SaveButton pending={tools.pending} label={template ? 'حفظ القائمة' : 'إنشاء القائمة'} />
        </div>
      </form>
    </Panel>
  );
}

export default function SetupCenter({ actor, branches, employees, permissions, services, inventory }: SetupCenterProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [section, setSection] = useState<SectionId>('overview');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);

  const branch = useMemo(
    () => branches.find((candidate) => candidate.id === branchId) ?? branches[0],
    [branchId, branches],
  );
  const branchEmployees = useMemo(
    () => employees.filter((employee) => branch ? employee.branchIds.includes(branch.id) : false),
    [branch, employees],
  );

  function execute(action: SetupMutation, data: FormData) {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action(data);
        if (result.error) {
          setNotice({ kind: 'error', text: result.error });
          return;
        }
        setNotice({ kind: 'success', text: result.message ?? 'تم حفظ التغييرات.' });
        router.refresh();
      } catch {
        setNotice({ kind: 'error', text: 'تعذر تنفيذ الإجراء. تحقق من صلاحية إدارة الإعدادات ثم حاول مرة أخرى.' });
      }
    });
  }

  function confirmDestructive(reason: string) {
    if (!confirmation) return;
    const request = confirmation;
    const data = new FormData();
    data.set('entityId', request.entityId);
    if (request.branchId) data.set('branchId', request.branchId);
    for (const [key, value] of Object.entries(request.additionalFields ?? {})) {
      data.set(key, value);
    }
    data.set('reason', reason.trim());
    setConfirmation(null);
    execute(request.action, data);
  }

  const navItems: Array<{
    id: SectionId;
    label: string;
    hint: string;
    icon: typeof Gauge;
  }> = [
    { id: 'branches', label: 'الفروع', hint: 'إدارة وتعديل وحذف وإضافة الفروع', icon: Building2 },
    { id: 'overview', label: 'خريطة الجاهزية', hint: 'ملخص الفرع', icon: Gauge },
    { id: 'inventory', label: 'المخزون', hint: 'خامات ومخزون سيارات التشغيل', icon: Boxes },
    { id: 'operations_management', label: 'إدارة التشغيل', hint: 'المدراء والفروع المتعددة', icon: ShieldCheck },
    { id: 'workforce', label: 'موظفو التنفيذ', hint: 'الفنيين وحسابات الفرع', icon: UserRoundCog },
    { id: 'teams', label: 'الفرق', hint: 'الأعضاء والقدرات', icon: UsersRound },
    { id: 'coverage', label: 'مناطق التغطية', hint: 'الكمبوندات والمناطق المخدومة', icon: MapPinned },
    { id: 'schedule', label: 'الوقت والسعة', hint: 'الساعات والإغلاقات', icon: CalendarClock },
    { id: 'payments', label: 'وسائل الدفع', hint: 'الحسابات والتعليمات', icon: CreditCard },
    { id: 'checklists', label: 'قوائم التنفيذ', hint: 'القوالب والبنود', icon: ClipboardCheck },
  ];

  const sectionTools: SectionTools = {
    pending,
    execute,
    requestConfirmation: setConfirmation,
  };

  let content: ReactNode;
  if (section === 'branches') {
    content = (
      <BranchesSection
        branches={branches}
        tools={sectionTools}
        onSelectBranch={(id) => {
          setBranchId(id);
          setSection('overview');
        }}
      />
    );
  } else if (!branch) {
    content = <EmptyState title="لا يوجد فرع قابل للإعداد" text="أنشئ فرعًا من إدارة النظام أولًا." />;
  } else {
    switch (section) {
      case 'inventory':
        content = inventory ? (
          <OperationsResourcesBoard
            actorRole={actor.role}
            canManageCatalog={true}
            branches={branches.map((b) => ({
              id: b.id,
              code: b.code,
              nameAr: b.nameAr,
              status: b.status,
              teams: b.teams.map((t) => ({
                id: t.id,
                name: t.name,
                members: employees
                  .filter((e) => t.memberIds.includes(e.id))
                  .map((e) => ({ id: e.id, fullName: e.fullName })),
              })),
            }))}
            materials={inventory.materials}
            services={inventory.services}
            stocks={inventory.stocks}
            employeeStocks={inventory.employeeStocks}
            employees={inventory.employees}
            vehicles={inventory.vehicles}
            bookings={inventory.bookings}
            embedded={true}
            defaultBranchId={branch.id}
          />
        ) : (
          <EmptyState title="لا توجد بيانات مخزون" text="تعذر تحميل بيانات المواد والمخزون." />
        );
        break;
      case 'operations_management':
        content = <OperationsManagementSection key={branch.id} branch={branch} allBranches={branches} employees={employees} permissions={permissions} tools={sectionTools} />;
        break;
      case 'workforce':
        content = <WorkforceSection key={branch.id} branch={branch} employees={branchEmployees} tools={sectionTools} />;
        break;
      case 'teams':
        content = <TeamsSection key={branch.id} branch={branch} employees={branchEmployees} services={services} tools={sectionTools} />;
        break;
      case 'coverage':
        content = <CoverageSection key={branch.id} branch={branch} tools={sectionTools} />;
        break;
      case 'schedule':
        content = <ScheduleSection key={branch.id} branch={branch} employees={branchEmployees} tools={sectionTools} />;
        break;
      case 'payments':
        content = <PaymentsSection key={branch.id} branch={branch} tools={sectionTools} />;
        break;
      case 'checklists':
        content = <ChecklistsSection services={services} tools={sectionTools} />;
        break;
      default:
        content = <OverviewSection branch={branch} employees={branchEmployees} services={services} inventory={inventory} tools={sectionTools} onNavigate={setSection} />;
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#070809] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-80 [background:radial-gradient(circle_at_82%_0%,rgba(212,175,55,0.12),transparent_27%),linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] [background-size:auto,36px_36px,36px_36px]" />
      <header className="relative border-b border-white/10 bg-black/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-[#d4af37]">
              <Settings2 className="size-4" aria-hidden="true" />
              Bareeq operations setup
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">مركز إعداد التشغيل</h1>
            <p className="mt-2 text-sm text-white/45">{actor.fullName} · {actor.role}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {branches.length > 1 ? (
              <label className="text-xs font-bold text-white/55">
                الفرع النشط
                <select
                  value={branch?.id ?? ''}
                  onChange={(event) => {
                    setBranchId(event.target.value);
                    setNotice(null);
                  }}
                  className={inputClass + ' min-w-64'}
                >
                  {branches.map((item) => <option key={item.id} value={item.id}>{item.nameAr} · {item.code}</option>)}
                </select>
              </label>
            ) : branch ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3">
                <p className="text-[11px] font-bold text-white/35">الفرع النشط</p>
                <p className="mt-1 text-sm font-black">{branch.nameAr} <span dir="ltr" className="text-white/35">· {branch.code}</span></p>
              </div>
            ) : null}
            <Link href="/admin" className={secondaryButtonClass}>
              العودة للوحة المالك
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto grid max-w-[1680px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[285px_minmax(0,1fr)] lg:px-8 lg:py-8">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#0d0e10]/92">
            <div className="border-b border-white/8 px-5 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/30">مسار الإعداد</p>
              <p className="mt-2 text-sm leading-6 text-white/55">كل طبقة تغذي محرك الحجز والتشغيل مباشرة.</p>
            </div>
            <nav aria-label="أقسام مركز الإعداد" className="flex gap-2 overflow-x-auto p-3 lg:flex-col lg:overflow-visible">
              {navItems.map((item, index) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      setNotice(null);
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={'group flex min-w-56 shrink-0 items-center gap-3 rounded-xl border px-3 py-3 text-right transition lg:min-w-0 ' + (
                      active
                        ? 'border-[#d4af37]/30 bg-[#d4af37]/10'
                        : 'border-transparent hover:border-white/8 hover:bg-white/[0.035]'
                    )}
                  >
                    <span className={'grid size-9 shrink-0 place-items-center rounded-lg ' + (
                      active ? 'bg-[#d4af37] text-black' : 'bg-white/[0.055] text-white/45 group-hover:text-white'
                    )}>
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={'block text-sm font-black ' + (active ? 'text-[#e7cd72]' : 'text-white/72')}>{item.label}</span>
                      <span className="mt-0.5 block text-[11px] text-white/32">{item.hint}</span>
                    </span>
                    <span className="text-[10px] tabular-nums text-white/20">{String(index + 1).padStart(2, '0')}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className="min-w-0">
          <div aria-live="polite" className="mb-4 min-h-12">
            {notice ? (
              <p
                role={notice.kind === 'error' ? 'alert' : 'status'}
                className={'rounded-xl border px-4 py-3 text-sm font-bold ' + (
                  notice.kind === 'error'
                    ? 'border-red-400/25 bg-red-400/10 text-red-200'
                    : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                )}
              >
                {notice.text}
              </p>
            ) : (
              <p className="px-1 py-3 text-xs text-white/30">التغييرات تُحفظ في قاعدة البيانات ويُسجّل كل إجراء في سجل التدقيق.</p>
            )}
          </div>
          <div className="space-y-6">{content}</div>
        </div>
      </main>

      {confirmation ? (
        <ConfirmationDialog
          request={confirmation}
          pending={pending}
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmDestructive}
        />
      ) : null}
    </div>
  );
}
