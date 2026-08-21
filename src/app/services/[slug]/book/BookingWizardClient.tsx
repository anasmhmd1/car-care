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
  CalendarDays,
  Car,
  CheckCircle2,
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
import { createBookingAction, uploadPaymentProofAction } from '@/app/actions/booking';
import { BOOKING_TERMS_VERSION } from '@/lib/policies/versions';
import { prepareImageForUpload } from '@/lib/client/image-upload';
import { whatsappHref } from '@/lib/contact-links';
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
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

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

function normalizePhone(value: string) {
  return value.replace(/[\s()_-]/g, '');
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
  const initialAddress = firstAddressArea ? firstAddress : undefined;
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

  const branchZones = useMemo(() => {
    const zonesMap = new Map<string, { id: string; name: string; branchId: string; areas: CoverageAreaDto[] }>();
    for (const area of branchCoverageAreas) {
      const z = area.zone;
      const zoneId = z.id || z.name || 'default_zone';
      const zoneName = z.name || area.city || 'نطاق التغطية الرئيسي';
      if (!zonesMap.has(zoneId)) {
        zonesMap.set(zoneId, {
          id: zoneId,
          name: zoneName,
          branchId: z.branchId,
          areas: [],
        });
      }
      zonesMap.get(zoneId)!.areas.push(area);
    }
    return Array.from(zonesMap.values());
  }, [branchCoverageAreas]);

  const [selectedZoneId, setSelectedZoneId] = useState(
    () => initialArea?.zone?.id || '',
  );

  const activeZone = useMemo(() => {
    return branchZones.find((z) => z.id === selectedZoneId) || branchZones[0];
  }, [branchZones, selectedZoneId]);

  const zoneCompounds = useMemo(() => {
    return activeZone ? activeZone.areas : branchCoverageAreas;
  }, [activeZone, branchCoverageAreas]);

  function handleZoneChange(newZoneId: string) {
    setSelectedZoneId(newZoneId);
    const z = branchZones.find((item) => item.id === newZoneId);
    if (z && z.areas[0]) {
      setSelectedAreaId(z.areas[0].id);
      setSelectedSubscriptionId('');
    }
  }

  const selectedArea = branchCoverageAreas.find((area) => area.id === selectedAreaId) || branchCoverageAreas[0];
  const supportWhatsApp = supportContact?.whatsapp || supportContact?.phone;
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
  const selectedAddress = addresses.find((address) => address.id === selectedAddressId);
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
    /^\+?[0-9]{10,15}$/.test(normalizePhone(phone)) &&
    /^\+?[0-9]{10,15}$/.test(normalizePhone(whatsapp));
  const useSavedContact = Boolean(user) && hasSavedContact;
  const upcomingDays = useMemo(() => getUpcoming7Days(), []);
  const modelYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentYear + 1; y >= 1980; y--) {
      years.push(y);
    }
    return years;
  }, []);

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
    setSelectedZoneId(area.zone.id || area.zone.name || '');
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
    setSelectedZoneId(firstAreaForBranch?.zone?.id || firstAreaForBranch?.zone?.name || '');
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
    if (selectedAddressId !== 'new') return true;
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
    const cleanPhone = normalizePhone(phone);
    if (!/^\+?[0-9]{10,15}$/.test(cleanPhone)) {
      showError('رقم التواصل يجب أن يكون رقم هاتف صالح.', 'contact-phone');
      return false;
    }
    const cleanWhatsapp = normalizePhone(whatsapp);
    if (!/^\+?[0-9]{10,15}$/.test(cleanWhatsapp)) {
      showError('رقم واتساب يجب أن يكون رقم هاتف صالح.', 'contact-whatsapp');
      return false;
    }
    return true;
  }

  async function createBooking() {
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
    formData.append('policyAccepted', 'true');
    formData.append('policyVersion', BOOKING_TERMS_VERSION);
    if (service.cancellationPolicy.policyId) {
      formData.append('acceptedCancellationPolicyId', service.cancellationPolicy.policyId);
    }
    formData.append(
      'acceptedCancellationPolicyRevision',
      service.cancellationPolicy.revision,
    );
    formData.append('contactName', fullName.trim());
    formData.append('contactPhone', normalizePhone(phone));
    formData.append('contactWhatsapp', normalizePhone(whatsapp));
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
      const result = await createBookingAction(formData);
      if ('error' in result && result.error) {
        showError(result.error);
        return;
      }
      if (!('success' in result) || !result.success) {
        showError('تعذر إنشاء الحجز الآن. حاول مرة أخرى.');
        return;
      }

      if (requiresPaymentProof && result.paymentRequired) {
        let bookingFileId = uploadedProofFileId;
        if (!bookingFileId && proofFile) {
          const preparedProof = await prepareImageForUpload(proofFile);
          const uploadData = new FormData();
          uploadData.append('file', preparedProof);
          uploadData.append('bookingId', result.bookingId);
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
            throw new Error(responseError(uploadPayload, 'تم حجز الموعد بنجاح لكن تعذر رفع ملف إثبات التحويل. يمكنك إرساله من صفحة حجزك.'));
          }
          bookingFileId = uploadPayload.bookingFileId;
          setUploadedProofFileId(bookingFileId);
        }

        const proofData = new FormData();
        proofData.append('bookingId', result.bookingId);
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

      if (user) {
        router.push(`/account/bookings/${result.bookingId}`);
      } else {
        setGuestConfirmed({
          bookingNumber: result.bookingNumber,
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

  function onProofFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setUploadedProofFileId('');
    setUiError(null);
    if (!file) {
      setProofFile(null);
      setProofPreviewUrl('');
      return;
    }
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
      setProofFile(null);
      setProofPreviewUrl('');
      event.target.value = '';
      showError('اختر صورة JPG أو PNG أو WEBP أو ملف PDF.', 'payment-proof-file');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setProofFile(null);
      setProofPreviewUrl('');
      event.target.value = '';
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
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#cea355]/15 text-[#edce8b] border border-[#cea355]/30">
            تم استلام وتأكيد طلبك بنجاح ✨
          </span>
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

            <div className="flex justify-end pt-4">
              <button data-testid="booking-step-1-next" type="button" onClick={() => { if (validateVehicleDetails()) goToStep(2); }} className="inline-flex items-center gap-2 rounded-xl gold-gradient px-6 py-3 font-bold text-white hover:brightness-110">
                <span>التالي</span>
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
                              ⚠️ هذا العنوان مسجل خارج نطاق التغطية لفروع هذه الخدمة
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

            {/* 3-Tier Cascading Location Selection: Branch -> Zone -> Compound */}
            <div className="grid gap-5 sm:grid-cols-3">
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
                <label htmlFor="coverage-zone" className={labelClass}>
                  المنطقة / النطاق الرئيسي
                </label>
                <select
                  id="coverage-zone"
                  value={activeZone?.id || ''}
                  disabled={selectedAddressId !== 'new'}
                  onChange={(e) => handleZoneChange(e.target.value)}
                  className={inputClass}
                >
                  {branchZones.length > 0 ? (
                    branchZones.map((z) => (
                      <option key={z.id} value={z.id} className="bg-neutral-900 text-white">
                        {z.name}
                      </option>
                    ))
                  ) : (
                    <option value="" className="bg-neutral-900 text-neutral-400">
                      لا توجد مناطق مضافة لهذا الفرع
                    </option>
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="coverage-area" className={labelClass}>
                  الحي / الكمبوند / المنطقة الفرعية
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
                  {zoneCompounds.length > 0 ? (
                    zoneCompounds.map((area) => (
                      <option key={area.id} value={area.id} className="bg-neutral-900 text-white">
                        {area.compound}
                      </option>
                    ))
                  ) : (
                    <option value="" className="bg-neutral-900 text-neutral-400">
                      لا توجد أحياء أو كمبوندات
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

            <div className="flex items-center justify-between gap-3 pt-4">
              <button type="button" onClick={() => goToStep(1)} className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 px-5 py-3 font-semibold text-white hover:border-white">
                <ArrowRight aria-hidden="true" className="size-4" />
                <span>السابق</span>
              </button>
              <button data-testid="booking-step-2-next" type="button" onClick={() => { if (validateAddress()) goToStep(3); }} className="inline-flex items-center gap-2 rounded-xl gold-gradient px-6 py-3 font-bold text-white hover:brightness-110">
                <span>التالي</span>
                <ArrowLeft aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Time Slot Selection */}
        {step === 3 && (
          <div aria-busy={loadingSlots} className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl gold-gradient p-3 text-white"><CalendarDays aria-hidden="true" className="w-6 h-6" /></div>
              <div>
                <h2 className="text-xl font-bold text-white">اختر موعد الخدمة</h2>
                <p className="mt-1 text-xs text-white">المواعيد المتاحة محسوبة بدقة حسب جاهزية فرق العمل.</p>
              </div>
            </div>

            {/* 7-Day Interactive Day Selector */}
            <div className="space-y-3">
              <label className={labelClass}>أيام الحجز المتاحة (الـ 7 أيام القادمة)</label>
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

            {/* Slot Selection */}
            <div aria-live="polite" className="space-y-3">
              <label className={labelClass}>المواعيد المتاحة</label>

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
                    جميع المواعيد محجوزة في منطقتك لهذا اليوم. يُرجى اختيار يوم آخر من الأيام بالأعلى.
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
                            onChange={() => setSelectedSlot(slot)}
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

            <div className="flex items-center justify-between gap-3 pt-4">
              <button type="button" onClick={() => goToStep(2)} className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 px-5 py-3 font-semibold text-white hover:border-white">
                <ArrowRight aria-hidden="true" className="size-4" />
                <span>السابق</span>
              </button>
              <button data-testid="booking-step-3-next" type="button" disabled={!selectedSlot || loadingSlots} onClick={() => { if (!selectedSlot) { showError('اختر موعدًا متاحًا.', 'booking-slots'); return; } goToStep(4); }} className="inline-flex items-center gap-2 rounded-xl gold-gradient px-6 py-3 font-bold text-white hover:brightness-110 disabled:opacity-50">
                <span>التالي</span>
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
                  <input id="contact-phone" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} className={inputClass} placeholder="01XXXXXXXXX" />
                </div>
                <div>
                  <label htmlFor="contact-whatsapp" className={labelClass}>رقم واتساب للتنسيق</label>
                  <input id="contact-whatsapp" type="tel" dir="ltr" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} maxLength={20} className={inputClass} placeholder="01XXXXXXXXX" />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="customer-notes" className={labelClass}>ملاحظات خاصة للفريق <span className="text-neutral-400 font-normal">(اختياري)</span></label>
              <textarea id="customer-notes" rows={3} value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} maxLength={1000} className={inputClass} placeholder="أي تعليمات أو ملاحظات إضافية ترغب في إبلاغها للفريق..." />
            </div>

            <div className="flex items-center justify-between gap-3 pt-4">
              <button type="button" onClick={() => goToStep(3)} className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 px-5 py-3 font-semibold text-white hover:border-white">
                <ArrowRight aria-hidden="true" className="size-4" />
                <span>السابق</span>
              </button>
              <button data-testid="booking-step-4-next" type="button" onClick={() => { if (validateContact()) goToStep(5); }} className="inline-flex items-center gap-2 rounded-xl gold-gradient px-6 py-3 font-bold text-white hover:brightness-110">
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
                      مشمول بالاشتراك النشط ✨
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
                            <div className="mt-2.5 flex items-center gap-2 bg-[#090909] p-3 rounded-xl border border-neutral-800">
                              <span className="text-xs text-neutral-400 font-semibold">رقم التحويل / المحفظة:</span>
                              <span dir="ltr" className="font-mono text-base font-black text-[#edce8b] flex-1 tracking-wider">{method.accountNumber}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  copyToClipboard(method.accountNumber, method.id);
                                }}
                                className="inline-flex items-center gap-1 text-xs font-bold bg-[#1a1a1a] hover:bg-[#282828] text-white px-3 py-1.5 rounded-lg border border-neutral-700 transition-colors"
                              >
                                {copiedMethodId === method.id ? (
                                  <>
                                    <Check className="size-3.5 text-emerald-400" />
                                    <span className="text-emerald-400">تم النسخ</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="size-3.5" />
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
                  <input id="payment-proof-file-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" onChange={onProofFileChange} className="sr-only" />
                </div>
              </div>
            )}

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-neutral-800 p-4 hover:border-neutral-700 transition-all">
              <input id="policy-accepted" type="checkbox" checked={policyAccepted} onChange={(e) => setPolicyAccepted(e.target.checked)} className="mt-1 size-4 accent-[#cea355]" />
              <span className="text-xs leading-6 text-white font-medium">
                أوافق على <Link href="/policies/booking" className="font-bold text-white underline underline-offset-4">سياسة الحجز</Link> وسياسة الخصوصية والإلغاء المعتمدة في منصة بريق.
              </span>
            </label>

            <div className="flex items-center justify-between gap-3 pt-4">
              <button type="button" disabled={bookingSubmitting} onClick={() => goToStep(4)} className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 px-5 py-3 font-semibold text-white hover:border-white disabled:opacity-50">
                <ArrowRight aria-hidden="true" className="size-4" />
                <span>السابق</span>
              </button>
              <button data-testid="booking-submit" type="button" onClick={createBooking} disabled={bookingSubmitting || (estimatedTransferAmount > 0 && !proofFile && !uploadedProofFileId)} className="inline-flex min-w-56 items-center justify-center gap-2 rounded-xl gold-gradient px-7 py-3.5 font-black text-white hover:brightness-110 disabled:opacity-50 shadow-xl shadow-[#cea355]/20">
                {bookingSubmitting ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-white" />
                    <span>جاري تأكيد الحجز…</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck aria-hidden="true" className="size-4" />
                    <span>تأكيد الحجز</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}
