'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Boxes,
  CalendarClock,
  Check,
  ClipboardCheck,
  CreditCard,
  Gauge,
  MapPinned,
  Plus,
  Route,
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
  type ResourceBranchDto,
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
  deleteSetupZoneAction,
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
  saveSetupZoneAction,
  saveTeamWorkingHoursAction,
  saveZoneTravelTimeAction,
  type SetupActionResult,
} from '@/app/actions/setup';

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
  requiresPhoto: boolean;
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
  const branchStocksCount = inventory ? inventory.stocks.filter((s) => s.branchId === branch.id).length : 0;
  const readiness = [
    {
      label: 'المخزون والأسطول',
      value: branchStocksCount,
      suffix: 'أصناف مهيأة',
      ready: true,
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
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-4 text-xs font-black text-black hover:bg-[#e4c65f] transition-all shadow-md shadow-[#d4af37]/20"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>إضافة فرع جديد للمنظومة</span>
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

      <Panel title="قواعد المحرك الحالية" description="قيم الفرع التي تدخل مباشرة في حساب المواعيد والإسناد.">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            ['وحدة الموعد', branch.slotUnitMinutes + ' دقيقة'],
            ['نافذة الوصول', branch.arrivalWindowMinutes + ' دقيقة'],
            ['احتياطي الانتقال', branch.travelBufferMinutes + ' دقيقة'],
            ['راحة بين السلوتات', (branch.restBufferMinutes ?? 0) + ' دقيقة'],
            ['حد الحجوزات', branch.dailyBookingLimit + ' يوميًا'],
            ['نمط الإسناد', branch.assignmentMode === 'AUTOMATIC' ? 'تلقائي' : 'يدوي'],
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
        {selected ? (
          <PermissionOverridesPanel
            key={selected.id + '-permissions'}
            employee={selected}
            branches={allBranches.filter((candidate) => selected.branchIds.includes(candidate.id))}
            permissions={permissions}
            tools={tools}
          />
        ) : (
          <Panel
            title="استثناءات الصلاحيات"
            description="أنشئ الحساب أولًا، ثم أضف فقط الاستثناءات اللازمة فوق صلاحيات الدور الافتراضية."
          >
            <EmptyState title="لا يوجد حساب محدد" text="اختر فنيًا محفوظًا لإدارة استثناءات صلاحياته." />
          </Panel>
        )}
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
  const availableEmployees = employees.filter((employee) =>
    employee.role === 'EMPLOYEE' &&
    employee.active &&
    (!employee.teamId || employee.teamId === team?.id)
  );

  function toggle(values: string[], value: string, enabled: boolean, setter: (next: string[]) => void) {
    setter(enabled ? [...new Set([...values, value])] : values.filter((item) => item !== value));
    if (!enabled && value === leaderId) setLeaderId('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    const data = formDataFrom(event);
    data.set('memberIds', JSON.stringify(memberIds));
    data.set('zoneIds', JSON.stringify(zoneIds));
    data.set('serviceIds', JSON.stringify(serviceIds));
    data.set('leaderId', leaderId);
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
        <label className="block text-xs font-bold text-white/65">
          منطقة انطلاق الفريق
          <select name="baseZoneId" defaultValue={team?.baseZoneId ?? ''} className={inputClass}>
            <option value="">استخدم احتياطي الانتقال الافتراضي للفرع</option>
            {branch.zones.map((zone) => (
              <option key={zone.id} value={zone.id}>{zone.name}</option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] font-normal text-white/40">
            تُستخدم في التوزيع التلقائي عندما لا يكون للفريق حجز مجاور يحدد موقعه.
          </span>
        </label>
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
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-black">زونات التغطية</h3>
              <p className="mt-1 text-xs text-white/38">تركها فارغة يعني أن الفريق غير مقيّد بزون محدد.</p>
            </div>
            <span className="text-xs tabular-nums text-[#d4af37]">{zoneIds.length} محدد</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {branch.zones.map((zone) => (
              <ToggleChoice
                key={zone.id}
                checked={zoneIds.includes(zone.id)}
                onChange={(checked) => toggle(zoneIds, zone.id, checked, setZoneIds)}
                label={zone.name}
                hint={zone.areas.filter((area) => area.active).length + ' منطقة نشطة'}
              />
            ))}
          </div>
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
  const [selectedZoneId, setSelectedZoneId] = useState(branch.zones[0]?.id ?? 'new');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('new');
  const selectedZone = branch.zones.find((zone) => zone.id === selectedZoneId);
  const selectedArea = selectedZone?.areas.find((area) => area.id === selectedAreaId);

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[minmax(300px,0.75fr)_minmax(520px,1.25fr)]">
        <Panel
          title="زونات الفرع"
          description="الزون هو نطاق سياسات الانتقال وإسناد الفرق."
          actions={(
            <button
              type="button"
              onClick={() => {
                setSelectedZoneId('new');
                setSelectedAreaId('new');
              }}
              className={secondaryButtonClass}
            >
              <Plus className="size-4" aria-hidden="true" />
              زون جديد
            </button>
          )}
        >
          {branch.zones.length ? (
            <div className="space-y-2">
              {branch.zones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => {
                    setSelectedZoneId(zone.id);
                    setSelectedAreaId('new');
                  }}
                  className={'w-full rounded-xl border p-4 text-right transition ' + (
                    selectedZoneId === zone.id
                      ? 'border-[#d4af37]/35 bg-[#d4af37]/8'
                      : 'border-white/8 bg-black/25 hover:border-white/18'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-black text-white/85">{zone.name}</p>
                    <span className="rounded-full bg-white/[0.055] px-2 py-1 text-[11px] text-white/45">{zone.areas.length} منطقة</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/38">{zone.description || 'بدون وصف'}</p>
                </button>
              ))}
            </div>
          ) : <EmptyState title="لا توجد زونات" text="أنشئ زون التغطية الأول للفرع." />}
        </Panel>

        <div className="space-y-6">
          <ZoneEditor key={selectedZone?.id ?? 'new'} branch={branch} zone={selectedZone} tools={tools} />
          {selectedZone ? (
            <Panel
        title={'مناطق ' + selectedZone.name}
              description="المناطق النشطة فقط تظهر للعميل عند اختيار عنوان الخدمة."
              actions={(
                <button type="button" onClick={() => setSelectedAreaId('new')} className={secondaryButtonClass}>
                  <Plus className="size-4" aria-hidden="true" />
                  منطقة جديدة
                </button>
              )}
            >
              <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.65fr)_minmax(360px,1.35fr)]">
                <div className="space-y-2">
                  {selectedZone.areas.map((area) => (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() => setSelectedAreaId(area.id)}
                      className={'w-full rounded-xl border p-3 text-right transition ' + (
                        selectedAreaId === area.id
                          ? 'border-[#d4af37]/35 bg-[#d4af37]/8'
                          : 'border-white/8 bg-black/25 hover:border-white/18'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white/78">{area.compound}</span>
                        <StatusPill active={area.active} />
                      </div>
                      <p className="mt-1 text-[11px] text-white/35">{area.district} · أولوية {area.priority}</p>
                    </button>
                  ))}
                  {!selectedZone.areas.length ? <EmptyState title="الزون فارغ" text="أضف منطقة أو كمبوند." /> : null}
                </div>
                <AreaEditor
                  key={selectedArea?.id ?? 'new'}
                  branch={branch}
                  zone={selectedZone}
                  area={selectedArea}
                  tools={tools}
                />
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      <TravelMatrix branch={branch} tools={tools} />
    </>
  );
}

function ZoneEditor({
  branch,
  zone,
  tools,
}: {
  branch: SetupBranchDto;
  zone?: SetupZoneDto;
  tools: SectionTools;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    tools.execute(saveSetupZoneAction, formDataFrom(event));
  }
  const bookingCount = zone?.areas.reduce((total, area) => total + area.bookingCount, 0) ?? 0;
  return (
    <Panel
      title={zone ? 'بيانات ' + zone.name : 'إنشاء زون تغطية'}
      description="استخدم أسماء واضحة لأنها تظهر في ربط الفرق ومصفوفة الانتقال."
    >
      <form onSubmit={submit} className="space-y-4">
        {zone ? <input type="hidden" name="zoneId" value={zone.id} /> : null}
        <input type="hidden" name="branchId" value={branch.id} />
        <label className="block text-xs font-bold text-white/65">
          اسم الزون
          <input name="name" required minLength={2} maxLength={200} defaultValue={zone?.name ?? ''} className={inputClass} />
        </label>
        <label className="block text-xs font-bold text-white/65">
          الوصف
          <textarea name="description" maxLength={500} defaultValue={zone?.description ?? ''} className={textareaClass} />
        </label>
        <div className="flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:justify-between">
          {zone ? (
            <button
              type="button"
              disabled={tools.pending}
              onClick={() => tools.requestConfirmation({
                title: 'حذف زون ' + zone.name,
                description: bookingCount > 0
                  ? 'هذا الزون مرتبط بـ ' + bookingCount + ' حجز؛ سيرفض النظام الحذف حفاظًا على السجل.'
                  : 'سيتم حذف المناطق ومصفوفة الانتقال وروابط الفرق التابعة له.',
                action: deleteSetupZoneAction,
                entityId: zone.id,
                branchId: branch.id,
                confirmLabel: 'حذف الزون',
              })}
              className={dangerButtonClass}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              حذف الزون
            </button>
          ) : <span />}
          <SaveButton pending={tools.pending} label={zone ? 'حفظ الزون' : 'إنشاء الزون'} />
        </div>
      </form>
    </Panel>
  );
}

function AreaEditor({
  branch,
  zone,
  area,
  tools,
}: {
  branch: SetupBranchDto;
  zone: SetupZoneDto;
  area?: SetupAreaDto;
  tools: SectionTools;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    tools.execute(saveSetupAreaAction, formDataFrom(event));
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/8 bg-black/20 p-4">
      {area ? <input type="hidden" name="areaId" value={area.id} /> : null}
      <input type="hidden" name="zoneId" value={zone.id} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black">{area ? 'تعديل ' + area.compound : 'منطقة جديدة'}</h3>
          <p className="mt-1 text-xs text-white/35">{branch.nameAr} · {zone.name}</p>
        </div>
        {area ? <StatusPill active={area.active} /> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-white/65">
          المحافظة
          <input name="governorate" required defaultValue={area?.governorate ?? ''} placeholder="المحافظة" className={inputClass} />
        </label>
        <label className="text-xs font-bold text-white/65">
          المدينة
          <input name="city" required defaultValue={area?.city ?? ''} placeholder="المدينة" className={inputClass} />
        </label>
        <label className="text-xs font-bold text-white/65">
          الحي
          <input name="district" required defaultValue={area?.district ?? ''} className={inputClass} />
        </label>
        <label className="text-xs font-bold text-white/65">
          الكمبوند / المنطقة
          <input name="compound" required defaultValue={area?.compound ?? ''} className={inputClass} />
        </label>
        <label className="text-xs font-bold text-white/65">
          أولوية العرض
          <input name="priority" type="number" min={1} max={1000} required defaultValue={area?.priority ?? 1} className={inputClass} />
        </label>
        <label className="text-xs font-bold text-white/65">
          بديل زمن الانتقال
          <input
            name="travelBufferOverride"
            type="number"
            min={0}
            max={180}
            placeholder="استخدم افتراضي الفرع"
            defaultValue={area?.travelBufferOverride ?? ''}
            className={inputClass}
          />
        </label>
      </div>
      <BooleanField name="active" label="متاحة للحجز" defaultChecked={area?.active ?? true} />
      <div className="flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:justify-between">
        {area ? (
          <button
            type="button"
            disabled={tools.pending}
            onClick={() => tools.requestConfirmation({
              title: 'حذف منطقة ' + area.compound,
              description: area.bookingCount > 0
                ? 'المنطقة مرتبطة بـ ' + area.bookingCount + ' حجز؛ عطّلها بدل الحذف.'
                : 'سيتم حذف المنطقة نهائيًا من نطاق التغطية.',
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
        <SaveButton pending={tools.pending} label={area ? 'حفظ المنطقة' : 'إضافة المنطقة'} />
      </div>
    </form>
  );
}

function TravelMatrix({ branch, tools }: { branch: SetupBranchDto; tools: SectionTools }) {
  const travelMap = useMemo(
    () => new Map(branch.travelTimes.map((travel) => [
      travel.fromZoneId + ':' + travel.toZoneId,
      travel.durationMinutes,
    ])),
    [branch.travelTimes],
  );
  return (
    <Panel
      title="مصفوفة زمن الانتقال"
      description="القيم اتجاهية: زمن A ← B قد يختلف عن B ← A. وجود قيمة داخل نفس الزون يمثل سياسة صريحة."
      actions={<Route className="size-5 text-[#d4af37]" aria-hidden="true" />}
    >
      {branch.zones.length ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[720px] w-full border-collapse text-sm">
            <thead className="bg-white/[0.035] text-white/45">
              <tr>
                <th className="border-b border-l border-white/8 p-3 text-right">من ↓ / إلى ←</th>
                {branch.zones.map((zone) => <th key={zone.id} className="border-b border-l border-white/8 p-3 text-center">{zone.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {branch.zones.map((fromZone) => (
                <tr key={fromZone.id}>
                  <th className="border-b border-l border-white/8 bg-white/[0.02] p-3 text-right font-bold text-white/70">{fromZone.name}</th>
                  {branch.zones.map((toZone) => {
                    const key = fromZone.id + ':' + toZone.id;
                    const explicit = travelMap.get(key);
                    const fallback = fromZone.id === toZone.id ? 0 : branch.travelBufferMinutes;
                    return (
                      <td key={toZone.id} className="border-b border-l border-white/8 p-2">
                        <form
                          onSubmit={(event) => tools.execute(saveZoneTravelTimeAction, formDataFrom(event))}
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="branchId" value={branch.id} />
                          <input type="hidden" name="fromZoneId" value={fromZone.id} />
                          <input type="hidden" name="toZoneId" value={toZone.id} />
                          <label className="sr-only">دقائق من {fromZone.name} إلى {toZone.name}</label>
                          <input
                            name="durationMinutes"
                            type="number"
                            min={0}
                            max={180}
                            required
                            defaultValue={explicit ?? fallback}
                            className="min-h-10 w-20 rounded-lg border border-white/10 bg-black/40 px-2 text-center tabular-nums outline-none focus:border-[#d4af37]"
                          />
                          <button type="submit" disabled={tools.pending} className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/10 text-white/45 hover:border-[#d4af37]/30 hover:text-[#d4af37] focus-visible:ring-2 focus-visible:ring-[#d4af37] disabled:opacity-40">
                            <Save className="size-4" aria-hidden="true" />
                            <span className="sr-only">حفظ زمن الانتقال</span>
                          </button>
                        </form>
                        <p className="mt-1 text-center text-[9px] text-white/25">{explicit === undefined ? 'افتراضي' : 'سياسة محفوظة'}</p>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="المصفوفة غير متاحة" text="أنشئ زونًا واحدًا على الأقل." />}
    </Panel>
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
        title="قواعد السعة والإسناد"
        description="هذه القيم تدخل في توليد المواعيد، النوافذ الزمنية، وحد الفرع اليومي."
        actions={<Gauge className="size-5 text-[#d4af37]" aria-hidden="true" />}
      >
        <form
          onSubmit={(event) => tools.execute(saveBranchOperationsConfigAction, formDataFrom(event))}
          className="space-y-5"
        >
          <input type="hidden" name="branchId" value={branch.id} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-bold text-white/65">
              وحدة الموعد بالدقائق
              <input name="slotUnitMinutes" type="number" min={15} max={240} required defaultValue={branch.slotUnitMinutes} className={inputClass} />
            </label>
            <label className="text-xs font-bold text-white/65">
              نافذة الوصول
              <input name="arrivalWindowMinutes" type="number" min={0} max={180} required defaultValue={branch.arrivalWindowMinutes} className={inputClass} />
            </label>
            <label className="text-xs font-bold text-white/65">
              احتياطي الانتقال (بين المناطق)
              <input name="travelBufferMinutes" type="number" min={0} max={180} required defaultValue={branch.travelBufferMinutes} className={inputClass} />
            </label>
            <label className="text-xs font-bold text-white/65">
              وقت البريك بين السلوتات (بالدقائق)
              <input
                name="restBufferMinutes"
                type="number"
                min={0}
                max={180}
                required
                defaultValue={branch.restBufferMinutes ?? 0}
                className={inputClass}
                placeholder="0 = بدون بريك، 15 = ربع ساعة، 60 = سلوت كامل"
              />
            </label>
            <label className="text-xs font-bold text-white/65">
              الحد اليومي
              <input name="dailyBookingLimit" type="number" min={1} max={500} required defaultValue={branch.dailyBookingLimit} className={inputClass} />
            </label>
            <label className="text-xs font-bold text-white/65">
              نمط الإسناد
              <select name="assignmentMode" defaultValue={branch.assignmentMode} className={inputClass}>
                <option value="AUTOMATIC">تلقائي حسب المحرك</option>
                <option value="MANUAL">يدوي من التشغيل</option>
              </select>
            </label>
          </div>
          <div className="rounded-xl border border-[#cea355]/20 bg-[#cea355]/[0.04] p-4 text-xs leading-5 text-white/70 space-y-1.5">
            <p className="font-bold text-[#edce8b]">تخصيص وقت البريك والراحة بين كل سلوت وآخر (Rest Buffer):</p>
            <p className="text-white/65">
              يمكنك تحديد وقت فاصل (بريك) بين السلوتات والحجوزات المتتالية لنفس الفريق:
            </p>
            <ul className="list-disc list-inside space-y-1 text-white/55 text-[11px] pr-2">
              <li><strong className="text-white">0 دقيقة:</strong> بدون أي بريك (حجوزات متتالية مباشرة).</li>
              <li><strong className="text-white">15 دقيقة:</strong> بريك ربع ساعة بين كل موعد والآخر لفريق العمل.</li>
              <li><strong className="text-white">30 دقيقة:</strong> بريك نصف ساعة راحة وتجهيز.</li>
              <li><strong className="text-white">60 دقيقة:</strong> ترك سلوت كامل فاضي (ساعة كاملة) بين كل حجزين.</li>
              <li>أو يمكنك كتابة أي عدد دقائق مخصص (حتى 180 دقيقة).</li>
            </ul>
          </div>
          <div className="flex justify-end border-t border-white/8 pt-5">
            <SaveButton pending={tools.pending} label="حفظ قواعد المحرك" />
          </div>
        </form>
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
                />
              );
            })}
          </div>
        ) : <EmptyState title="لا توجد فرق" text="أنشئ فريقًا أولًا لضبط ساعاته." />}
      </Panel>

      <BlackoutsPanel branch={branch} tools={tools} />

      <div className="grid gap-6 2xl:grid-cols-2">
        <TimeOffPanel
          branch={branch}
          subjectType="TEAM"
          subjects={branch.teams.map((team) => ({ id: team.id, name: team.name, timeOff: team.timeOff }))}
          tools={tools}
        />
        <TimeOffPanel
          branch={branch}
          subjectType="EMPLOYEE"
          subjects={employees.map((employee) => ({ id: employee.id, name: employee.fullName, timeOff: employee.timeOff }))}
          tools={tools}
        />
      </div>
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
}) {
  return (
    <form
      onSubmit={(event) => tools.execute(action, formDataFrom(event))}
      className="rounded-2xl border border-white/8 bg-black/25 p-4"
    >
      <input type="hidden" name={hiddenName} value={hiddenValue} />
      <input type="hidden" name="dayOfWeek" value={day.value} />
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-black text-white/82">{day.label}</h3>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-white/50">
          <input
            type="checkbox"
            name={disabledName}
            value="true"
            defaultChecked={hours?.disabled ?? false}
            className="size-4 accent-red-400"
          />
          <input type="hidden" name={disabledName} value="false" />
          {disabledLabel}
        </label>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-[11px] font-bold text-white/45">
          الفتح
          <input name="openTime" type="time" required defaultValue={hours?.openTime ?? '09:00'} className={inputClass} />
        </label>
        <label className="text-[11px] font-bold text-white/45">
          الإغلاق
          <input name="closeTime" type="time" required defaultValue={hours?.closeTime ?? '16:00'} className={inputClass} />
        </label>
        <label className="text-[11px] font-bold text-white/45">
          بداية الاستراحة
          <input name="breakStartTime" type="time" defaultValue={hours?.breakStartTime ?? ''} className={inputClass} />
        </label>
        <label className="text-[11px] font-bold text-white/45">
          نهاية الاستراحة
          <input name="breakEndTime" type="time" defaultValue={hours?.breakEndTime ?? ''} className={inputClass} />
        </label>
      </div>
      <button type="submit" disabled={tools.pending} className={secondaryButtonClass + ' mt-4 w-full'}>
        <Save className="size-4" aria-hidden="true" />
        حفظ {day.label}
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
  requiresPhoto: boolean;
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

  if (!service) {
    return <EmptyState title="لا توجد خدمات" text="أنشئ خدمة من كتالوج الخدمات قبل بناء قوائم التنفيذ." />;
  }

  return (
    <>
      <Panel
        title="الخدمة المستهدفة"
        description="قوائم التنفيذ عامة للخدمة وتُستخدم في كل الفروع القادرة على تنفيذها."
        actions={(
          <label className="text-xs font-bold text-white/55">
            الخدمة
            <select
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);
                setTemplateId('new');
              }}
              className={inputClass + ' min-w-72'}
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
            قالب جديد
          </button>
          {service.checklistTemplates.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTemplateId(item.id)}
              className={(templateId === item.id ? primaryButtonClass : secondaryButtonClass)}
            >
              {STAGES.find((stage) => stage.value === item.stage)?.label ?? item.stage}
              <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px]">{item.items.length}</span>
            </button>
          ))}
        </div>
      </Panel>

      <ChecklistEditor
        key={template?.id ?? 'new-' + service.id}
        service={service}
        template={template}
        tools={tools}
      />
    </>
  );
}

function ChecklistEditor({
  service,
  template,
  tools,
}: {
  service: SetupServiceDto;
  template?: SetupChecklistTemplateDto;
  tools: SectionTools;
}) {
  const sequence = useRef(template?.items.length ?? 1);
  const [items, setItems] = useState<EditableChecklistItem[]>(() => template
    ? template.items.map((item) => ({
        clientKey: item.id,
        id: item.id,
        labelAr: item.labelAr,
        descriptionAr: item.descriptionAr ?? '',
        required: item.required,
        requiresPhoto: item.requiresPhoto,
        requiresNote: item.requiresNote,
        displayOrder: item.displayOrder,
        active: item.active,
      }))
    : [{
        clientKey: 'new-0',
        labelAr: '',
        descriptionAr: '',
        required: true,
        requiresPhoto: false,
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
        requiresPhoto: false,
        requiresNote: false,
        displayOrder: current.length + 1,
        active: true,
      },
    ]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    const data = formDataFrom(event);
    data.set('items', JSON.stringify(items.map((item) => ({
      id: item.id,
      labelAr: item.labelAr,
      descriptionAr: item.descriptionAr,
      required: item.required,
      requiresPhoto: item.requiresPhoto,
      requiresNote: item.requiresNote,
      displayOrder: item.displayOrder,
      active: item.active,
    }))));
    tools.execute(saveChecklistTemplateAction, data);
  }

  return (
    <Panel
      title={template ? 'تحرير ' + template.name : 'قالب جديد لـ ' + service.nameAr}
      description="رتّب البنود حسب تسلسل التنفيذ، وحدد الأدلة المطلوبة لكل خطوة."
      actions={<ShieldCheck className="size-5 text-[#d4af37]" aria-hidden="true" />}
    >
      <form onSubmit={submit} className="space-y-6">
        {template ? <input type="hidden" name="templateId" value={template.id} /> : null}
        <input type="hidden" name="serviceId" value={service.id} />
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <label className="text-xs font-bold text-white/65">
            المرحلة
            <select name="stage" defaultValue={template?.stage ?? 'TEAM_PREPARATION'} className={inputClass}>
              {STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-white/65">
            اسم القائمة
            <input name="name" required minLength={2} maxLength={200} defaultValue={template?.name ?? ''} className={inputClass} />
          </label>
        </div>

        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="font-black">بنود القائمة</h3>
              <p className="mt-1 text-xs text-white/38">كل بند محفوظ كوحدة مستقلة ويمكنه طلب صورة أو ملاحظة.</p>
            </div>
            <button type="button" onClick={addItem} className={secondaryButtonClass}>
              <Plus className="size-4" aria-hidden="true" />
              إضافة بند
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
    { id: 'overview', label: 'خريطة الجاهزية', hint: 'ملخص الفرع', icon: Gauge },
    { id: 'inventory', label: 'المخزون', hint: 'الخامات والمواد والأسطول', icon: Boxes },
    { id: 'operations_management', label: 'إدارة التشغيل', hint: 'المدراء والفروع المتعددة', icon: ShieldCheck },
    { id: 'workforce', label: 'موظفو التنفيذ', hint: 'الفنيين وحسابات الفرع', icon: UserRoundCog },
    { id: 'teams', label: 'الفرق', hint: 'الأعضاء والقدرات', icon: UsersRound },
    { id: 'coverage', label: 'التغطية والتنقل', hint: 'الزونات والمصفوفة', icon: MapPinned },
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
  if (!branch) {
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
        content = <WorkforceSection key={branch.id} branch={branch} allBranches={branches} employees={branchEmployees} permissions={permissions} tools={sectionTools} />;
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
            <Link
              href="/admin/branches"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#e5c45a] to-[#d4af37] px-4 py-2 text-xs font-black text-black shadow-md shadow-[#d4af37]/20 hover:brightness-110 transition-all"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>إضافة فرع جديد</span>
            </Link>
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
