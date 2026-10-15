'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  CreditCard,
  LoaderCircle,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserRound,
  Copy,
  Check,
} from 'lucide-react';
import { createBookingAction, uploadPaymentProofAction, releasePendingBookingHoldAction } from '@/app/actions/booking';
import { BOOKING_TERMS_VERSION } from '@/lib/policies/versions';
import { prepareImageForUpload } from '@/lib/client/image-upload';
import { whatsappHref } from '@/lib/contact-links';
import { isCanonicalPhone, normalizePhone as toCanonicalPhone } from '@/lib/validations/phone';
import { isValidLocationUrl } from '@/lib/security/url';

type VehicleSize = 'SEDAN' | 'CROSSOVER' | 'SUV' | 'LARGE_SUV';

interface BookingUser {
  id: string;
  fullName: string;
  phone: string;
  whatsapp: string | null;
}

interface ServiceDto {
  id: string;
  nameAr: string;
  basePrice: number;
  requiresDeposit: boolean;
  requiresFullPrepayment: boolean;
  depositType: string;
  depositValue: number;
  cancellationPolicy: {
    policyId: string | null;
    code: string;
    nameAr: string;
    version: string;
    noticeHours: number;
    allowsCancellation: boolean;
    allowsRescheduling: boolean;
    allowsLateRequests: boolean;
    policyTextAr: string;
    revision: string;
  };
  variants: Array<{
    id: string;
    vehicleSize: VehicleSize;
    price: number;
    durationMinutes: number;
  }>;
  addonLinks: Array<{
    addon: {
      id: string;
      nameAr: string;
      price: number;
      durationMinutes: number;
    };
  }>;
}

interface CoverageAreaDto {
  id: string;
  governorate: string;
  city: string;
  district: string;
  compound: string;
  zone: { id?: string; name?: string; branchId: string; branch: { nameAr: string } };
}

interface PaymentMethodDto {
  id: string;
  branchId: string;
  name: string;
  type: string;
  accountNumber: string;
  accountName: string;
  instructions: string | null;
  isDefault: boolean;
}

interface VehicleDto {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  vehicleSize: VehicleSize;
  plateNumber: string | null;
  isDefault: boolean;
}

interface AddressDto {
  id: string;
  governorate: string;
  city: string;
  district: string;
  compound: string;
  street: string;
  buildingNumber: string;
  unitNumber: string | null;
  landmark: string | null;
  gateInstructions: string | null;
  locationUrl: string | null;
  isDefault: boolean;
}

interface SubscriptionDto {
  id: string;
  branchId: string;
  remainingVisits: number;
  endDate: string;
  plan: {
    id: string;
    nameAr: string;
    services: Array<{ serviceId: string }>;
    branches: Array<{ branchId: string }>;
  };
  vehicles: Array<{ vehicleId: string }>;
  serviceBalances?: Array<{
    serviceId: string;
    remainingVisits: number;
    service: { nameAr: string };
  }>;
}

interface AvailableSlotDto {
  timeStr: string;
  startAt: string;
  endAt: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  totalDurationMinutes: number;
}

interface InitialSelection {
  vehicleId?: string;
  addressId?: string;
  subscriptionId?: string;
}

interface Props {
  user: BookingUser | null;
  service: ServiceDto;
  coverageAreas: CoverageAreaDto[];
  paymentMethods: PaymentMethodDto[];
  vehicles: VehicleDto[];
  addresses: AddressDto[];
  subscriptions: SubscriptionDto[];
  creditBalance: number;
  supportContact: { phone: string; whatsapp: string } | null;
  initialSelection: InitialSelection;
}

interface UiError {
  message: string;
  fieldId?: string;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * A photo larger than the upload limit is scaled down in the browser instead
 * of being refused, so a high-resolution phone camera does not stop a booking.
 * Returns the original file when it cannot be read as a picture here.
 */
async function shrinkPictureToFit(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 2560 / longestSide);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], 'payment-proof.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

const inputClass =
  'w-full rounded-xl border border-neutral-700 bg-[#0a0a0a] px-4 py-3 text-white placeholder:text-neutral-500 transition-colors hover:border-neutral-500 focus-visible:border-[#cea355] focus-visible:ring-2 focus-visible:ring-[#cea355]/25 disabled:cursor-not-allowed disabled:opacity-60 text-sm font-medium';
const labelClass = 'mb-2 block text-xs font-bold text-white';

const vehicleSizes: Array<{ value: VehicleSize; label: string; description: string }> = [
  { value: 'SEDAN', label: 'سيدان', description: 'سيارة صغيرة أو متوسطة' },
  { value: 'CROSSOVER', label: 'كروس أوفر', description: 'سيارة مرتفعة مدمجة' },
  { value: 'SUV', label: 'دفع رباعي', description: 'SUV متوسطة' },
  { value: 'LARGE_SUV', label: 'دفع رباعي كبيرة', description: 'SUV كبيرة أو 7 مقاعد' },
];

const paymentTypeLabels: Record<string, string> = {
  VODAFONE_CASH: 'فودافون كاش',
  INSTAPAY: 'إنستاباي',
  BANK_TRANSFER: 'تحويل بنكي',
  CASH_DEPOSIT: 'إيداع نقدي',
  OTHER_MANUAL: 'تحويل يدوي',
};

const currencyFormatter = new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat('ar-EG', {
  dateStyle: 'full',
  timeStyle: 'short',
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} كيلوبايت`;
  return `${(value / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateTimeInputValue(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${dateInputValue(date)}T${hours}:${minutes}`;
}

function defaultBookingDate() {
  const today = new Date();
  return dateInputValue(today);
}

export interface UpcomingDay {
  dateStr: string;
  dayName: string;
  dayNumber: number;
  monthName: string;
  isToday: boolean;
  isTomorrow: boolean;
}

export function format12HourTime(timeStr: string): string {
  if (!timeStr) return '';
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (match) {
    let hour = parseInt(match[1], 10);
    const minute = match[2];
    const period = hour >= 12 ? 'م' : 'ص';
    if (hour === 0) {
      hour = 12;
    } else if (hour > 12) {
      hour -= 12;
    }
    const hourFormatted = String(hour).padStart(2, '0');
    return `${hourFormatted}:${minute} ${period}`;
  }
  return timeStr;
}

export function getUpcoming7Days(): UpcomingDay[] {
  const days: UpcomingDay[] = [];
  const now = new Date();
  const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dateStr = dateInputValue(d);
    days.push({
      dateStr,
      dayName: dayNames[d.getDay()],
      dayNumber: d.getDate(),
      monthName: monthNames[d.getMonth()],
      isToday: i === 0,
      isTomorrow: i === 1,
    });
  }
  return days;
}

export interface CalendarMonthDay {
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isTomorrow: boolean;
  isPast: boolean;
  isBeyondMax: boolean;
  dayName: string;
  monthName: string;
  year: number;
}

export function getMonthCalendarDays(year: number, month: number, now: Date = new Date()): CalendarMonthDay[] {
  const todayStr = dateInputValue(now);
  const maxDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90);
  const maxDateStr = dateInputValue(maxDate);

  const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

  const days: CalendarMonthDay[] = [];

  // Trailing days from previous month
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthLastDay - i);
    const dateStr = dateInputValue(d);
    days.push({
      dateStr,
      dayNumber: d.getDate(),
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      isTomorrow: dateStr === dateInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)),
      isPast: dateStr < todayStr,
      isBeyondMax: dateStr > maxDateStr,
      dayName: dayNames[d.getDay()],
      monthName: monthNames[d.getMonth()],
      year: d.getFullYear(),
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const dateStr = dateInputValue(d);
    days.push({
      dateStr,
      dayNumber: i,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      isTomorrow: dateStr === dateInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)),
      isPast: dateStr < todayStr,
      isBeyondMax: dateStr > maxDateStr,
      dayName: dayNames[d.getDay()],
      monthName: monthNames[d.getMonth()],
      year: d.getFullYear(),
    });
  }

  // Leading days for next month to complete rows of 7
  const remainder = 7 - (days.length % 7);
  if (remainder < 7) {
    for (let i = 1; i <= remainder; i++) {
      const d = new Date(year, month + 1, i);
      const dateStr = dateInputValue(d);
      days.push({
        dateStr,
        dayNumber: i,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isTomorrow: dateStr === dateInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)),
        isPast: dateStr < todayStr,
        isBeyondMax: dateStr > maxDateStr,
        dayName: dayNames[d.getDay()],
        monthName: monthNames[d.getMonth()],
        year: d.getFullYear(),
      });
    }
  }

  return days;
}

export function formatSelectedDateArabic(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  const d = new Date(year, month - 1, day);
  const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];
  return `${dayNames[d.getDay()]}، ${day} ${monthNames[d.getMonth()]} ${year}`;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * What a phone field keeps as the customer types: digits and one leading "+".
 * Arabic and Persian digits are turned into Latin ones, and anything else (a
 * name the browser auto-filled, spaces, dashes) is dropped, so the field can
 * only ever hold a number.
 */
function cleanPhoneInput(value: string) {
  const latin = value
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)));
  const digits = latin.replace(/[^0-9]/g, '');
  return latin.trim().startsWith('+') ? `+${digits}` : digits;
}

function normalizePhone(value: string) {
  return cleanPhoneInput(value);
}

/** The same rule the server applies, so a number accepted here is accepted there. */
function isValidPhone(value: string) {
  return isCanonicalPhone(toCanonicalPhone(cleanPhoneInput(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function responseError(value: unknown, fallback: string) {
  if (isRecord(value) && typeof value.error === 'string') return value.error;
  return fallback;
}

function isAvailableSlot(value: unknown): value is AvailableSlotDto {
  if (!isRecord(value)) return false;
  return (
    typeof value.timeStr === 'string' &&
    typeof value.startAt === 'string' &&
    typeof value.endAt === 'string' &&
    typeof value.arrivalWindowStart === 'string' &&
    typeof value.arrivalWindowEnd === 'string' &&
    typeof value.totalDurationMinutes === 'number'
  );
}

function normalizeText(text: string) {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

function areaForAddress(address: AddressDto, coverageAreas: CoverageAreaDto[]) {
  if (!address || !coverageAreas.length) return undefined;

  // 1. Exact match on all 4 fields
  const exact = coverageAreas.find(
    (area) =>
      area.governorate === address.governorate &&
      area.city === address.city &&
      area.district === address.district &&
      area.compound === address.compound,
  );
  if (exact) return exact;

  // 2. Normalized match on all 4 fields
  const normGov = normalizeText(address.governorate);
  const normCity = normalizeText(address.city);
  const normDist = normalizeText(address.district);
  const normComp = normalizeText(address.compound);

  const normalizedExact = coverageAreas.find((area) => {
    return (
      normalizeText(area.governorate) === normGov &&
      normalizeText(area.city) === normCity &&
      normalizeText(area.district) === normDist &&
      normalizeText(area.compound) === normComp
    );
  });
  if (normalizedExact) return normalizedExact;

  // 3. Match by compound name
  if (normComp) {
    const compoundMatch = coverageAreas.find((area) => {
      const aComp = normalizeText(area.compound);
      return aComp === normComp || (normComp.length >= 3 && (aComp.includes(normComp) || normComp.includes(aComp)));
    });
    if (compoundMatch) return compoundMatch;
  }

  // 4. Match by city & district
  if (normCity && normDist) {
    const cityDistrictMatch = coverageAreas.find(
      (area) =>
        normalizeText(area.city) === normCity &&
        normalizeText(area.district) === normDist,
    );
    if (cityDistrictMatch) return cityDistrictMatch;
  }

  return undefined;
}

function subscriptionIssue(
  subscription: SubscriptionDto,
  serviceId: string,
  branchId: string | undefined,
  vehicleId: string,
) {
  if (!subscription.plan.services.some((item) => item.serviceId === serviceId)) {
    return 'الخدمة غير مشمولة في هذه الباقة.';
  }
  const specificBalance = subscription.serviceBalances?.find((item) => item.serviceId === serviceId);
  if (specificBalance && specificBalance.remainingVisits <= 0) {
    return 'رصيد هذه الخدمة المحددة نَفَد في الاشتراك.';
  }
  if (!branchId || subscription.branchId !== branchId) {
    return 'الاشتراك مرتبط بفرع آخر.';
  }
  if (
    subscription.plan.branches.length > 0 &&
    !subscription.plan.branches.some((item) => item.branchId === branchId)
  ) {
    return 'الباقة غير متاحة في هذا الفرع.';
  }
  if (vehicleId === 'new') return 'اختر سيارة محفوظة لاستخدام الاشتراك.';
  if (!subscription.vehicles.some((item) => item.vehicleId === vehicleId)) {
    return 'السيارة المختارة غير مرتبطة بهذا الاشتراك.';
  }
  return null;
}

function calculateEstimatedDeposit(totalPrice: number, service: ServiceDto) {
  if (totalPrice === 0 || !service.requiresDeposit) return 0;
  if (service.requiresFullPrepayment) return totalPrice;
  const requested =
    service.depositType === 'PERCENTAGE'
      ? Math.ceil((totalPrice * Math.min(service.depositValue, 100)) / 100)
      : service.depositValue;
  return Math.min(totalPrice, requested);
}

export default function BookingWizardClient({
  user,
  service,
  coverageAreas,
  paymentMethods,
  vehicles,
  addresses,
  subscriptions,
  creditBalance,
  supportContact,
  initialSelection,
}: Props) {
  const router = useRouter();
  const requestedVehicle = vehicles.find((vehicle) => vehicle.id === initialSelection.vehicleId);
  const defaultVehicle =
    requestedVehicle ?? vehicles.find((vehicle) => vehicle.isDefault) ?? vehicles[0];

  const requestedAddress = addresses.find((address) => address.id === initialSelection.addressId);
  const fallbackAddress = addresses.find((address) => address.isDefault) ?? addresses[0];
  const firstAddress = requestedAddress ?? fallbackAddress;
  const firstAddressArea = firstAddress ? areaForAddress(firstAddress, coverageAreas) : undefined;
  // Keep an out-of-coverage saved address selected so the customer gets clear
  // guidance instead of silently falling back to a different branch.
  const initialAddress = firstAddress;
  const initialArea = firstAddressArea ?? coverageAreas[0];
  const initialVehicleId = defaultVehicle?.id ?? 'new';
  const requestedSubscription = subscriptions.find(
    (subscription) => subscription.id === initialSelection.subscriptionId,
  );
  const initialSubscriptionId =
    requestedSubscription &&
    !subscriptionIssue(
      requestedSubscription,
      service.id,
      initialArea?.zone.branchId,
      initialVehicleId,
    )
      ? requestedSubscription.id
      : '';

  const [step, setStep] = useState(1);
  const [selectedVehicleId, setSelectedVehicleId] = useState(initialVehicleId);
  const [vehicleSize, setVehicleSize] = useState<VehicleSize>(
    defaultVehicle?.vehicleSize ?? 'SEDAN',
  );
  const [selectedAddonIds] = useState<string[]>([]);
  const [vehicleMake, setVehicleMake] = useState(defaultVehicle?.make ?? '');
  const [vehicleModel, setVehicleModel] = useState(defaultVehicle?.model ?? '');
  const [vehicleYear, setVehicleYear] = useState(
    defaultVehicle ? String(defaultVehicle.year) : '',
  );
  const [vehicleColor, setVehicleColor] = useState(defaultVehicle?.color ?? '');
  const [plateNumber, setPlateNumber] = useState(defaultVehicle?.plateNumber ?? '');
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState(initialSubscriptionId);

  const [selectedAddressId, setSelectedAddressId] = useState(initialAddress?.id ?? 'new');
  const [selectedBranchId, setSelectedBranchId] = useState(initialArea?.zone.branchId ?? '');
  const [selectedAreaId, setSelectedAreaId] = useState(initialArea?.id ?? '');
  const [street, setStreet] = useState(initialAddress?.street ?? '');
  const [buildingNumber, setBuildingNumber] = useState(initialAddress?.buildingNumber ?? '');
  const [unitNumber, setUnitNumber] = useState(initialAddress?.unitNumber ?? '');
  const [landmark, setLandmark] = useState(initialAddress?.landmark ?? '');
  const [gateInstructions, setGateInstructions] = useState(
    initialAddress?.gateInstructions ?? '',
  );
  const [locationUrl, setLocationUrl] = useState(initialAddress?.locationUrl ?? '');

  const [selectedDate, setSelectedDate] = useState(defaultBookingDate);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlotDto[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlotDto | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [availabilityRetry, setAvailabilityRetry] = useState(0);

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp || user?.phone || '');
  const [customerNotes, setCustomerNotes] = useState('');
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [pendingBooking, setPendingBooking] = useState<{
    bookingId: string;
    bookingNumber: string;
    paymentRequired: boolean;
  } | null>(null);
  const [useCredit] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  const [guestConfirmed, setGuestConfirmed] = useState<{
    bookingNumber: string;
    serviceName: string;
    dateStr: string;
    contactPhone: string;
  } | null>(null);

  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('');
  const [senderName, setSenderName] = useState(user?.fullName || '');
  const [senderPhoneOrAccount, setSenderPhoneOrAccount] = useState(user?.phone || '');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [amountSubmitted, setAmountSubmitted] = useState('');
  const [transferTimestamp] = useState(() => dateTimeInputValue(new Date()));
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string>('');
  const [copiedMethodId, setCopiedMethodId] = useState<string>('');
  const [uploadedProofFileId, setUploadedProofFileId] = useState('');

  const [uiError, setUiError] = useState<UiError | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const bookingBranches = useMemo(() => {
    const branches = new Map<string, { id: string; nameAr: string }>();
    for (const area of coverageAreas) {
      branches.set(area.zone.branchId, {
        id: area.zone.branchId,
        nameAr: area.zone.branch?.nameAr || 'الفرع الرئيسي',
      });
    }
    return Array.from(branches.values());
  }, [coverageAreas]);

  const branchCoverageAreas = useMemo(
    () => coverageAreas.filter((area) => area.zone.branchId === selectedBranchId),
    [coverageAreas, selectedBranchId],
  );


  const selectedArea = branchCoverageAreas.find((area) => area.id === selectedAreaId) || branchCoverageAreas[0];
  const supportWhatsApp = supportContact?.whatsapp || supportContact?.phone;
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
  const selectedAddress = addresses.find((address) => address.id === selectedAddressId);
  const selectedAddressArea = selectedAddress ? areaForAddress(selectedAddress, coverageAreas) : undefined;
  const selectedSubscription = subscriptions.find(
    (subscription) => subscription.id === selectedSubscriptionId,
  );

  const addonIdsQuery = useMemo(
    () => [...selectedAddonIds].sort().join(','),
    [selectedAddonIds],
  );
  const availablePaymentMethods = useMemo(
    () => paymentMethods.filter((method) => method.branchId === selectedArea?.zone.branchId),
    [selectedArea?.zone.branchId, paymentMethods],
  );

  const basePrice = service.basePrice;
  const addonsPrice = 0;
  const subscriptionApplies = Boolean(
    selectedSubscription &&
      !subscriptionIssue(
        selectedSubscription,
        service.id,
        selectedArea?.zone.branchId,
        selectedVehicleId,
      ),
  );
  const estimatedTotal = subscriptionApplies ? addonsPrice : basePrice + addonsPrice;
  const estimatedDeposit = subscriptionApplies
    ? 0
    : calculateEstimatedDeposit(estimatedTotal, service);
  const estimatedCreditApplied = useCredit ? Math.min(creditBalance, estimatedTotal) : 0;
  const estimatedTransferAmount = Math.max(0, estimatedDeposit - estimatedCreditApplied);
  const hasSavedContact =
    fullName.trim().length >= 2 &&
    isValidPhone(phone) &&
    isValidPhone(whatsapp);
  const useSavedContact = Boolean(user) && hasSavedContact;
  const upcomingDays = useMemo(() => getUpcoming7Days(), []);
  const [calendarViewMode, setCalendarViewMode] = useState<'quick' | 'month'>('quick');
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());

  const monthNamesArabic = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  const currentMonthDays = useMemo(
    () => getMonthCalendarDays(calendarYear, calendarMonth),
    [calendarYear, calendarMonth]
  );

  function prevMonth() {
    const now = new Date();
    if (calendarYear === now.getFullYear() && calendarMonth <= now.getMonth()) return;
    if (calendarMonth === 0) {
      setCalendarYear((y) => y - 1);
      setCalendarMonth(11);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    const now = new Date();
    const maxDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90);
    if (
      calendarYear > maxDate.getFullYear() ||
      (calendarYear === maxDate.getFullYear() && calendarMonth >= maxDate.getMonth())
    ) {
      return;
    }
    if (calendarMonth === 11) {
      setCalendarYear((y) => y + 1);
      setCalendarMonth(0);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  }

  useEffect(() => {
    if (uiError) errorRef.current?.focus();
  }, [uiError]);

  useEffect(() => {
    if (!selectedArea) return;
    const branchMethods = paymentMethods.filter(
      (method) => method.branchId === selectedArea.zone.branchId,
    );
    const initialMethod = branchMethods.find((method) => method.isDefault) ?? branchMethods[0];
    if (initialMethod) {
      setSelectedPaymentMethodId((prev) => prev || initialMethod.id);
    }
  }, [selectedArea, paymentMethods]);

  useEffect(() => {
    if (estimatedTransferAmount > 0) {
      setAmountSubmitted(String(estimatedTransferAmount));
    }
  }, [estimatedTransferAmount]);

  useEffect(() => {
    if (fullName.trim()) setSenderName((prev) => prev || fullName.trim());
    if (phone.trim()) setSenderPhoneOrAccount((prev) => prev || phone.trim());
  }, [fullName, phone]);

  useEffect(() => {
    if (step !== 3) return;
    if (!selectedArea || !selectedDate) {
      setAvailableSlots([]);
      setSelectedSlot(null);
      return;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({
      branchId: selectedArea.zone.branchId,
      serviceId: service.id,
      vehicleSize,
      coverageAreaId: selectedArea.id,
      date: selectedDate,
    });
    if (addonIdsQuery) query.set('addonIds', addonIdsQuery);

    setLoadingSlots(true);
    setSlotsError('');
    setSelectedSlot(null);

    void (async () => {
      try {
        const response = await fetch(`/api/availability?${query.toString()}`, {
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(responseError(payload, 'تعذر تحميل المواعيد المتاحة.'));
        }
        const slots =
          isRecord(payload) && Array.isArray(payload.slots)
            ? payload.slots.filter(isAvailableSlot)
            : [];
        setAvailableSlots(slots);
      } catch (error) {
        if (controller.signal.aborted) return;
        setAvailableSlots([]);
        setSlotsError(
          error instanceof Error ? error.message : 'تعذر تحميل المواعيد المتاحة.',
        );
      } finally {
        if (!controller.signal.aborted) setLoadingSlots(false);
      }
    })();

    return () => controller.abort();
  }, [
    addonIdsQuery,
    availabilityRetry,
    selectedArea,
    selectedDate,
    service.id,
    step,
    vehicleSize,
  ]);

  function showError(message: string, fieldId?: string) {
    setUiError({ message, fieldId });
  }

  function goToStep(nextStep: number) {
    setUiError(null);
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function selectVehicle(vehicleId: string) {
    setSelectedVehicleId(vehicleId);
    setSelectedSubscriptionId('');
    setUiError(null);
    if (vehicleId === 'new') {
      setVehicleSize('SEDAN');
      setVehicleMake('');
      setVehicleModel('');
      setVehicleYear('');
      setVehicleColor('');
      setPlateNumber('');
      return;
    }
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    if (!vehicle) return;
    setVehicleSize(vehicle.vehicleSize);
    setVehicleMake(vehicle.make);
    setVehicleModel(vehicle.model);
    setVehicleYear(String(vehicle.year));
    setVehicleColor(vehicle.color);
    setPlateNumber(vehicle.plateNumber ?? '');
  }

  function selectAddress(addressId: string) {
    setSelectedAddressId(addressId);
    setSelectedSubscriptionId('');
    setUiError(null);
    if (addressId === 'new') {
      setStreet('');
      setBuildingNumber('');
      setUnitNumber('');
      setLandmark('');
      setGateInstructions('');
      setLocationUrl('');
      if (!selectedAreaId && coverageAreas[0]) setSelectedAreaId(coverageAreas[0].id);
      return;
    }
    const address = addresses.find((item) => item.id === addressId);
    if (!address) return;
    const area = areaForAddress(address, coverageAreas);
    if (!area) return;
    setSelectedBranchId(area.zone.branchId);
    setSelectedAreaId(area.id);
    setStreet(address.street);
    setBuildingNumber(address.buildingNumber);
    setUnitNumber(address.unitNumber ?? '');
    setLandmark(address.landmark ?? '');
    setGateInstructions(address.gateInstructions ?? '');
    setLocationUrl(address.locationUrl ?? '');
  }

  function selectBranch(branchId: string) {
    const areasInBranch = coverageAreas.filter((area) => area.zone.branchId === branchId);
    const firstAreaForBranch = areasInBranch[0];
    setSelectedBranchId(branchId);
    setSelectedAreaId(firstAreaForBranch?.id ?? '');
    setSelectedSubscriptionId('');
    setUiError(null);

    if (selectedAddressId !== 'new') {
      setSelectedAddressId('new');
      setStreet('');
      setBuildingNumber('');
      setUnitNumber('');
      setLandmark('');
      setGateInstructions('');
      setLocationUrl('');
    }
  }

  function validateVehicleDetails() {
    if (selectedVehicleId !== 'new') return true;
    if (!vehicleMake.trim()) {
      showError('اكتب ماركة السيارة.', 'vehicle-make');
      return false;
    }
    if (!vehicleColor.trim()) {
      showError('اكتب لون السيارة.', 'vehicle-color');
      return false;
    }
    return true;
  }

  function validateAddress() {
    if (selectedAddressId !== 'new') {
      if (!selectedAddressArea) {
        showError('العنوان المحفوظ خارج نطاق التغطية. اختر عنوانًا متاحًا أو تواصل معنا.', 'saved-address');
        return false;
      }
      return true;
    }
    if (!selectedArea) {
      showError('اختر منطقة التغطية.', 'coverage-area');
      return false;
    }
    if (!street.trim()) {
      showError('اكتب اسم الشارع.', 'street');
      return false;
    }
    if (!buildingNumber.trim()) {
      showError('اكتب رقم المبنى أو الفيلا.', 'building-number');
      return false;
    }
    if (locationUrl.trim() && !isValidLocationUrl(locationUrl.trim())) {
      showError('رابط الموقع يجب أن يكون رابط خرائط صالح (Google Maps).', 'location-url');
      return false;
    }
    return true;
  }

  function validateContact() {
    if (!fullName.trim() || fullName.trim().length < 2) {
      showError('اكتب الاسم الكامل.', 'contact-name');
      return false;
    }
    // One valid number is enough to book. Customers often fill only one of
    // the two fields, so the valid one is used for the other instead of
    // stopping them.
    const cleanPhone = normalizePhone(phone);
    const cleanWhatsapp = normalizePhone(whatsapp);
    const phoneValid = isValidPhone(cleanPhone);
    const whatsappValid = isValidPhone(cleanWhatsapp);
    if (!phoneValid && !whatsappValid) {
      showError('اكتب رقم الهاتف بالأرقام فقط، مثال: 01012345678', 'contact-phone');
      return false;
    }
    if (!phoneValid) setPhone(cleanWhatsapp);
    if (!whatsappValid) setWhatsapp(cleanPhone);
    return true;
  }

  async function createBooking() {
    if (!policyAccepted) {
      showError('يجب الموافقة على سياسة الحجز وسياسة الخصوصية والإلغاء المعتمدة أولاً للمتابعة.', 'policy-accepted');
      return;
    }
    if (!selectedArea) {
      showError('اختر منطقة التغطية.');
      goToStep(2);
      return;
    }
    if (!selectedSlot) {
      showError('اختر موعد الخدمة.');
      goToStep(3);
      return;
    }
    if (!validateVehicleDetails()) {
      goToStep(1);
      return;
    }
    if (!validateAddress()) {
      goToStep(2);
      return;
    }
    if (!validateContact()) {
      goToStep(4);
      return;
    }
    const requiresPaymentProof = estimatedTransferAmount > 0;
    const parsedAmount = Number(amountSubmitted || estimatedTransferAmount);

    if (requiresPaymentProof) {
      if (!selectedPaymentMethodId) {
        showError('اختر وسيلة التحويل المعتمدة.', 'payment-methods');
        return;
      }
      if (!senderName.trim()) {
        showError('اكتب اسم صاحب الحساب المحول منه.', 'sender-name');
        return;
      }
      if (!senderPhoneOrAccount.trim()) {
        showError('اكتب رقم الهاتف أو الحساب المحول منه.', 'sender-account');
        return;
      }
      if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
        showError('اكتب المبلغ المحول كرقم صحيح أكبر من صفر.', 'amount-submitted');
        return;
      }
      if (!proofFile && !uploadedProofFileId) {
        showError('اختر صورة أو ملف إثبات التحويل من جهازك.', 'payment-proof-file');
        return;
      }
    }

    setBookingSubmitting(true);
    setUiError(null);

    const formData = new FormData();
    formData.append('serviceId', service.id);
    formData.append('coverageAreaId', selectedArea.id);
    formData.append('vehicleSize', vehicleSize);
    formData.append('startAt', selectedSlot.startAt);
    formData.append('addonIds', JSON.stringify(selectedAddonIds));
    formData.append('policyAccepted', String(policyAccepted));
    formData.append('policyVersion', BOOKING_TERMS_VERSION);
    if (service.cancellationPolicy.policyId) {
      formData.append('acceptedCancellationPolicyId', service.cancellationPolicy.policyId);
    }
    formData.append(
      'acceptedCancellationPolicyRevision',
      service.cancellationPolicy.revision,
    );
    formData.append('contactName', fullName.trim());
    // Send a valid number in both fields even if only one was filled in.
    const typedPhone = normalizePhone(phone);
    const typedWhatsapp = normalizePhone(whatsapp);
    formData.append('contactPhone', isValidPhone(typedPhone) ? typedPhone : typedWhatsapp);
    formData.append('contactWhatsapp', isValidPhone(typedWhatsapp) ? typedWhatsapp : typedPhone);
    if (customerNotes.trim()) formData.append('customerNotes', customerNotes.trim());
    if (useCredit && creditBalance > 0) formData.append('useCredit', 'true');

    if (selectedVehicleId !== 'new') {
      formData.append('vehicleId', selectedVehicleId);
    }
    formData.append('vehicleMake', vehicleMake.trim());
    formData.append('vehicleModel', vehicleModel.trim());
    formData.append('vehicleYear', vehicleYear.trim());
    formData.append('vehicleColor', vehicleColor.trim());
    if (plateNumber.trim()) formData.append('plateNumber', plateNumber.trim());

    if (selectedAddressId !== 'new') {
      formData.append('addressId', selectedAddressId);
    }
    formData.append('street', street.trim());
    formData.append('buildingNumber', buildingNumber.trim());
    if (unitNumber.trim()) formData.append('unitNumber', unitNumber.trim());
    if (landmark.trim()) formData.append('landmark', landmark.trim());
    if (gateInstructions.trim()) formData.append('gateInstructions', gateInstructions.trim());
    if (locationUrl.trim()) formData.append('locationUrl', locationUrl.trim());

    if (selectedSubscriptionId) {
      formData.append('subscriptionId', selectedSubscriptionId);
    }

    try {
      let bookingId = pendingBooking?.bookingId;
      let bookingNumber = pendingBooking?.bookingNumber;
      let paymentRequired = pendingBooking?.paymentRequired ?? false;

      if (!bookingId) {
        const result = await createBookingAction(formData);
        if ('error' in result && result.error) {
          showError(result.error);
          return;
        }
        if (!('success' in result) || !result.success) {
          showError('تعذر إنشاء الحجز الآن. حاول مرة أخرى.');
          return;
        }
        bookingId = result.bookingId;
        bookingNumber = result.bookingNumber;
        paymentRequired = result.paymentRequired;
        setPendingBooking({
          bookingId: result.bookingId,
          bookingNumber: result.bookingNumber,
          paymentRequired: result.paymentRequired,
        });
      }

      if (requiresPaymentProof && paymentRequired) {
        let bookingFileId = uploadedProofFileId;
        if (!bookingFileId && proofFile) {
          const preparedProof = await prepareImageForUpload(proofFile);
          const uploadData = new FormData();
          uploadData.append('file', preparedProof);
          uploadData.append('bookingId', bookingId);
          uploadData.append('category', 'payment-proofs');

          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: uploadData,
          });
          const uploadPayload: unknown = await uploadResponse.json().catch(() => null);
          if (
            !uploadResponse.ok ||
            !isRecord(uploadPayload) ||
            uploadPayload.success !== true ||
            typeof uploadPayload.bookingFileId !== 'string'
          ) {
            throw new Error(responseError(uploadPayload, 'تم حجز الموعد بنجاح لكن تعذر رفع ملف إثبات التحويل. اضغط تأكيد الحجز للمحاولة مرة أخرى.'));
          }
          bookingFileId = uploadPayload.bookingFileId;
          setUploadedProofFileId(bookingFileId);
        }

        const proofData = new FormData();
        proofData.append('bookingId', bookingId);
        proofData.append('paymentMethodId', selectedPaymentMethodId);
        proofData.append('bookingFileId', bookingFileId);
        proofData.append('senderName', senderName.trim());
        proofData.append('senderPhoneOrAccount', senderPhoneOrAccount.trim());
        proofData.append('referenceNumber', referenceNumber.trim());
        proofData.append('amountSubmitted', String(parsedAmount));
        proofData.append('transferTimestamp', new Date(transferTimestamp || Date.now()).toISOString());

        const proofResult = await uploadPaymentProofAction(proofData);
        if ('error' in proofResult && proofResult.error) {
          showError(proofResult.error);
          return;
        }
      }

      setPendingBooking(null);
      if (user) {
        router.push(`/account/bookings/${bookingId}`);
      } else {
        setGuestConfirmed({
          bookingNumber: bookingNumber || 'BQ-CONFIRMED',
          serviceName: service.nameAr,
          dateStr: selectedSlot.timeStr,
          contactPhone: phone,
        });
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'تعذر إتمام الحجز. حاول مرة أخرى.');
    } finally {
      setBookingSubmitting(false);
    }
  }

  async function onProofFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    let file = input.files?.[0] ?? null;
    setUploadedProofFileId('');
    setUiError(null);
    if (!file) {
      setProofFile(null);
      setProofPreviewUrl('');
      return;
    }
    // The format is not checked here. Phones report wrong or empty types, and
    // the server accepts any picture or PDF, so a customer is never stopped at
    // this step because of the file's type.
    if (file.size > MAX_UPLOAD_BYTES) {
      file = await shrinkPictureToFit(file);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setProofFile(null);
      setProofPreviewUrl('');
      input.value = '';
      showError('حجم الملف يجب ألا يتجاوز 10 ميجابايت.', 'payment-proof-file');
      return;
    }
    setProofFile(file);
    if (file.type.startsWith('image/')) {
      setProofPreviewUrl(URL.createObjectURL(file));
    } else {
      setProofPreviewUrl('');
    }
  }

  function copyToClipboard(text: string, id: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedMethodId(id);
      setTimeout(() => setCopiedMethodId(''), 2000);
    }
  }

  const invalidField = (fieldId: string) => uiError?.fieldId === fieldId;
  const stepLabel = `الخطوة ${step} من 5`;
  const progress = Math.round((step / 5) * 100);

  // If Guest completed booking, show luxurious confirmation card
  if (guestConfirmed) {
    return (
      <section dir="rtl" className="rounded-3xl border border-[#cea355]/40 bg-[#121212] p-8 sm:p-12 text-center shadow-2xl space-y-8 animate-in fade-in duration-500">
        <div className="w-16 h-16 rounded-2xl gold-gradient flex items-center justify-center mx-auto shadow-xl shadow-[#cea355]/20 text-white">
          <CheckCircle2 className="w-9 h-9 text-white" />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl sm:text-4xl font-black text-white">
            شكراً لك! تم حجز خدمتك بنجاح
          </h1>
          <p className="text-white text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
            تم تسجيل طلب حجز خدمة <strong className="text-[#edce8b]">{guestConfirmed.serviceName}</strong> وسيقوم فريق خدمة عملاء بريق بالتواصل معك لتأكيد وصول الفريق في الموعد المحدد.
          </p>
        </div>

        {/* Booking Details Card */}
        <div className="max-w-md mx-auto p-6 sm:p-8 rounded-3xl bg-[#171717] border border-neutral-700 space-y-4 text-right">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <span className="text-xs font-bold text-white">رقم الحجز:</span>
            <span className="text-sm font-mono font-black text-[#edce8b] tracking-wider" dir="ltr">
              {guestConfirmed.bookingNumber}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <span className="text-xs font-bold text-white">الخدمة:</span>
            <span className="text-xs font-bold text-white">{guestConfirmed.serviceName}</span>
          </div>
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <span className="text-xs font-bold text-white">الموعد:</span>
            <span className="text-xs font-bold text-white">{guestConfirmed.dateStr}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">رقم التواصل:</span>
            <span className="text-xs font-bold text-white font-mono" dir="ltr">{guestConfirmed.contactPhone}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          {supportWhatsApp && (
            <a
              href={whatsappHref(
                supportWhatsApp,
                `مرحباً، أود المتابعة بخصوص حجز رقم ${guestConfirmed.bookingNumber} لخدمة ${guestConfirmed.serviceName}`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/25 font-bold text-xs transition-all w-full sm:w-auto"
            >
              <MessageCircle className="w-4 h-4" />
              <span>متابعة الحجز عبر WhatsApp</span>
            </a>
          )}
          <Link
            href="/services"
            className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl gold-gradient text-white font-bold text-xs hover:brightness-110 transition-all w-full sm:w-auto"
          >
            استعراض كافة الخدمات والباقات
          </Link>
        </div>
      </section>
    );
  }

  if (coverageAreas.length === 0) {
    return (
      <section dir="rtl" className="rounded-3xl border border-amber-400/25 bg-amber-400/[0.06] p-8 text-center space-y-4">
        <MapPin aria-hidden="true" className="mx-auto size-10 text-white" />
        <h1 className="text-2xl font-bold text-white">الحجز غير متاح مؤقتًا</h1>
        <p className="text-white text-sm">لا توجد منطقة تغطية نشطة لهذه الخدمة حاليًا.</p>
        {supportWhatsApp ? (
          <a href={whatsappHref(supportWhatsApp, `أرغب في الاستفسار عن تغطية خدمة ${service.nameAr}`)} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-xl gold-gradient px-5 py-3 font-bold text-white">
            <MessageCircle aria-hidden="true" className="size-4" /> تواصل عبر واتساب
          </a>
        ) : (
          <Link href="/services" className="mt-6 inline-flex rounded-xl border border-neutral-700 px-5 py-3 font-semibold text-white hover:border-[#cea355]">
            العودة إلى الخدمات
          </Link>
        )}
      </section>
    );
  }

  return (
    <section dir="rtl" aria-labelledby="booking-title" className="space-y-8">
      
      {/* Step Progress Bar */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-4 text-xs font-bold">
          <span className="text-white">{stepLabel}</span>
          <span className="text-white">{service.nameAr}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800" aria-hidden="true">
          <div className="h-full rounded-full gold-gradient transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Title */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#141414] border border-[#cea355]/40 text-xs font-bold text-white mb-3">
          <Sparkles className="w-3.5 h-3.5 text-white" />
          <span>حجز خدمة مباشر بدون تعقيد</span>
        </div>
        <h1 id="booking-title" className="text-3xl sm:text-4xl font-black text-white">
          حجز {service.nameAr}
        </h1>
        <p className="mt-2 text-sm text-white leading-relaxed">
          أكمل البيانات التالية وسنقوم بتأكيد السعر والموعد فوراً.
        </p>

        {!user && (
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#cea355]/30 bg-[#cea355]/5 text-xs">
            <div className="flex items-center gap-2.5 text-neutral-300">
              <UserRound className="size-4 text-[#cea355] shrink-0" />
              <span>أنت تحجز الآن كضيف سريع دون الحاجة لإنشاء حساب مسبق أو تعيين كلمة مرور.</span>
            </div>
            <Link
              href="/login?callback=/services"
              className="text-[#edce8b] hover:underline font-bold shrink-0 text-xs flex items-center gap-1"
            >
              <span>لديك حساب؟ سجل دخولك</span>
              <span dir="ltr">←</span>
            </Link>
          </div>
        )}
      </div>

      {uiError && (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm font-bold text-red-200 focus-visible:ring-2 focus-visible:ring-red-300"
        >
          {uiError.message}
        </div>
      )}

      <div className="rounded-3xl border border-neutral-800 bg-[#101010] p-6 sm:p-10 shadow-2xl">
        
        {/* Step 1: Vehicle Category & Details (MERGED) */}
        {step === 1 && (
          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl gold-gradient p-3 text-white"><Car aria-hidden="true" className="w-6 h-6" /></div>
              <div>
                <h2 className="text-xl font-bold text-white">بيانات وفئة السيارة</h2>
                <p className="mt-1 text-xs text-white">حدد فئة السيارة وماركتها وموديلها ولونها وسنة الصنع.</p>
              </div>
            </div>

            {vehicles.length > 0 && (
              <fieldset>
                <legend className="mb-3 text-xs font-bold text-white">سياراتي المحفوظة</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {vehicles.map((vehicle) => (
                    <label key={vehicle.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${selectedVehicleId === vehicle.id ? 'border-[#cea355] bg-[#cea355]/10' : 'border-neutral-800 hover:border-neutral-700'}`}>
                      <input type="radio" name="saved-vehicle" value={vehicle.id} checked={selectedVehicleId === vehicle.id} onChange={() => selectVehicle(vehicle.id)} className="mt-1 size-4 accent-[#cea355]" />
                      <span>
                        <span className="block font-bold text-white">{vehicle.make} {vehicle.model} {vehicle.year}</span>
                        <span className="mt-1 block text-xs text-white">{vehicle.color}{vehicle.plateNumber ? ` · ${vehicle.plateNumber}` : ''}{vehicle.isDefault ? ' · الافتراضية' : ''}</span>
                      </span>
                    </label>
                  ))}
                  <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${selectedVehicleId === 'new' ? 'border-[#cea355] bg-[#cea355]/10' : 'border-neutral-800 hover:border-neutral-700'}`}>
                    <input type="radio" name="saved-vehicle" value="new" checked={selectedVehicleId === 'new'} onChange={() => selectVehicle('new')} className="mt-1 size-4 accent-[#cea355]" />
                    <span>
                      <span className="block font-bold text-white">سيارة جديدة</span>
                      <span className="mt-1 block text-xs text-white">أدخل بيانات السيارة بالأسفل.</span>
                    </span>
                  </label>
                </div>
              </fieldset>
            )}

            {selectedVehicleId === 'new' && (
              <fieldset>
                <legend className="mb-3 text-xs font-bold text-white">حجم وفئة السيارة</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {vehicleSizes.map((size) => (
                    <label key={size.value} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${vehicleSize === size.value ? 'border-[#cea355] bg-[#cea355]/10' : 'border-neutral-800 hover:border-neutral-700'}`}>
                      <input type="radio" name="vehicle-size" value={size.value} checked={vehicleSize === size.value} onChange={() => setVehicleSize(size.value)} className="mt-1 size-4 accent-[#cea355]" />
                      <span>
                        <span className="block font-bold text-white">{size.label}</span>
                        <span className="mt-1 block text-xs text-white">{size.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {selectedVehicle ? (
              <div className="rounded-2xl border border-neutral-700 bg-[#161616] p-5">
                <p className="font-bold text-white">{selectedVehicle.make} {selectedVehicle.model} · {selectedVehicle.year}</p>
                <p className="mt-1 text-xs text-white">{selectedVehicle.color}{selectedVehicle.plateNumber ? ` · ${selectedVehicle.plateNumber}` : ''}</p>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold text-white">مواصفات وتفاصيل السيارة</h3>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="vehicle-make" className={labelClass}>الماركة (مثل: مرسيدس، بي إم دبليو، تويوتا)</label>
                    <input id="vehicle-make" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} maxLength={100} className={inputClass} placeholder="الماركة" />
                  </div>
                  <div>
                    <label htmlFor="vehicle-color" className={labelClass}>لون السيارة</label>
                    <input id="vehicle-color" value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} maxLength={50} className={inputClass} placeholder="أسود، أبيض، رمادي..." />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="plate-number" className={labelClass}>رقم اللوحة <span className="text-neutral-400 font-normal">(اختياري)</span></label>
                    <input id="plate-number" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} maxLength={20} className={inputClass} placeholder="أ ب ج 1234" />
                  </div>
                </div>
              </div>
            )}

            {subscriptions.length > 0 && (
              <fieldset>
                <legend className="mb-3 text-xs font-bold text-white">استخدام باقة اشتراك نشطة</legend>
                <div className="space-y-3">
                  <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${selectedSubscriptionId === '' ? 'border-[#cea355] bg-[#cea355]/10' : 'border-neutral-800'}`}>
                    <input type="radio" name="subscription" checked={selectedSubscriptionId === ''} onChange={() => setSelectedSubscriptionId('')} className="mt-1 size-4 accent-[#cea355]" />
                    <span>
                      <span className="block font-bold text-white">بدون اشتراك</span>
                      <span className="mt-1 block text-xs text-white">احتساب السعر المباشر للخدمة.</span>
                    </span>
                  </label>
                  {subscriptions.map((subscription) => {
                    const issue = subscriptionIssue(subscription, service.id, selectedArea?.zone.branchId, selectedVehicleId);
                    return (
                      <label key={subscription.id} className={`flex gap-3 rounded-2xl border p-4 ${issue ? 'cursor-not-allowed border-neutral-900 opacity-55' : 'cursor-pointer'} ${selectedSubscriptionId === subscription.id ? 'border-[#cea355] bg-[#cea355]/10' : 'border-neutral-800'}`}>
                        <input type="radio" name="subscription" value={subscription.id} checked={selectedSubscriptionId === subscription.id} disabled={Boolean(issue)} onChange={() => setSelectedSubscriptionId(subscription.id)} className="mt-1 size-4 accent-[#cea355]" />
                        <span>
                          <span className="block font-bold text-white">{subscription.plan.nameAr}</span>
                          <span className="mt-1 block text-xs text-white">{subscription.remainingVisits} زيارات متبقية</span>
                          {issue && <span className="mt-2 block text-xs text-amber-300 font-bold">{issue}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="flex flex-col sm:flex-row justify-end pt-4">
              <button data-testid="booking-step-1-next" type="button" onClick={() => { if (validateVehicleDetails()) goToStep(2); }} className="inline-flex items-center justify-center gap-2 rounded-xl gold-gradient px-6 py-3.5 font-bold text-white hover:brightness-110 w-full sm:w-auto text-base">
                <span>التالي: تحديد الموقع</span>
                <ArrowLeft aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Location / Zone & Compound Dropdown */}
        {step === 2 && (
          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl gold-gradient p-3 text-white"><MapPin aria-hidden="true" className="w-6 h-6" /></div>
              <div>
                <h2 className="text-xl font-bold text-white">عنوان تنفيذ الخدمة</h2>
                <p className="mt-1 text-xs text-white">اختر المنطقة الرئيسية ثم الحي أو الكمبوند.</p>
              </div>
            </div>

            {addresses.length > 0 && (
              <fieldset>
                <legend className="mb-3 text-xs font-bold text-white">عناويني المحفوظة</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {addresses.map((address) => {
                    const area = areaForAddress(address, coverageAreas);
                    return (
                      <label
                        key={address.id}
                        className={`flex gap-3 rounded-2xl border p-4 transition-all ${
                          area
                            ? 'cursor-pointer hover:border-neutral-700'
                            : 'cursor-not-allowed border-neutral-800/60 bg-neutral-900/30 opacity-60'
                        } ${selectedAddressId === address.id ? 'border-[#cea355] bg-[#cea355]/10' : 'border-neutral-800'}`}
                      >
                        <input
                          type="radio"
                          name="saved-address"
                          checked={selectedAddressId === address.id}
                          disabled={!area}
                          onChange={() => selectAddress(address.id)}
                          className="mt-1 size-4 accent-[#cea355]"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="block font-bold text-white">
                              {address.compound || address.city}
                              {address.isDefault ? ' · الافتراضي' : ''}
                            </span>
                            {area ? (
                              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 font-bold">
                                {area.zone.branch?.nameAr || 'الفرع الرئيسي'} · متاح للحجز
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 font-bold">
                                خارج التغطية
                              </span>
                            )}
                          </div>
                          <span className="mt-1 block text-xs text-neutral-400">
                            {address.street}، {address.buildingNumber}
                          </span>
                          {!area && (
                            <span className="mt-1.5 block text-[11px] text-amber-400/80">
                              هذا العنوان مسجل خارج نطاق التغطية لفروع هذه الخدمة
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                  <label
                    className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-all hover:border-neutral-700 ${
                      selectedAddressId === 'new' ? 'border-[#cea355] bg-[#cea355]/10' : 'border-neutral-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="saved-address"
                      checked={selectedAddressId === 'new'}
                      onChange={() => selectAddress('new')}
                      className="mt-1 size-4 accent-[#cea355]"
                    />
                    <div>
                      <span className="block font-bold text-white">عنوان جديد</span>
                      <span className="mt-1 block text-xs text-neutral-400">
                        اختر الفرع والمنطقة والحي بالأسفل.
                      </span>
                    </div>
                  </label>
                </div>
              </fieldset>
            )}

            {/* 2-Tier Location Selection: Branch -> Area/Compound */}
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="booking-branch" className={labelClass}>
                  الفرع المنفذ
                </label>
                <select
                  id="booking-branch"
                  value={selectedBranchId}
                  disabled={selectedAddressId !== 'new'}
                  onChange={(e) => selectBranch(e.target.value)}
                  className={inputClass}
                >
                  {bookingBranches.map((b) => (
                    <option key={b.id} value={b.id} className="bg-neutral-900 text-white">
                      {b.nameAr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="coverage-area" className={labelClass}>
                  المنطقة / الكمبوند
                </label>
                <select
                  id="coverage-area"
                  value={selectedAreaId}
                  disabled={selectedAddressId !== 'new'}
                  onChange={(e) => {
                    setSelectedAreaId(e.target.value);
                    setSelectedSubscriptionId('');
                  }}
                  aria-invalid={invalidField('coverage-area')}
                  className={inputClass}
                >
                  {branchCoverageAreas.length > 0 ? (
                    branchCoverageAreas.map((area) => (
                      <option key={area.id} value={area.id} className="bg-neutral-900 text-white">
                        {area.compound} {area.city ? `(${area.city})` : ''}
                      </option>
                    ))
                  ) : (
                    <option value="" className="bg-neutral-900 text-neutral-400">
                      لا توجد مناطق أو كمبوندات مضافة لهذا الفرع
                    </option>
                  )}
                </select>
              </div>
            </div>

            {selectedAddress ? (
              <div className="rounded-2xl border border-neutral-700 bg-[#161616] p-5">
                <p className="font-bold text-white">{selectedAddress.compound}، {selectedAddress.street}</p>
                <p className="mt-1 text-xs text-white">{selectedAddress.buildingNumber}{selectedAddress.unitNumber ? `، وحدة ${selectedAddress.unitNumber}` : ''}</p>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="street" className={labelClass}>اسم الشارع</label>
                  <input id="street" value={street} onChange={(e) => setStreet(e.target.value)} maxLength={200} className={inputClass} placeholder="اسم الشارع" />
                </div>
                <div>
                  <label htmlFor="building-number" className={labelClass}>رقم المبنى أو الفيلا</label>
                  <input id="building-number" value={buildingNumber} onChange={(e) => setBuildingNumber(e.target.value)} maxLength={100} className={inputClass} placeholder="رقم الفيلا أو المبنى" />
                </div>
                <div>
                  <label htmlFor="unit-number" className={labelClass}>رقم الوحدة <span className="text-neutral-400 font-normal">(اختياري)</span></label>
                  <input id="unit-number" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} maxLength={50} className={inputClass} placeholder="رقم الشقة أو الوحدة" />
                </div>
                <div>
                  <label htmlFor="landmark" className={labelClass}>علامة مميزة <span className="text-neutral-400 font-normal">(اختياري)</span></label>
                  <input id="landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} maxLength={200} className={inputClass} placeholder="بجوار كذا..." />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="gate-instructions" className={labelClass}>تعليمات البوابة أو الدخول <span className="text-neutral-400 font-normal">(اختياري)</span></label>
                  <textarea id="gate-instructions" rows={2} value={gateInstructions} onChange={(e) => setGateInstructions(e.target.value)} maxLength={500} className={inputClass} placeholder="تعليمات الأمن أو الدخول..." />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="location-url" className={labelClass}>رابط الموقع على الخريطة <span className="text-neutral-400 font-normal">(اختياري)</span></label>
                  <input id="location-url" type="url" dir="ltr" value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} placeholder="https://maps.google.com/..." className={inputClass} />
                </div>
              </div>
            )}

            {selectedAddress && !selectedAddressArea && supportWhatsApp ? (
              <div data-testid="outside-coverage-contact" className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm text-amber-100">
                <p className="font-bold">العنوان المحفوظ خارج نطاق التغطية الحالي.</p>
                <p className="mt-1 text-xs leading-6 text-amber-100/80">يمكنك اختيار عنوان جديد من المناطق المتاحة، أو التواصل معنا للتحقق من إمكانية الخدمة.</p>
                <a href={whatsappHref(supportWhatsApp, `أرغب في الاستفسار عن تغطية خدمة ${service.nameAr}`)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-2.5 text-xs font-bold text-emerald-200 hover:bg-emerald-400/20">
                  تواصل معنا عبر واتساب
                </a>
              </div>
            ) : null}

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4">
              <button type="button" onClick={() => goToStep(1)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-700 px-5 py-3.5 font-semibold text-white hover:border-white w-full sm:w-auto">
                <ArrowRight aria-hidden="true" className="size-4" />
                <span>السابق</span>
              </button>
              <button data-testid="booking-step-2-next" type="button" onClick={() => { if (validateAddress()) goToStep(3); }} className="inline-flex items-center justify-center gap-2 rounded-xl gold-gradient px-6 py-3.5 font-bold text-white hover:brightness-110 w-full sm:w-auto text-base">
                <span>التالي: اختيار الموعد</span>
                <ArrowLeft aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Time Slot Selection */}
        {step === 3 && (
          <div aria-busy={loadingSlots} className="space-y-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl gold-gradient p-3 text-white">
                  <CalendarDays aria-hidden="true" className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">اختر موعد الخدمة</h2>
                  <p className="mt-1 text-xs text-white">المواعيد المتاحة محسوبة بدقة حسب جاهزية فرق العمل والجدول التشغيلي.</p>
                </div>
              </div>

              {/* View Mode Switcher */}
              <div className="flex items-center gap-1.5 p-1 bg-[#141414] border border-neutral-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setCalendarViewMode('quick')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    calendarViewMode === 'quick'
                      ? 'bg-[#cea355] text-black shadow-md'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                  }`}
                >
                  الأيام القريبة (7 أيام)
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarViewMode('month')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    calendarViewMode === 'month'
                      ? 'bg-[#cea355] text-black shadow-md'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                  }`}
                >
                  <Calendar className="size-3.5" />
                  <span>التقويم الكامل</span>
                </button>
              </div>
            </div>

            {/* Selected Date Summary Banner */}
            <div className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-[#cea355]/30 bg-[#cea355]/10 text-white">
              <div className="flex items-center gap-3">
                <div className="size-2 rounded-full bg-[#edce8b] animate-pulse" />
                <span className="text-xs sm:text-sm font-bold text-white">
                  اليوم المختار:{' '}
                  <strong className="text-[#edce8b] text-sm sm:text-base font-black">
                    {formatSelectedDateArabic(selectedDate)}
                  </strong>
                </span>
              </div>
              <span className="text-[11px] font-semibold text-neutral-400 hidden sm:inline-block">
                متاح حتى 90 يومًا مسبقًا
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="booking-date" className="text-xs font-bold text-neutral-300">تاريخ مخصص:</label>
              <input
                id="booking-date"
                type="date"
                value={selectedDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => {
                  setSelectedDate(event.target.value);
                  setSelectedSlot(null);
                }}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm font-bold text-white focus:border-[#cea355] focus:outline-none focus:ring-2 focus:ring-[#cea355]/30"
              />
            </div>

            {/* Mode 1: Quick 7-Day Selector */}
            {calendarViewMode === 'quick' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className={labelClass}>أيام الحجز السريعة</label>
                  <button
                    type="button"
                    onClick={() => setCalendarViewMode('month')}
                    className="text-xs font-bold text-[#edce8b] hover:underline"
                  >
                    فتح التقويم الكامل لشهور قادمة ←
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  {upcomingDays.map((day) => {
                    const isSelected = selectedDate === day.dateStr;
                    return (
                      <button
                        key={day.dateStr}
                        type="button"
                        onClick={() => {
                          setSelectedDate(day.dateStr);
                          setSelectedSlot(null);
                        }}
                        className={`flex flex-col items-center justify-center p-3 sm:p-3.5 rounded-2xl border transition-all text-center relative min-h-[96px] ${
                          isSelected
                            ? 'border-[#cea355] bg-[#cea355]/20 shadow-lg shadow-[#cea355]/15 ring-2 ring-[#cea355]'
                            : 'border-neutral-800 bg-[#161616] hover:border-neutral-700 hover:bg-[#1f1f1f]'
                        }`}
                      >
                        <div className="h-5 flex items-center justify-center mb-1">
                          {day.isToday ? (
                            <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#cea355] text-black whitespace-nowrap shadow-sm">
                              اليوم
                            </span>
                          ) : day.isTomorrow ? (
                            <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-white/20 text-white whitespace-nowrap shadow-sm">
                              غداً
                            </span>
                          ) : (
                            <span className="inline-block h-4" />
                          )}
                        </div>
                        <span className={`text-sm font-bold block leading-tight ${isSelected ? 'text-[#edce8b]' : 'text-white'}`}>
                          {day.dayName}
                        </span>
                        <span className="text-xs text-neutral-400 font-mono mt-1 block leading-none">
                          {day.dayNumber} {day.monthName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mode 2: Full Interactive Month Calendar */}
            {calendarViewMode === 'month' && (
              <div className="rounded-2xl border border-neutral-800 bg-[#0d0d0d] p-4 sm:p-6 space-y-4">
                {/* Month Navigator Header */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="size-5 text-[#edce8b]" />
                    <h3 className="text-base sm:text-lg font-black text-white">
                      {monthNamesArabic[calendarMonth]} {calendarYear}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={prevMonth}
                      className="size-9 flex items-center justify-center rounded-xl border border-neutral-800 bg-[#171717] hover:bg-[#222] text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="الشهر السابق"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={nextMonth}
                      className="size-9 flex items-center justify-center rounded-xl border border-neutral-800 bg-[#171717] hover:bg-[#222] text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="الشهر التالي"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                  </div>
                </div>

                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-neutral-400 pb-2 border-b border-neutral-800">
                  <span>الأحد</span>
                  <span>الاثنين</span>
                  <span>الثلاثاء</span>
                  <span>الأربعاء</span>
                  <span>الخميس</span>
                  <span>الجمعة</span>
                  <span>السبت</span>
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {currentMonthDays.map((day) => {
                    const isSelected = selectedDate === day.dateStr;
                    const isDisabled = day.isPast || day.isBeyondMax;

                    return (
                      <button
                        key={day.dateStr}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          if (isDisabled) return;
                          setSelectedDate(day.dateStr);
                          setSelectedSlot(null);
                        }}
                        className={`relative flex flex-col items-center justify-center py-2.5 sm:py-3.5 px-1 rounded-xl sm:rounded-2xl border text-center transition-all ${
                          isDisabled
                            ? 'border-transparent text-neutral-600 bg-neutral-950/40 cursor-not-allowed opacity-35'
                            : isSelected
                            ? 'border-[#cea355] bg-[#cea355]/25 shadow-lg shadow-[#cea355]/20 ring-2 ring-[#cea355] text-[#edce8b] font-black'
                            : day.isCurrentMonth
                            ? 'border-neutral-800/80 bg-[#141414] text-white hover:border-neutral-600 hover:bg-[#1f1f1f]'
                            : 'border-transparent text-neutral-500 bg-[#0f0f0f] hover:border-neutral-800 hover:text-neutral-300'
                        }`}
                      >
                        {day.isToday && (
                          <span className="absolute top-1 right-1 size-1.5 sm:size-2 rounded-full bg-[#cea355] ring-2 ring-black" />
                        )}
                        <span className="text-xs sm:text-base font-black leading-tight">
                          {day.dayNumber}
                        </span>
                        <span className="text-[10px] mt-0.5 leading-none hidden sm:block opacity-75">
                          {day.isToday ? 'اليوم' : day.isTomorrow ? 'غداً' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Slot Selection */}
            <div aria-live="polite" className="space-y-3">
              <div className="flex items-center justify-between">
                <label className={labelClass}>المواعيد المتاحة ليوم {formatSelectedDateArabic(selectedDate)}</label>
                {availableSlots.length > 0 && (
                  <span className="text-xs font-bold text-emerald-400">
                    ({availableSlots.length} موعد متاح)
                  </span>
                )}
              </div>

              {loadingSlots ? (
                <div className="flex items-center justify-center gap-3 rounded-2xl border border-neutral-800 py-10 text-white font-bold bg-[#141414]">
                  <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-[#cea355]" />
                  <span>جاري تحميل المواعيد المتاحة…</span>
                </div>
              ) : slotsError ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm font-bold text-amber-200">
                  <p>{slotsError}</p>
                  <button type="button" onClick={() => setAvailabilityRetry((v) => v + 1)} className="mt-3 rounded-lg border border-amber-300/40 px-4 py-1.5 text-xs font-bold hover:bg-amber-300/10">
                    إعادة المحاولة
                  </button>
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-8 text-center text-white space-y-2">
                  <p className="font-bold text-sm text-neutral-300">
                    لا توجد مواعيد متاحة في هذا اليوم.
                  </p>
                  <p className="text-xs text-neutral-400">
                    جميع المواعيد محجوزة أو مغلقة في هذا اليوم. يُرجى اختيار يوم آخر من التقويم بالأعلى.
                  </p>
                </div>
              ) : (
                <fieldset>
                  <legend className="sr-only">المواعيد المتاحة في هذا اليوم</legend>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {availableSlots.map((slot) => {
                      const isSelected = selectedSlot?.startAt === slot.startAt;
                      return (
                        <label
                          key={slot.startAt}
                          className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-all ${
                            isSelected
                              ? 'border-[#cea355] bg-[#cea355]/20 shadow-lg shadow-[#cea355]/15 ring-2 ring-[#cea355]'
                              : 'border-neutral-800 bg-[#161616] hover:border-neutral-700 hover:bg-[#1f1f1f]'
                          }`}
                        >
                          <input
                            type="radio"
                            name="booking-slot"
                            checked={isSelected}
                            onChange={() => {
                              if (pendingBooking?.bookingId) {
                                const fd = new FormData();
                                fd.append('bookingId', pendingBooking.bookingId);
                                void releasePendingBookingHoldAction(fd);
                                setPendingBooking(null);
                              }
                              setSelectedSlot(slot);
                            }}
                            className="size-4 accent-[#cea355]"
                          />
                          <span className="flex-1">
                            <span className="flex items-center gap-2 font-black text-white text-sm">
                              <Clock3 aria-hidden="true" className="size-4 text-[#cea355]" />
                              <span>{format12HourTime(slot.timeStr)}</span>
                            </span>
                            <span className="mt-1 block text-xs text-neutral-400 font-semibold">
                              مدة الخدمة: {slot.totalDurationMinutes} دقيقة
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4">
              <button type="button" onClick={() => goToStep(2)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-700 px-5 py-3 font-semibold text-white hover:border-white w-full sm:w-auto">
                <ArrowRight aria-hidden="true" className="size-4" />
                <span>السابق</span>
              </button>
              <button data-testid="booking-step-3-next" type="button" disabled={!selectedSlot || loadingSlots} onClick={() => { if (!selectedSlot) { showError('اختر موعدًا متاحًا.', 'booking-slots'); return; } goToStep(4); }} className="inline-flex items-center justify-center gap-2 rounded-xl gold-gradient px-6 py-3 font-bold text-white hover:brightness-110 disabled:opacity-50 w-full sm:w-auto">
                <span>التالي: بيانات التواصل</span>
                <ArrowLeft aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Contact Details */}
        {step === 4 && (
          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl gold-gradient p-3 text-white"><UserRound aria-hidden="true" className="w-6 h-6" /></div>
              <div>
                <h2 className="text-xl font-bold text-white">بيانات التواصل</h2>
                <p className="mt-1 text-xs text-white">سنستخدم هذه البيانات للتنسيق معك وتأكيد وصول الفريق.</p>
              </div>
            </div>

            {useSavedContact ? (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 space-y-2">
                <p className="font-bold text-emerald-200">بيانات حسابك محفوظة ومسجلة:</p>
                <p className="text-sm font-bold text-white">{fullName} · <span dir="ltr">{phone}</span> · <span dir="ltr">{whatsapp}</span></p>
                <Link href="/account/profile" className="inline-flex text-xs font-bold text-white underline underline-offset-4">تعديل بيانات الحساب</Link>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="contact-name" className={labelClass}>الاسم الكامل</label>
                  <input id="contact-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={200} className={inputClass} placeholder="الاسم الكامل" />
                </div>
                <div>
                  <label htmlFor="contact-phone" className={labelClass}>رقم الهاتف للاتصال</label>
                  <input id="contact-phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} onChange={(e) => setPhone(cleanPhoneInput(e.target.value))} maxLength={20} className={inputClass} placeholder="01XXXXXXXXX" />
                </div>
                <div>
                  <label htmlFor="contact-whatsapp" className={labelClass}>رقم واتساب للتنسيق</label>
                  <input id="contact-whatsapp" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={whatsapp} onChange={(e) => setWhatsapp(cleanPhoneInput(e.target.value))} maxLength={20} className={inputClass} placeholder="01XXXXXXXXX" />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="customer-notes" className={labelClass}>ملاحظات خاصة للفريق <span className="text-neutral-400 font-normal">(اختياري)</span></label>
              <textarea id="customer-notes" rows={3} value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} maxLength={1000} className={inputClass} placeholder="أي تعليمات أو ملاحظات إضافية ترغب في إبلاغها للفريق..." />
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4">
              <button type="button" onClick={() => goToStep(3)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-700 px-5 py-3.5 font-semibold text-white hover:border-white w-full sm:w-auto">
                <ArrowRight aria-hidden="true" className="size-4" />
                <span>السابق</span>
              </button>
              <button data-testid="booking-step-4-next" type="button" onClick={() => { if (validateContact()) goToStep(5); }} className="inline-flex items-center justify-center gap-2 rounded-xl gold-gradient px-6 py-3.5 font-bold text-white hover:brightness-110 w-full sm:w-auto text-base">
                <span>مراجعة وتأكيد الحجز</span>
                <ArrowLeft aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Review & Confirmation */}
        {step === 5 && selectedArea && selectedSlot && (
          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl gold-gradient p-3 text-white"><ClipboardCheck aria-hidden="true" className="w-6 h-6" /></div>
              <div>
                <h2 className="text-xl font-bold text-white">مراجعة تفاصيل الحجز</h2>
                <p className="mt-1 text-xs text-white">راجع بيانات الحجز والخدمة بدقة قبل التأكيد النهائي.</p>
              </div>
            </div>

            <div className="divide-y divide-neutral-800 rounded-2xl border border-neutral-800 bg-[#0c0c0c] px-6 text-sm">
              <div className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]">
                <span className="font-bold text-white">الخدمة</span>
                <span className="font-bold text-white">{service.nameAr}</span>
              </div>
              <div className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]">
                <span className="font-bold text-white">السيارة</span>
                <span className="font-bold text-white">{vehicleMake} · {vehicleColor}{plateNumber ? ` · ${plateNumber}` : ''}</span>
              </div>
              <div className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]">
                <span className="font-bold text-white">الموقع</span>
                <span className="font-bold text-white">{selectedArea.compound}، {street}، {buildingNumber}</span>
              </div>
              <div className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]">
                <span className="font-bold text-white">الموعد المحدد</span>
                <span className="font-bold text-white">{dateFormatter.format(new Date(selectedSlot.startAt))}</span>
              </div>
              <div className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]">
                <span className="font-bold text-white">بيانات التواصل</span>
                <span className="font-bold text-white">{fullName} · <span dir="ltr">{phone}</span></span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#cea355]/40 bg-[#cea355]/10 p-6 space-y-3">
              {subscriptionApplies ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-bold text-white">طريقة المحاسبة</span>
                    <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-black text-emerald-300">
                      مشمول بالاشتراك النشط
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-xs font-bold text-white/80">
                    <span>قيمة الخدمة الأساسية:</span>
                    <span className="text-emerald-400 font-bold">0 ج.م (مغطاة بالكامل ضمن باقتك)</span>
                  </div>
                  {addonsPrice > 0 && (
                    <div className="flex items-center justify-between gap-4 text-xs font-bold text-white/80">
                      <span>إضافات اختيارية:</span>
                      <span className="text-[#edce8b] font-bold">{formatCurrency(addonsPrice)} (تحصيل عند إكمال الخدمة)</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4 text-xs font-bold text-emerald-300 pt-2 border-t border-[#cea355]/20">
                    <span>المطلوب دفعه الآن:</span>
                    <span className="text-lg font-black text-emerald-400">0 ج.م (تأكيد فوري دون دفع مسبق)</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-bold text-white">إجمالي قيمة الخدمة</span>
                    <strong className="text-2xl font-black text-[#edce8b]">{formatCurrency(estimatedTotal)}</strong>
                  </div>
                  {estimatedCreditApplied > 0 && (
                    <div className="flex items-center justify-between gap-4 text-xs font-bold text-emerald-300">
                      <span>رصيد التعويضات المستخدم:</span>
                      <span>-{formatCurrency(estimatedCreditApplied)}</span>
                    </div>
                  )}
                  {estimatedTransferAmount > 0 && (
                    <div className="pt-2 border-t border-[#cea355]/25 flex items-center justify-between gap-4 text-xs font-bold text-white">
                      <span>المبلغ المطلوب للدفعة المسبقة (عربون الحجز):</span>
                      <span className="font-black text-[#edce8b] text-base">{formatCurrency(estimatedTransferAmount)}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Payment & Transfer Proof Section (Directly embedded in Step 5 when deposit is required) */}
            {estimatedTransferAmount > 0 && (
              <div className="space-y-6 rounded-2xl border border-neutral-800 bg-[#0e0e0e] p-6">
                <fieldset id="payment-methods" aria-invalid={invalidField('payment-methods')}>
                  <legend className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                    <CreditCard aria-hidden="true" className="size-4 text-[#edce8b]" />
                    <span>اختر وسيلة التحويل المعتمدة لسداد العربون</span>
                  </legend>
                  {availablePaymentMethods.length > 0 ? (
                    <div className="space-y-3">
                      {availablePaymentMethods.map((method) => (
                        <label key={method.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-all ${selectedPaymentMethodId === method.id ? 'border-[#cea355] bg-[#cea355]/15 shadow-lg shadow-[#cea355]/10' : 'border-neutral-800 hover:border-neutral-700'}`}>
                          <input type="radio" name="payment-method" value={method.id} checked={selectedPaymentMethodId === method.id} onChange={() => setSelectedPaymentMethodId(method.id)} className="mt-1 size-4 accent-[#cea355]" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="block font-bold text-white text-sm">{method.name}</span>
                              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#1c1c1c] text-[#edce8b] border border-[#cea355]/30">
                                {paymentTypeLabels[method.type] ?? method.type}
                              </span>
                            </div>
                            <span className="mt-1 block text-xs text-neutral-300">اسم صاحب الحساب: <strong className="text-white">{method.accountName}</strong></span>
                            <div className="mt-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-[#090909] p-3 rounded-xl border border-neutral-800">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                                <span className="text-[11px] text-neutral-400 font-semibold shrink-0">رقم التحويل / المحفظة:</span>
                                <span dir="ltr" className="font-mono text-sm sm:text-base font-black text-[#edce8b] tracking-wider break-all">{method.accountNumber}</span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  copyToClipboard(method.accountNumber, method.id);
                                }}
                                className="inline-flex items-center justify-center gap-1.5 text-xs font-bold bg-[#1a1a1a] hover:bg-[#282828] text-white px-3.5 py-2 rounded-lg border border-neutral-700 transition-colors shrink-0 active:scale-95"
                              >
                                {copiedMethodId === method.id ? (
                                  <>
                                    <Check className="size-3.5 text-emerald-400" />
                                    <span className="text-emerald-400">تم النسخ</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="size-3.5 text-[#edce8b]" />
                                    <span>نسخ الرقم</span>
                                  </>
                                )}
                              </button>
                            </div>
                            {method.instructions && (
                              <div className="mt-2 text-xs text-neutral-400 bg-amber-500/5 border border-amber-500/15 p-2 rounded-lg">
                                <span className="font-bold text-amber-200">تعليمات: </span>
                                <span>{method.instructions}</span>
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-xs font-bold text-amber-200">
                      لا توجد وسيلة تحويل نشطة حاليًا. تواصل مع الدعم الفني لتأكيد التحويل.
                    </div>
                  )}
                </fieldset>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="sender-name" className={labelClass}>اسم صاحب الحساب المحول منه</label>
                    <input id="sender-name" required value={senderName} onChange={(e) => setSenderName(e.target.value)} className={inputClass} placeholder="اسم المحوّل" />
                  </div>
                  <div>
                    <label htmlFor="sender-account" className={labelClass}>رقم الهاتف أو الحساب المحول منه</label>
                    <input id="sender-account" required dir="ltr" value={senderPhoneOrAccount} onChange={(e) => setSenderPhoneOrAccount(e.target.value)} className={inputClass} placeholder="01XXXXXXXXX" />
                  </div>
                  <div>
                    <label htmlFor="reference-number" className={labelClass}>رقم العملية / المرجع <span className="text-neutral-400 font-normal">(اختياري)</span></label>
                    <input id="reference-number" dir="ltr" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className={inputClass} placeholder="Ref number" />
                  </div>
                  <div>
                    <label htmlFor="amount-submitted" className={labelClass}>المبلغ المحول بالفعل</label>
                    <input id="amount-submitted" type="number" required min={1} value={amountSubmitted} onChange={(e) => setAmountSubmitted(e.target.value)} className={inputClass} />
                  </div>
                </div>

                <div id="payment-proof-file" aria-invalid={invalidField('payment-proof-file')}>
                  <span className="block text-xs font-bold text-white mb-2">صورة إيصال أو لقطة شاشة التحويل (إلزامية)</span>
                  <label htmlFor="payment-proof-file-input" className="flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-neutral-700 bg-[#0a0a0a] px-5 py-8 text-center transition-colors hover:border-[#cea355]">
                    {proofPreviewUrl ? (
                      <div className="space-y-3 flex flex-col items-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={proofPreviewUrl} alt="معاينة إثبات التحويل" className="max-h-48 rounded-xl object-contain border border-neutral-700 shadow-md" />
                        <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="size-4" />
                          <span>تم اختيار الصورة بنجاح من جهازك · اضغط لتغييرها</span>
                        </span>
                      </div>
                    ) : (
                      <>
                        <UploadCloud aria-hidden="true" className="mb-3 size-8 text-[#edce8b]" />
                        <span className="font-bold text-sm text-white">اضغط هنا لرفع صورة إيصال أو لقطة شاشة التحويل من جهازك</span>
                        <span className="mt-1.5 text-xs text-neutral-400">JPG أو PNG أو WEBP أو PDF (الحد الأقصى 10 ميجابايت)</span>
                      </>
                    )}
                    {proofFile && <span className="mt-3 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-xs font-bold text-[#edce8b]">{proofFile.name} · {formatBytes(proofFile.size)}</span>}
                  </label>
                  <input id="payment-proof-file-input" type="file" accept="image/*,application/pdf,.pdf" onChange={(event) => void onProofFileChange(event)} className="sr-only" />
                </div>
              </div>
            )}

            <label
              htmlFor="policy-accepted"
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all ${
                policyAccepted
                  ? 'border-[#cea355]/60 bg-[#cea355]/10 shadow-[0_0_15px_rgba(206,163,85,0.1)]'
                  : 'border-neutral-800 hover:border-neutral-700 bg-neutral-900/40'
              }`}
            >
              <input
                id="policy-accepted"
                type="checkbox"
                checked={policyAccepted}
                onChange={(e) => {
                  setPolicyAccepted(e.target.checked);
                  if (uiError) setUiError(null);
                }}
                className="mt-1 size-5 accent-[#cea355] cursor-pointer rounded"
              />
              <span className="text-xs leading-6 text-white font-medium select-none">
                أوافق على{' '}
                <Link
                  href="/policies/booking"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[#cea355] underline underline-offset-4 hover:text-[#e5bf70]"
                  onClick={(e) => e.stopPropagation()}
                >
                  سياسة الحجز
                </Link>{' '}
                وسياسة الخصوصية والإلغاء المعتمدة في منصة بريق.{' '}
                <span className="text-amber-400 font-bold">* (مطلوب لإتمام الحجز)</span>
              </span>
            </label>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4">
              <button
                type="button"
                disabled={bookingSubmitting}
                onClick={() => goToStep(4)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-700 px-5 py-3 font-semibold text-white hover:border-white disabled:opacity-50 w-full sm:w-auto"
              >
                <ArrowRight aria-hidden="true" className="size-4" />
                <span>السابق</span>
              </button>
              <div className="flex flex-col items-center sm:items-end gap-1.5 w-full sm:w-auto">
                <button
                  data-testid="booking-submit"
                  type="button"
                  onClick={createBooking}
                  disabled={
                    bookingSubmitting ||
                    !policyAccepted ||
                    (estimatedTransferAmount > 0 && !proofFile && !uploadedProofFileId)
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl gold-gradient px-7 py-3.5 font-black text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed shadow-xl shadow-[#cea355]/20 w-full sm:w-auto min-h-12 text-base transition-all"
                >
                  {bookingSubmitting ? (
                    <>
                      <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-white" />
                      <span>جاري تأكيد الحجز…</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck aria-hidden="true" className="size-4" />
                      <span>تأكيد الحجز النهائي</span>
                    </>
                  )}
                </button>
                {!policyAccepted && (
                  <span className="text-xs text-amber-400/90 text-center sm:text-right">
                    * يرجى الموافقة على السياسات لتفعيل زر تأكيد الحجز.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}
