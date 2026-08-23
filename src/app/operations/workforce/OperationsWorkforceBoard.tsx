'use client';

import {
  ArrowRight,
  CalendarClock,
  Clock3,
  Home,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  User,
  UserRoundCog,
  UsersRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  deactivateOperationsEmployeeAction,
  deactivateOperationsTeamAction,
  deleteOperationsTimeOffAction,
  saveOperationsEmployeeAction,
  saveOperationsTeamAction,
  saveOperationsTeamHoursAction,
  saveOperationsTimeOffAction,
  type OperationsWorkforceActionResult,
} from '@/app/actions/operations-workforce';

type WorkforceRoleCode = 'OPERATIONS_MANAGER' | 'EMPLOYEE';
type ActorRoleCode = 'OPERATIONS_MANAGER' | 'OWNER' | 'SYSTEM_SUPER_ADMIN';
type SectionId = 'employees' | 'teams' | 'availability';
type TimeOffSubjectType = 'TEAM' | 'EMPLOYEE';

const roleArabicNames: Record<string, string> = {
  OPERATIONS_MANAGER: 'مدير التشغيل',
  OWNER: 'المالك',
  SYSTEM_SUPER_ADMIN: 'مدير النظام',
  EMPLOYEE: 'موظف تنفيذ',
  CUSTOMER: 'عميل',
};

interface TimeOffDto {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
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

interface BranchHoursDto {
  dayOfWeek: number;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
  breakStartTime: string | null;
  breakEndTime: string | null;
}

interface OperationsWorkforceTeamDto {
  id: string;
  name: string;
  leaderId: string | null;
  baseZoneId: string | null;
  dailyCapacity: number;
  active: boolean;
  assignmentPriority: number;
  memberIds: string[];
  serviceIds: string[];
  zoneIds: string[];
  workingHours: TeamHoursDto[];
  timeOff: TimeOffDto[];
}

export interface OperationsWorkforceBranchDto {
  id: string;
  code: string;
  nameAr: string;
  status: string;
  timezone: string;
  workingHours: BranchHoursDto[];
  zones: Array<{ id: string; name: string }>;
  teams: OperationsWorkforceTeamDto[];
}

export interface OperationsWorkforceEmployeeDto {
  id: string;
  fullName: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  role: WorkforceRoleCode;
  active: boolean;
  branchIds: string[];
  teamId: string | null;
  timeOff: TimeOffDto[];
}

export interface OperationsWorkforceServiceDto {
  id: string;
  nameAr: string;
}

interface OperationsWorkforceBoardProps {
  actor: { fullName: string; role: ActorRoleCode };
  branches: OperationsWorkforceBranchDto[];
  employees: OperationsWorkforceEmployeeDto[];
  employeeManagementBranchIds: string[];
  services: OperationsWorkforceServiceDto[];
}

type WorkforceMutation = (formData: FormData) => Promise<OperationsWorkforceActionResult>;

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

interface ConfirmationRequest {
  title: string;
  description: string;
  action: WorkforceMutation;
  entityId: string;
  branchId: string;
  additionalFields?: Record<string, string>;
  confirmLabel?: string;
}

interface SectionTools {
  pending: boolean;
  execute: (action: WorkforceMutation, formData: FormData) => void;
  requestConfirmation: (request: ConfirmationRequest) => void;
}

const inputClass = 'mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/45 px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:cursor-not-allowed disabled:opacity-45';
const textareaClass = inputClass + ' min-h-24 py-3 leading-6';
const primaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-4 text-sm font-black text-black transition hover:bg-[#e5c65d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d978] disabled:cursor-not-allowed disabled:opacity-50';
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
    <section className="rounded-[1.6rem] border border-white/9 bg-[#0d0e10]/95 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)] sm:p-6">
      <div className="mb-5 flex flex-col gap-3 border-b border-white/8 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-white">{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-white/42">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
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

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ' + (
      active ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/[0.06] text-white/40'
    )}>
      <span className={'size-1.5 rounded-full ' + (active ? 'bg-emerald-300' : 'bg-white/25')} />
      {active ? 'نشط' : 'متوقف'}
    </span>
  );
}

function formDataFrom(event: FormEvent<HTMLFormElement>): FormData {
  event.preventDefault();
  return new FormData(event.currentTarget);
}

function SaveButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass}>
      <Save className="size-4" aria-hidden="true" />
      {pending ? 'جارٍ الحفظ…' : label}
    </button>
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/82 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="workforce-confirm-title" className="w-full max-w-lg rounded-3xl border border-red-400/25 bg-[#101113] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">إجراء يحتاج تأكيدًا</p>
            <h2 id="workforce-confirm-title" className="mt-2 text-xl font-black">{request.title}</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={pending} className="rounded-lg p-2 text-white/45 hover:bg-white/8 hover:text-white">
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">إغلاق</span>
          </button>
        </div>
        <p className="mt-4 text-sm leading-7 text-white/55">{request.description}</p>
        <label className="mt-5 block text-xs font-bold text-white/70">
          سبب الإجراء
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={500} autoFocus className={textareaClass} placeholder="سبب واضح يظهر في سجل التدقيق" />
        </label>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={pending} className={secondaryButtonClass}>رجوع</button>
          <button type="button" onClick={() => onConfirm(reason)} disabled={pending || reason.trim().length < 5} className={dangerButtonClass}>
            <Trash2 className="size-4" aria-hidden="true" />
            {request.confirmLabel ?? 'تأكيد الإجراء'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmployeeSection({
  branch,
  branches,
  employees,
  actorRole,
  tools,
}: {
  branch: OperationsWorkforceBranchDto;
  branches: OperationsWorkforceBranchDto[];
  employees: OperationsWorkforceEmployeeDto[];
  actorRole: ActorRoleCode;
  tools: SectionTools;
}) {
  const [selectedId, setSelectedId] = useState('new');
  const selected = employees.find((employee) => employee.id === selectedId);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.72fr)_minmax(500px,1.28fr)]">
      <Panel
        title="وردية الموظفين"
        description={employees.length + ' حسابًا داخل ' + branch.nameAr}
        actions={(
          <button type="button" onClick={() => setSelectedId('new')} className={secondaryButtonClass}>
            <Plus className="size-4" aria-hidden="true" />
            حساب جديد
          </button>
        )}
      >
        {employees.length ? (
          <div className="space-y-2">
            {employees.map((employee) => (
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
                  <div className="min-w-0">
                    <p className="truncate font-black text-white/85">{employee.fullName}</p>
                    <p dir="ltr" className="mt-1 text-left text-xs text-white/40">{employee.phone}</p>
                  </div>
                  <StatusPill active={employee.active} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/42">
                  <span className="rounded-full bg-white/[0.055] px-2 py-1">
                    {employee.role === 'OPERATIONS_MANAGER' ? 'مدير تشغيل' : 'موظف تنفيذ'}
                  </span>
                  <span className="rounded-full bg-white/[0.055] px-2 py-1">
                    {employee.teamId ? 'مرتبط بفريق' : 'دون فريق'}
                  </span>
                  {employee.role === 'OPERATIONS_MANAGER' && employee.branchIds.length > 1 && (
                    <span className="rounded-full bg-[#d4af37]/15 text-[#f0d879] border border-[#d4af37]/30 px-2 py-1">
                      {employee.branchIds.length} فروع
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : <EmptyState title="لا يوجد موظفون" text="أنشئ أول حساب Employee للفرع ثم ضمه إلى فريق." />}
      </Panel>

      <EmployeeForm
        key={selected?.id ?? 'new'}
        branch={branch}
        branches={branches}
        employee={selected}
        actorRole={actorRole}
        tools={tools}
      />
    </div>
  );
}

function EmployeeForm({
  branch,
  branches,
  employee,
  actorRole,
  tools,
}: {
  branch: OperationsWorkforceBranchDto;
  branches: OperationsWorkforceBranchDto[];
  employee?: OperationsWorkforceEmployeeDto;
  actorRole: ActorRoleCode;
  tools: SectionTools;
}) {
  const canManageManagers = actorRole !== 'OPERATIONS_MANAGER';
  const [role, setRole] = useState<'EMPLOYEE' | 'OPERATIONS_MANAGER'>(employee?.role ?? 'EMPLOYEE');

  return (
    <Panel
      title={employee ? 'تعديل حساب ' + employee.fullName : 'إنشاء حساب للقوى العاملة'}
      description={canManageManagers
        ? 'يمكن للمالك والنظام تحديد موظف تنفيذ أو مدير تشغيل وإسناد أكثر من فرع للمدير.'
        : 'هذه المساحة تتيح لمدير التشغيل إدارة حسابات موظفي التنفيذ فقط.'}
    >
      <form onSubmit={(event) => tools.execute(saveOperationsEmployeeAction, formDataFrom(event))} className="space-y-5">
        {employee ? <input type="hidden" name="employeeId" value={employee.id} /> : null}
        <input type="hidden" name="branchId" value={branch.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-white/65">
            الاسم الكامل
            <input name="fullName" required minLength={2} maxLength={100} defaultValue={employee?.fullName ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            الدور
            {canManageManagers ? (
              <select
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'EMPLOYEE' | 'OPERATIONS_MANAGER')}
                className={inputClass}
              >
                <option value="EMPLOYEE">موظف تنفيذ</option>
                <option value="OPERATIONS_MANAGER">مدير تشغيل</option>
              </select>
            ) : (
              <>
                <input type="hidden" name="role" value="EMPLOYEE" />
                <div className={inputClass + ' flex items-center text-white/55'}>Employee — موظف تنفيذ</div>
              </>
            )}
          </label>
          <label className="text-xs font-bold text-white/65">
            الهاتف
            <input name="phone" dir="ltr" required minLength={8} maxLength={20} defaultValue={employee?.phone ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            واتساب
            <input name="whatsapp" dir="ltr" maxLength={20} defaultValue={employee?.whatsapp ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            البريد الإلكتروني
            <input name="email" type="email" dir="ltr" defaultValue={employee?.email ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/65">
            {employee ? 'كلمة مرور مؤقتة جديدة' : 'كلمة المرور المؤقتة'}
            <input name="temporaryPassword" type="password" required={!employee} minLength={employee ? undefined : 12} maxLength={128} autoComplete="new-password" className={inputClass} />
          </label>
        </div>

        {canManageManagers && role === 'OPERATIONS_MANAGER' && branches.length > 1 && (
          <div className="rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/[0.05] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-[#f0d879]">الفروع المسموح لمدير التشغيل بإدارتها</p>
                <p className="mt-0.5 text-[11px] text-white/50">
                  حدد الفروع التي يمتلك هذا المدير صلاحية الإشراف عليها ومتابعة حجوزاتها وفرقها:
                </p>
              </div>
              <span className="rounded-md bg-[#d4af37]/20 border border-[#d4af37]/40 px-2 py-0.5 text-[10px] font-bold text-[#f0d879]">
                إدارة متعددة الفروع
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {branches.map((b) => {
                const isChecked = employee ? employee.branchIds.includes(b.id) : b.id === branch.id;
                return (
                  <label
                    key={b.id}
                    className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-xs font-bold text-white/90 hover:bg-black/60 hover:border-[#d4af37]/40 transition cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      name="branchIds"
                      value={b.id}
                      defaultChecked={isChecked}
                      className="size-4 rounded accent-[#d4af37]"
                    />
                    <span>{b.nameAr}</span>
                    <span className="text-[10px] font-mono text-white/40">({b.code})</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/75">
          <input type="checkbox" name="active" value="true" defaultChecked={employee?.active ?? true} className="mt-0.5 size-4 accent-[#d4af37]" />
          <input type="hidden" name="active" value="false" />
          <span><span className="block font-bold text-white/85">الحساب نشط</span><span className="mt-1 block text-xs text-white/40">إيقافه ينهي وصوله ويفك ارتباطه من فريق التنفيذ.</span></span>
        </label>
        <div className="flex flex-col gap-3 border-t border-white/8 pt-5 sm:flex-row sm:justify-between">
          {employee?.active ? (
            <button
              type="button"
              disabled={tools.pending}
              onClick={() => tools.requestConfirmation({
                title: 'تعطيل حساب ' + employee.fullName,
                description: 'ستنتهي جلساته الحالية ويُفك ارتباطه من فريق التنفيذ مع الاحتفاظ بسجل أعماله.',
                action: deactivateOperationsEmployeeAction,
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

function TeamSection({
  branch,
  employees,
  services,
  tools,
}: {
  branch: OperationsWorkforceBranchDto;
  employees: OperationsWorkforceEmployeeDto[];
  services: OperationsWorkforceServiceDto[];
  tools: SectionTools;
}) {
  const [selectedId, setSelectedId] = useState('new');
  const selected = branch.teams.find((team) => team.id === selectedId);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.7fr)_minmax(560px,1.3fr)]">
      <Panel
        title="تشكيل الفرق"
        description="الأولوية الأقل تُفاضل أولًا عند تساوي بقية عوامل الإسناد."
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
                  selectedId === team.id ? 'border-[#d4af37]/35 bg-[#d4af37]/8' : 'border-white/8 bg-black/25 hover:border-white/18'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-white/85">{team.name}</p>
                    <p className="mt-1 text-xs text-white/38">{team.memberIds.length} أعضاء · {team.serviceIds.length} قدرات · {team.zoneIds.length} زونات</p>
                  </div>
                  <StatusPill active={team.active} />
                </div>
              </button>
            ))}
          </div>
        ) : <EmptyState title="لا توجد فرق" text="أنشئ فريقًا واربطه بموظفين وخدمات وزونات موجودة." />}
      </Panel>

      <TeamForm key={selected?.id ?? 'new'} branch={branch} team={selected} employees={employees} services={services} tools={tools} />
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
  branch: OperationsWorkforceBranchDto;
  team?: OperationsWorkforceTeamDto;
  employees: OperationsWorkforceEmployeeDto[];
  services: OperationsWorkforceServiceDto[];
  tools: SectionTools;
}) {
  const eligibleEmployees = employees.filter((employee) => employee.role === 'EMPLOYEE' && employee.active);
  const [memberIds, setMemberIds] = useState<string[]>(team?.memberIds ?? []);
  const [zoneIds, setZoneIds] = useState<string[]>(team?.zoneIds ?? []);
  const [serviceIds, setServiceIds] = useState<string[]>(team?.serviceIds ?? []);
  const [leaderId, setLeaderId] = useState(team?.leaderId ?? '');

  function toggle(values: string[], id: string, checked: boolean, setter: (next: string[]) => void) {
    setter(checked ? [...values, id] : values.filter((value) => value !== id));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    const data = formDataFrom(event);
    data.set('memberIds', JSON.stringify(memberIds));
    data.set('zoneIds', JSON.stringify(zoneIds));
    data.set('serviceIds', JSON.stringify(serviceIds));
    data.set('leaderId', leaderId);
    tools.execute(saveOperationsTeamAction, data);
  }

  return (
    <Panel
      title={team ? 'تعديل فريق ' + team.name : 'إنشاء فريق تشغيل'}
      description="مدير التشغيل يغيّر تشكيل الفريق ونطاقه فقط؛ إعدادات الفرع والتغطية نفسها تظل بيد المالك."
    >
      <form onSubmit={submit} className="space-y-6">
        {team ? <input type="hidden" name="teamId" value={team.id} /> : null}
        <input type="hidden" name="branchId" value={branch.id} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold text-white/65 xl:col-span-2">
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

        <div>
          <p className="text-sm font-black text-white/75">أعضاء التنفيذ</p>
          <p className="mt-1 text-xs text-white/35">لا يمكن أن يكون الموظف عضوًا في أكثر من فريق.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {eligibleEmployees.map((employee) => {
              const assignedElsewhere = Boolean(employee.teamId && employee.teamId !== team?.id);
              return (
                <label key={employee.id} className={'flex items-center gap-3 rounded-xl border p-3 ' + (assignedElsewhere ? 'border-white/5 opacity-45' : 'border-white/9 bg-black/25')}>
                  <input
                    type="checkbox"
                    checked={memberIds.includes(employee.id)}
                    disabled={assignedElsewhere}
                    onChange={(event) => {
                      toggle(memberIds, employee.id, event.target.checked, setMemberIds);
                      if (!event.target.checked && leaderId === employee.id) setLeaderId('');
                    }}
                    className="size-4 accent-[#d4af37]"
                  />
                  <span className="min-w-0"><span className="block truncate text-sm font-bold text-white/75">{employee.fullName}</span><span className="mt-0.5 block text-[10px] text-white/32">{assignedElsewhere ? 'مرتبط بفريق آخر' : employee.phone}</span></span>
                </label>
              );
            })}
          </div>
          {!eligibleEmployees.length ? <div className="mt-3"><EmptyState title="لا يوجد موظفون مؤهلون" text="أضف حسابات Employee نشطة إلى الفرع أولًا." /></div> : null}
        </div>

        <label className="block text-xs font-bold text-white/65">
          قائد الفريق
          <select value={leaderId} onChange={(event) => setLeaderId(event.target.value)} className={inputClass}>
            <option value="">دون قائد محدد</option>
            {eligibleEmployees.filter((employee) => memberIds.includes(employee.id)).map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.fullName}</option>
            ))}
          </select>
        </label>

        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="text-sm font-black text-white/75">الخدمات التي ينفذها الفريق</p>
            <div className="mt-3 grid gap-2">
              {services.map((service) => (
                <label key={service.id} className="flex items-center gap-3 rounded-xl border border-white/9 bg-black/25 p-3">
                  <input type="checkbox" checked={serviceIds.includes(service.id)} onChange={(event) => toggle(serviceIds, service.id, event.target.checked, setServiceIds)} className="size-4 accent-[#d4af37]" />
                  <span className="text-sm font-bold text-white/72">{service.nameAr}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-black text-white/75">مناطق وزونات التغطية (يمكنك تحديد أكثر من منطقة)</p>
            <div className="mt-3 grid gap-2">
              {branch.zones.map((zone) => (
                <label key={zone.id} className="flex items-center gap-3 rounded-xl border border-white/9 bg-black/25 p-3">
                  <input type="checkbox" checked={zoneIds.includes(zone.id)} onChange={(event) => toggle(zoneIds, zone.id, event.target.checked, setZoneIds)} className="size-4 accent-[#d4af37]" />
                  <span className="text-sm font-bold text-white/72">{zone.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/75">
          <input type="checkbox" name="active" value="true" defaultChecked={team?.active ?? true} className="mt-0.5 size-4 accent-[#d4af37]" />
          <input type="hidden" name="active" value="false" />
          <span><span className="block font-bold text-white/85">الفريق نشط</span><span className="mt-1 block text-xs text-white/40">الفريق المتوقف لا يدخل في الإسناد أو توليد الإتاحة.</span></span>
        </label>

        <div className="flex flex-col gap-3 border-t border-white/8 pt-5 sm:flex-row sm:justify-between">
          {team?.active ? (
            <button
              type="button"
              disabled={tools.pending}
              onClick={() => tools.requestConfirmation({
                title: 'إيقاف فريق ' + team.name,
                description: 'لن يدخل الفريق في الإسناد الجديد، مع بقاء سجل حجوزاته وبياناته.',
                action: deactivateOperationsTeamAction,
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
          <SaveButton pending={tools.pending} label={team ? 'حفظ الفريق' : 'إنشاء الفريق'} />
        </div>
      </form>
    </Panel>
  );
}

function AvailabilitySection({
  branch,
  employees,
  tools,
}: {
  branch: OperationsWorkforceBranchDto;
  employees: OperationsWorkforceEmployeeDto[];
  tools: SectionTools;
}) {
  const [teamId, setTeamId] = useState(branch.teams[0]?.id ?? '');
  const team = branch.teams.find((candidate) => candidate.id === teamId) ?? branch.teams[0];
  return (
    <>
      <Panel
        title="ساعات الفريق والاستراحات"
        description="عدّل ساعات كل يوم داخل حدود دوام الفرع؛ يوم الإجازة يستبعد الفريق بالكامل."
        actions={branch.teams.length ? (
          <label className="text-xs font-bold text-white/55">
            الفريق
            <select value={team?.id ?? ''} onChange={(event) => setTeamId(event.target.value)} className={inputClass + ' min-w-56'}>
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
                  teamId={team.id}
                  day={day}
                  hours={hours ? {
                    isOff: hours.isOff,
                    openTime: hours.openTime,
                    closeTime: hours.closeTime,
                    breakStartTime: hours.breakStartTime,
                    breakEndTime: hours.breakEndTime,
                  } : {
                    isOff: branchHours?.isClosed ?? false,
                    openTime: branchHours?.openTime ?? '09:00',
                    closeTime: branchHours?.closeTime ?? '16:00',
                    breakStartTime: branchHours?.breakStartTime ?? null,
                    breakEndTime: branchHours?.breakEndTime ?? null,
                  }}
                  tools={tools}
                />
              );
            })}
          </div>
        ) : <EmptyState title="لا توجد فرق" text="أنشئ فريقًا أولًا لضبط ساعات عمله." />}
      </Panel>

      <div className="grid gap-6 2xl:grid-cols-2">
        <TimeOffPanel
          branch={branch}
          subjectType="TEAM"
          subjects={branch.teams.map((item) => ({ id: item.id, name: item.name, timeOff: item.timeOff }))}
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
  teamId,
  day,
  hours,
  tools,
}: {
  teamId: string;
  day: { value: number; label: string };
  hours: {
    isOff: boolean;
    openTime: string;
    closeTime: string;
    breakStartTime: string | null;
    breakEndTime: string | null;
  };
  tools: SectionTools;
}) {
  return (
    <form onSubmit={(event) => tools.execute(saveOperationsTeamHoursAction, formDataFrom(event))} className="rounded-2xl border border-white/8 bg-black/25 p-4">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="dayOfWeek" value={day.value} />
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-black text-white/82">{day.label}</h3>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-white/50">
          <input type="checkbox" name="isOff" value="true" defaultChecked={hours.isOff} className="size-4 accent-red-400" />
          <input type="hidden" name="isOff" value="false" />
          إجازة للفريق
        </label>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-[11px] font-bold text-white/45">الفتح<input name="openTime" type="time" required defaultValue={hours.openTime} className={inputClass} /></label>
        <label className="text-[11px] font-bold text-white/45">الإغلاق<input name="closeTime" type="time" required defaultValue={hours.closeTime} className={inputClass} /></label>
        <label className="text-[11px] font-bold text-white/45">بداية الاستراحة<input name="breakStartTime" type="time" defaultValue={hours.breakStartTime ?? ''} className={inputClass} /></label>
        <label className="text-[11px] font-bold text-white/45">نهاية الاستراحة<input name="breakEndTime" type="time" defaultValue={hours.breakEndTime ?? ''} className={inputClass} /></label>
      </div>
      <button type="submit" disabled={tools.pending} className={secondaryButtonClass + ' mt-4 w-full'}><Save className="size-4" aria-hidden="true" />حفظ {day.label}</button>
    </form>
  );
}

interface TimeOffSubject {
  id: string;
  name: string;
  timeOff: TimeOffDto[];
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
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function TimeOffPanel({
  branch,
  subjectType,
  subjects,
  tools,
}: {
  branch: OperationsWorkforceBranchDto;
  subjectType: TimeOffSubjectType;
  subjects: TimeOffSubject[];
  tools: SectionTools;
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const subject = subjects.find((candidate) => candidate.id === subjectId) ?? subjects[0];
  const isTeam = subjectType === 'TEAM';
  return (
    <Panel
      title={isTeam ? 'عدم توفر الفرق' : 'إجازات الموظفين'}
      description={isTeam ? 'توقف الفريق بالكامل خلال المدة ويُستبعد من الإسناد.' : 'يُستبعد الموظف من احتساب قوة الفريق خلال المدة.'}
      actions={subjects.length ? (
        <label className="text-xs font-bold text-white/55">
          {isTeam ? 'الفريق' : 'الموظف'}
          <select value={subject?.id ?? ''} onChange={(event) => setSubjectId(event.target.value)} className={inputClass + ' min-w-52'}>
            {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      ) : null}
    >
      {subject ? (
        <div className="space-y-4">
          <TimeOffForm key={subject.id + '-new'} branch={branch} subjectType={subjectType} subject={subject} tools={tools} />
          {subject.timeOff.map((timeOff) => <TimeOffForm key={timeOff.id} branch={branch} subjectType={subjectType} subject={subject} timeOff={timeOff} tools={tools} />)}
          {!subject.timeOff.length ? <EmptyState title="لا توجد فترات مسجلة" text="الإتاحة تعتمد الآن على ساعات العمل فقط." /> : null}
        </div>
      ) : <EmptyState title={isTeam ? 'لا توجد فرق' : 'لا يوجد موظفون'} text="أضف العنصر أولًا لتسجيل عدم توفره." />}
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
  branch: OperationsWorkforceBranchDto;
  subjectType: TimeOffSubjectType;
  subject: TimeOffSubject;
  timeOff?: TimeOffDto;
  tools: SectionTools;
}) {
  const start = timeOff ? timeOffInputParts(timeOff.startDate, branch.timezone) : null;
  const end = timeOff ? timeOffInputParts(timeOff.endDate, branch.timezone) : null;
  return (
    <form onSubmit={(event) => tools.execute(saveOperationsTimeOffAction, formDataFrom(event))} className={'rounded-2xl border p-4 ' + (timeOff ? 'border-white/8 bg-black/20' : 'border-[#d4af37]/20 bg-[#d4af37]/[0.045]')}>
      {timeOff ? <input type="hidden" name="timeOffId" value={timeOff.id} /> : null}
      <input type="hidden" name="branchId" value={branch.id} />
      <input type="hidden" name="subjectType" value={subjectType} />
      <input type="hidden" name="subjectId" value={subject.id} />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><p className="text-sm font-black text-white/82">{timeOff ? 'تعديل الفترة' : 'إضافة فترة جديدة'}</p><p className="mt-1 text-[11px] text-white/35">الوقت محلي حسب {branch.timezone}</p></div>
        {timeOff ? (
          <button
            type="button"
            disabled={tools.pending}
            onClick={() => tools.requestConfirmation({
              title: 'حذف فترة ' + subject.name,
              description: 'سيعود العنصر للإتاحة خلال هذه المدة إذا سمحت بقية القواعد.',
              action: deleteOperationsTimeOffAction,
              entityId: timeOff.id,
              branchId: branch.id,
              additionalFields: { subjectType },
              confirmLabel: 'حذف الفترة',
            })}
            className={dangerButtonClass}
          ><Trash2 className="size-4" aria-hidden="true" />حذف</button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-bold text-white/50">تاريخ البداية<input name="startDate" type="date" required defaultValue={start?.date ?? ''} className={inputClass} /></label>
        <label className="text-[11px] font-bold text-white/50">وقت البداية<input name="startTime" type="time" required defaultValue={start?.time ?? ''} className={inputClass} /></label>
        <label className="text-[11px] font-bold text-white/50">تاريخ النهاية<input name="endDate" type="date" required defaultValue={end?.date ?? ''} className={inputClass} /></label>
        <label className="text-[11px] font-bold text-white/50">وقت النهاية<input name="endTime" type="time" required defaultValue={end?.time ?? ''} className={inputClass} /></label>
      </div>
      <label className="mt-3 block text-[11px] font-bold text-white/50">سبب عدم التوفر<input name="reason" required minLength={2} maxLength={500} defaultValue={timeOff?.reason ?? ''} placeholder="إجازة، صيانة معدات…" className={inputClass} /></label>
      {timeOff ? <label className="mt-3 block text-[11px] font-bold text-white/50">سبب هذا التعديل<input name="changeReason" required minLength={5} maxLength={500} placeholder="يسجل مع التعديل" className={inputClass} /></label> : null}
      <button type="submit" disabled={tools.pending} className={secondaryButtonClass + ' mt-4 w-full'}><Save className="size-4" aria-hidden="true" />{timeOff ? 'حفظ التعديل' : 'إضافة الفترة'}</button>
    </form>
  );
}

export default function OperationsWorkforceBoard({
  actor,
  branches,
  employees,
  employeeManagementBranchIds,
  services,
}: OperationsWorkforceBoardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [section, setSection] = useState<SectionId>('teams');
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
  const canManageEmployeeAccounts = Boolean(
    branch && employeeManagementBranchIds.includes(branch.id),
  );

  function execute(action: WorkforceMutation, formData: FormData) {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (result.error) {
          setNotice({ kind: 'error', text: result.error });
          return;
        }
        setNotice({ kind: 'success', text: result.message ?? 'تم حفظ التغييرات.' });
        router.refresh();
      } catch {
        setNotice({ kind: 'error', text: 'تعذر تنفيذ الإجراء. تحقق من صلاحية إدارة القوى العاملة ثم حاول مرة أخرى.' });
      }
    });
  }

  function confirmDestructive(reason: string) {
    if (!confirmation) return;
    const request = confirmation;
    const formData = new FormData();
    formData.set('entityId', request.entityId);
    formData.set('branchId', request.branchId);
    for (const [key, value] of Object.entries(request.additionalFields ?? {})) formData.set(key, value);
    formData.set('reason', reason.trim());
    setConfirmation(null);
    execute(request.action, formData);
  }

  const tools: SectionTools = { pending, execute, requestConfirmation: setConfirmation };
  const activeEmployees = branchEmployees.filter((employee) => employee.active).length;
  const activeTeams = branch?.teams.filter((team) => team.active).length ?? 0;
  const unavailableNow = branch
    ? [
        ...branch.teams.flatMap((team) => team.timeOff),
        ...branchEmployees.flatMap((employee) => employee.timeOff),
      ].filter((timeOff) => new Date(timeOff.startDate) <= new Date() && new Date(timeOff.endDate) > new Date()).length
    : 0;

  let content: ReactNode;
  if (!branch) {
    content = <EmptyState title="لا يوجد فرع مسموح" text="يلزم إسناد فرع للحساب ومنحه workforce.manage لهذا الفرع." />;
  } else if (section === 'teams') {
    content = <TeamSection key={branch.id} branch={branch} employees={branchEmployees} services={services} tools={tools} />;
  } else if (section === 'availability') {
    content = <AvailabilitySection key={branch.id} branch={branch} employees={branchEmployees} tools={tools} />;
  } else if (canManageEmployeeAccounts) {
    content = <EmployeeSection key={branch.id} branch={branch} branches={branches} employees={branchEmployees} actorRole={actor.role} tools={tools} />;
  } else {
    content = (
      <div className="rounded-3xl border border-amber-500/20 bg-amber-500/[0.04] p-8 text-center sm:p-12">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-300">
          <ShieldCheck className="size-7" />
        </div>
        <h3 className="mt-4 text-lg font-black text-white">إدارة الحسابات تتطلب تفويضًا إداريًا صريحًا</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-white/55">
          يمكنك إدارة وتشكيل فرق العمل وإجازاتها لفرع <strong className="text-[#f3e4a8]">{branch.nameAr}</strong> مباشرة من تبويب <strong>«تشكيل الفرق»</strong>. إنشاء أو تعديل الحسابات يتطلب تفويض <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs text-[#d4af37]">employee.manage</code> من المالك.
        </p>
        <button
          type="button"
          onClick={() => setSection('teams')}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#d4af37] px-5 py-2.5 text-xs font-bold text-black hover:bg-[#e5c65d] transition"
        >
          <UsersRound className="size-4" />
          <span>الانتقال إلى تشكيل الفرق</span>
        </button>
      </div>
    );
  }

  const navItems: Array<{ id: SectionId; label: string; hint: string; icon: typeof UsersRound }> = [
    { id: 'teams', label: 'تشكيل الفرق', hint: 'أعضاء وقدرات وزونات', icon: UsersRound },
    { id: 'availability', label: 'الإتاحة والدوام', hint: 'دوام وإجازات', icon: CalendarClock },
    { id: 'employees', label: 'حسابات الموظفين', hint: 'موظفو الفرع', icon: UserRoundCog },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-[#08090a] text-white">
      <header className="border-b border-white/8 bg-[#0b0c0e]/95">
        <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#d4af37]">
                <UsersRound className="size-4" aria-hidden="true" />
                وردية القوى العاملة
              </span>
              <span className="hidden sm:inline-block text-white/20">|</span>
              <span className="rounded-full border border-[#d4af37]/25 bg-[#d4af37]/8 px-3 py-1 text-[11px] font-bold text-[#e3c65f]">
                نطاق القوى العاملة والفرق
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link href="/operations" className={secondaryButtonClass}>
                <ArrowRight className="size-4" aria-hidden="true" />
                لوحة التشغيل
              </Link>
              <Link href="/" className={secondaryButtonClass}>
                <Home className="size-4 text-neutral-400" aria-hidden="true" />
                الصفحة الرئيسية
              </Link>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-white">إدارة القوى العاملة وتشكيل الفرق</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
                شكّل الفرق وحدد أعضاءها وساعات عملها وإجازاتها للفروع المسموح بها في نطاقك.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-1 min-w-[200px] sm:min-w-[240px]">
                <label htmlFor="active-workforce-branch" className="text-xs font-bold text-white/60">الفرع العامل</label>
                <select
                  id="active-workforce-branch"
                  value={branch?.id ?? ''}
                  onChange={(event) => { setBranchId(event.target.value); setNotice(null); }}
                  className="min-h-11 w-full rounded-xl border border-white/12 bg-black/60 px-3.5 text-xs font-bold text-white outline-none transition focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                >
                  {branches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameAr} — {item.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 self-end">
                <span className="text-xs font-bold text-transparent select-none">.</span>
                <div className="flex min-h-11 items-center gap-2.5 rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10 px-4 py-2 text-xs shadow-sm">
                  <div className="grid size-7 place-items-center rounded-lg bg-[#d4af37]/20 text-[#f3e4a8]">
                    <User className="size-3.5" />
                  </div>
                  <div>
                    <span className="block font-black text-white">{actor.fullName}</span>
                    <span className="text-[10px] font-bold text-[#e3c65f]">
                      {roleArabicNames[actor.role] ?? actor.role}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {branch ? (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: 'الموظفون النشطون', value: activeEmployees, icon: UserRoundCog, tone: 'text-emerald-300', bg: 'bg-emerald-500/10' },
                { label: 'الفرق النشطة', value: activeTeams, icon: UsersRound, tone: 'text-[#d4af37]', bg: 'bg-[#d4af37]/10' },
                { label: 'غير متاح الآن', value: unavailableNow, icon: Clock3, tone: 'text-amber-300', bg: 'bg-amber-500/10' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-4 rounded-2xl border border-white/8 bg-black/30 p-4 transition hover:border-white/15">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${item.bg} ${item.tone}`}>
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs font-medium text-white/45">{item.label}</p>
                      <p className="mt-0.5 text-2xl font-black tabular-nums text-white">{item.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-8">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <nav aria-label="أقسام إدارة القوى العاملة" className="flex gap-2 overflow-x-auto rounded-2xl border border-white/9 bg-[#0d0e10] p-3 lg:flex-col lg:overflow-visible">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setSection(item.id); setNotice(null); }}
                  aria-current={active ? 'page' : undefined}
                  className={'flex min-w-52 shrink-0 items-center gap-3 rounded-xl border px-3 py-3 text-right transition lg:min-w-0 ' + (active ? 'border-[#d4af37]/30 bg-[#d4af37]/10' : 'border-transparent hover:border-white/8 hover:bg-white/[0.035]')}
                >
                  <span className={'grid size-9 shrink-0 place-items-center rounded-lg ' + (active ? 'bg-[#d4af37] text-black' : 'bg-white/[0.055] text-white/45')}><Icon className="size-4" aria-hidden="true" /></span>
                  <span><span className={'block text-sm font-black ' + (active ? 'text-[#e7cd72]' : 'text-white/72')}>{item.label}</span><span className="mt-0.5 block text-[11px] text-white/32">{item.hint}</span></span>
                </button>
              );
            })}
          </nav>
          <div className="mt-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.045] p-4 text-xs leading-6 text-emerald-100/55"><ShieldCheck className="mb-2 size-5 text-emerald-300" aria-hidden="true" />كل عملية تُعاد معاينة فرعها وصلاحيتها على الخادم؛ employee.manage مطلوبة للحسابات، وworkforce.manage للفرق والإتاحة.</div>
        </aside>

        <div className="min-w-0">
          <div aria-live="polite" className="mb-4 min-h-12">
            {notice ? <p role={notice.kind === 'error' ? 'alert' : 'status'} className={'rounded-xl border px-4 py-3 text-sm font-bold ' + (notice.kind === 'error' ? 'border-red-400/25 bg-red-400/10 text-red-200' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200')}>{notice.text}</p> : <p className="px-1 py-3 text-xs text-white/30">التغييرات تحفظ مباشرة في محرك الإتاحة والإسناد.</p>}
          </div>
          <div className="space-y-6">{content}</div>
        </div>
      </main>

      {confirmation ? <ConfirmationDialog request={confirmation} pending={pending} onCancel={() => setConfirmation(null)} onConfirm={confirmDestructive} /> : null}
    </div>
  );
}
