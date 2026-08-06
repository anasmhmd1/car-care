'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  type FormEvent,
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
  zone: { branchId: string; branch: { nameAr: string } };
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
  user: BookingUser;
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

interface CreatedBooking {
  id: string;
  number: string;
  depositAmount: number;
  branchId: string;
}

interface UiError {
  message: string;
  fieldId?: string;
}

type ProofStage = 'idle' | 'uploading-file' | 'submitting-proof';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const inputClass =
  'w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-white placeholder:text-white/35 transition-colors hover:border-white/25 focus-visible:border-[#d4af37] focus-visible:ring-2 focus-visible:ring-[#d4af37]/25 disabled:cursor-not-allowed disabled:opacity-60';
const labelClass = 'mb-2 block text-sm font-medium text-white/80';

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
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateInputValue(tomorrow);
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

function areaForAddress(address: AddressDto, coverageAreas: CoverageAreaDto[]) {
  return coverageAreas.find(
    (area) =>
      area.governorate === address.governorate &&
      area.city === address.city &&
      area.district === address.district &&
      area.compound === address.compound,
  );
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
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
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

  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone);
  const [whatsapp, setWhatsapp] = useState(user.whatsapp || user.phone);
  const [customerNotes, setCustomerNotes] = useState('');
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [useCredit, setUseCredit] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  const [createdBooking, setCreatedBooking] = useState<CreatedBooking | null>(null);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('');
  const [senderName, setSenderName] = useState(user.fullName);
  const [senderPhoneOrAccount, setSenderPhoneOrAccount] = useState(user.phone);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [amountSubmitted, setAmountSubmitted] = useState('');
  const [transferTimestamp, setTransferTimestamp] = useState(() => dateTimeInputValue(new Date()));
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadedProofFileId, setUploadedProofFileId] = useState('');
  const [proofStage, setProofStage] = useState<ProofStage>('idle');

  const [uiError, setUiError] = useState<UiError | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const bookingBranches = useMemo(() => {
    const branches = new Map<string, { id: string; nameAr: string }>();
    for (const area of coverageAreas) {
      branches.set(area.zone.branchId, {
        id: area.zone.branchId,
        nameAr: area.zone.branch.nameAr,
      });
    }
    return [...branches.values()];
  }, [coverageAreas]);
  const branchCoverageAreas = useMemo(
    () => coverageAreas.filter((area) => area.zone.branchId === selectedBranchId),
    [coverageAreas, selectedBranchId],
  );
  const selectedArea = branchCoverageAreas.find((area) => area.id === selectedAreaId);
  const supportWhatsApp = supportContact?.whatsapp || supportContact?.phone;
  const hasUnsupportedSavedAddress = addresses.some(
    (address) => !areaForAddress(address, coverageAreas),
  );
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
    () => paymentMethods.filter((method) => method.branchId === createdBooking?.branchId),
    [createdBooking?.branchId, paymentMethods],
  );

  const variant = service.variants.find((item) => item.vehicleSize === vehicleSize);
  const basePrice = variant?.price ?? service.basePrice;
  const addonsPrice = selectedAddonIds.reduce((total, addonId) => {
    const link = service.addonLinks.find((item) => item.addon.id === addonId);
    return total + (link?.addon.price ?? 0);
  }, 0);
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
    ? addonsPrice
    : calculateEstimatedDeposit(estimatedTotal, service);
  const estimatedCreditApplied = useCredit ? Math.min(creditBalance, estimatedTotal) : 0;
  const estimatedTransferAmount = Math.max(0, estimatedDeposit - estimatedCreditApplied);
  const hasSavedContact =
    fullName.trim().length >= 2 &&
    /^\+?[0-9]{10,15}$/.test(normalizePhone(phone)) &&
    /^\+?[0-9]{10,15}$/.test(normalizePhone(whatsapp));
  const useSavedContact = Boolean(selectedSubscriptionId) && hasSavedContact;

  useEffect(() => {
    if (uiError) errorRef.current?.focus();
  }, [uiError]);

  useEffect(() => {
    if (step !== 4) return;
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
    const firstAreaForBranch = coverageAreas.find((area) => area.zone.branchId === branchId);
    setSelectedBranchId(branchId);
    setSelectedAreaId(firstAreaForBranch?.id ?? '');
    setSelectedSubscriptionId('');
    setUiError(null);

    if (selectedAddressId !== 'new') {
      // A saved address belongs to its own coverage branch. Requiring a fresh
      // selection prevents sending an address to a different branch by mistake.
      setSelectedAddressId('new');
      setStreet('');
      setBuildingNumber('');
      setUnitNumber('');
      setLandmark('');
      setGateInstructions('');
      setLocationUrl('');
    }
  }

  function toggleAddon(addonId: string) {
    setSelectedAddonIds((current) =>
      current.includes(addonId)
        ? current.filter((item) => item !== addonId)
        : [...current, addonId],
    );
    setUiError(null);
  }

  function validateVehicleDetails() {
    if (!vehicleMake.trim()) {
      showError('اكتب ماركة السيارة.', 'vehicle-make');
      return false;
    }
    if (!vehicleModel.trim()) {
      showError('اكتب موديل السيارة.', 'vehicle-model');
      return false;
    }
    const parsedYear = Number(vehicleYear);
    if (
      !Number.isInteger(parsedYear) ||
      parsedYear < 1990 ||
      parsedYear > new Date().getFullYear() + 1
    ) {
      showError('اكتب سنة موديل صحيحة من 1990 حتى السنة القادمة.', 'vehicle-year');
      return false;
    }
    if (!vehicleColor.trim()) {
      showError('اكتب لون السيارة.', 'vehicle-color');
      return false;
    }
    return true;
  }

  function validateAddress() {
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
    if (!isValidLocationUrl(locationUrl)) {
      showError('اكتب رابط موقع صحيحًا يبدأ بـ http:// أو https://', 'location-url');
      return false;
    }
    return true;
  }

  function validateContact() {
    if (fullName.trim().length < 2) {
      showError('اكتب اسم التواصل كاملًا.', 'contact-name');
      return false;
    }
    if (!/^\+?[0-9]{10,15}$/.test(normalizePhone(phone))) {
      showError('اكتب رقم تواصل صحيحًا من 10 إلى 15 رقمًا.', 'contact-phone');
      return false;
    }
    if (!/^\+?[0-9]{10,15}$/.test(normalizePhone(whatsapp))) {
      showError('اكتب رقم واتساب صحيحًا من 10 إلى 15 رقمًا.', 'contact-whatsapp');
      return false;
    }
    return true;
  }

  async function createBooking() {
    if (!selectedArea || !selectedSlot) {
      showError('اختر منطقة وموعدًا متاحًا قبل تأكيد الحجز.');
      return;
    }
    if (!validateVehicleDetails() || !validateAddress() || !validateContact()) return;
    if (!policyAccepted) {
      showError('وافق على سياسة الحجز والإلغاء لإكمال الطلب.', 'policy-accepted');
      return;
    }

    setBookingSubmitting(true);
    setUiError(null);
    const formData = new FormData();
    formData.append('serviceId', service.id);
    formData.append('coverageAreaId', selectedArea.id);
    formData.append('vehicleSize', vehicleSize);
    formData.append('startAt', selectedSlot.startAt);
    formData.append('addonIds', JSON.stringify(selectedAddonIds));
    formData.append('vehicleMake', vehicleMake.trim());
    formData.append('vehicleModel', vehicleModel.trim());
    formData.append('vehicleYear', vehicleYear);
    formData.append('vehicleColor', vehicleColor.trim());
    formData.append('plateNumber', plateNumber.trim());
    formData.append('street', street.trim());
    formData.append('buildingNumber', buildingNumber.trim());
    formData.append('unitNumber', unitNumber.trim());
    formData.append('landmark', landmark.trim());
    formData.append('gateInstructions', gateInstructions.trim());
    formData.append('locationUrl', locationUrl.trim());
    formData.append('customerNotes', customerNotes.trim());
    formData.append('contactName', fullName.trim());
    formData.append('contactPhone', normalizePhone(phone));
    formData.append('contactWhatsapp', normalizePhone(whatsapp));
    formData.append('policyAccepted', 'true');
    formData.append('policyVersion', BOOKING_TERMS_VERSION);
    if (service.cancellationPolicy.policyId) {
      formData.append('acceptedCancellationPolicyId', service.cancellationPolicy.policyId);
    }
    formData.append(
      'acceptedCancellationPolicyRevision',
      service.cancellationPolicy.revision,
    );
    if (selectedVehicleId !== 'new') formData.append('vehicleId', selectedVehicleId);
    if (selectedAddressId !== 'new') formData.append('addressId', selectedAddressId);
    if (selectedSubscriptionId) formData.append('subscriptionId', selectedSubscriptionId);
    if (useCredit) formData.append('useCredit', 'true');

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

      const booking: CreatedBooking = {
        id: result.bookingId,
        number: result.bookingNumber,
        depositAmount: result.depositAmount,
        branchId: selectedArea.zone.branchId,
      };
      setCreatedBooking(booking);

      if (!result.paymentRequired) {
        router.push(`/account/bookings/${result.bookingId}`);
        return;
      }

      const branchMethods = paymentMethods.filter(
        (method) => method.branchId === selectedArea.zone.branchId,
      );
      const initialMethod = branchMethods.find((method) => method.isDefault) ?? branchMethods[0];
      setSelectedPaymentMethodId(initialMethod?.id ?? '');
      setAmountSubmitted(result.depositAmount > 0 ? String(result.depositAmount) : '');
      setTransferTimestamp(dateTimeInputValue(new Date()));
      goToStep(7);
    } catch {
      showError('تعذر الاتصال بالخادم لإنشاء الحجز. حاول مرة أخرى.');
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
      return;
    }
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
      setProofFile(null);
      event.target.value = '';
      showError('اختر صورة JPG أو PNG أو WEBP أو ملف PDF.', 'payment-proof-file');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setProofFile(null);
      event.target.value = '';
      showError('حجم الملف يجب ألا يتجاوز 10 ميجابايت.', 'payment-proof-file');
      return;
    }
    setProofFile(file);
  }

  async function submitPaymentProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createdBooking) {
      showError('بيانات الحجز غير متاحة. ارجع إلى حجوزاتك وحاول مرة أخرى.');
      return;
    }
    if (!selectedPaymentMethodId) {
      showError('اختر وسيلة التحويل.', 'payment-methods');
      return;
    }
    if (!proofFile && !uploadedProofFileId) {
      showError('اختر صورة أو ملف إثبات التحويل.', 'payment-proof-file');
      return;
    }
    const parsedAmount = Number(amountSubmitted);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      showError('اكتب المبلغ المحول كرقم صحيح أكبر من صفر.', 'amount-submitted');
      return;
    }

    setUiError(null);
    let bookingFileId = uploadedProofFileId;

    try {
      if (!bookingFileId) {
        setProofStage('uploading-file');
        const preparedProof = await prepareImageForUpload(proofFile as File);
        const uploadData = new FormData();
        uploadData.append('file', preparedProof);
        uploadData.append('bookingId', createdBooking.id);
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
          throw new Error(responseError(uploadPayload, 'تعذر رفع ملف إثبات التحويل.'));
        }
        bookingFileId = uploadPayload.bookingFileId;
        setUploadedProofFileId(bookingFileId);
      }

      setProofStage('submitting-proof');
      const proofData = new FormData();
      proofData.append('bookingId', createdBooking.id);
      proofData.append('paymentMethodId', selectedPaymentMethodId);
      proofData.append('bookingFileId', bookingFileId);
      proofData.append('senderName', senderName.trim());
      proofData.append('senderPhoneOrAccount', senderPhoneOrAccount.trim());
      proofData.append('referenceNumber', referenceNumber.trim());
      proofData.append('amountSubmitted', String(parsedAmount));
      proofData.append('transferTimestamp', new Date(transferTimestamp).toISOString());

      const result = await uploadPaymentProofAction(proofData);
      if ('error' in result && result.error) {
        showError(result.error);
        return;
      }
      if (!('success' in result) || !result.success) {
        showError('تعذر إرسال إثبات التحويل. حاول مرة أخرى.');
        return;
      }
      router.push(`/account/bookings/${createdBooking.id}`);
    } catch (error) {
      showError(
        error instanceof Error ? error.message : 'تعذر إرسال إثبات التحويل. حاول مرة أخرى.',
      );
    } finally {
      setProofStage('idle');
    }
  }

  const invalidField = (fieldId: string) => uiError?.fieldId === fieldId;
  const stepLabel = step === 7 ? 'إثبات التحويل' : `الخطوة ${step} من 6`;
  const progress = step === 7 ? 100 : Math.round((step / 6) * 100);

  if (coverageAreas.length === 0) {
    return (
      <section dir="rtl" className="rounded-3xl border border-amber-400/25 bg-amber-400/[0.06] p-8 text-center">
        <MapPin aria-hidden="true" className="mx-auto mb-4 size-10 text-amber-300" />
        <h1 className="text-2xl font-bold">الحجز غير متاح مؤقتًا</h1>
        <p className="mt-3 text-white/65">لا توجد منطقة تغطية نشطة لهذه الخدمة حاليًا.</p>
        {supportWhatsApp ? (
          <a href={whatsappHref(supportWhatsApp, `أرغب في الاستفسار عن تغطية خدمة ${service.nameAr}`)} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#d4af37] px-5 py-3 font-bold text-black hover:bg-[#e2c55d]">
            <MessageCircle aria-hidden="true" className="size-4" /> تواصل عبر واتساب
          </a>
        ) : (
          <Link href="/services" className="mt-6 inline-flex rounded-xl border border-white/20 px-5 py-3 font-semibold hover:border-[#d4af37] hover:text-[#d4af37]">
            العودة إلى الخدمات
          </Link>
        )}
      </section>
    );
  }

  return (
    <section dir="rtl" aria-labelledby="booking-title">
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-4 text-sm">
          <span className="font-semibold text-[#d4af37]">{stepLabel}</span>
          <span className="text-white/55">{service.nameAr}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full rounded-full bg-[#d4af37] transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold text-[#d4af37]">حجز آمن ومؤكد</p>
        <h1 id="booking-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
          حجز {service.nameAr}
        </h1>
        <p className="mt-3 text-white/55">أكمل البيانات التالية، وسنؤكد السعر والموعد من النظام قبل الدفع.</p>
      </div>

      {uiError && (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="mb-6 rounded-2xl border border-red-400/35 bg-red-500/10 px-5 py-4 text-sm text-red-100 focus-visible:ring-2 focus-visible:ring-red-300"
        >
          {uiError.message}
        </div>
      )}

      <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/25 sm:p-8">
        {step === 1 && (
          <div>
            <div className="mb-7 flex items-start gap-4">
              <div className="rounded-2xl bg-[#d4af37]/10 p-3 text-[#d4af37]"><Car aria-hidden="true" /></div>
              <div><h2 className="text-xl font-bold">اختر السيارة والإضافات</h2><p className="mt-1 text-sm text-white/50">حدد سيارة محفوظة أو أضف سيارة جديدة.</p></div>
            </div>

            <fieldset className="mb-7">
              <legend className="mb-3 text-sm font-semibold text-white/80">سياراتي</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {vehicles.map((vehicle) => (
                  <label key={vehicle.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${selectedVehicleId === vehicle.id ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/10 hover:border-white/25'}`}>
                    <input type="radio" name="saved-vehicle" value={vehicle.id} checked={selectedVehicleId === vehicle.id} onChange={() => selectVehicle(vehicle.id)} className="mt-1 size-4 accent-[#d4af37]" />
                    <span><span className="block font-semibold">{vehicle.make} {vehicle.model} {vehicle.year}</span><span className="mt-1 block text-sm text-white/50">{vehicle.color}{vehicle.plateNumber ? ` · ${vehicle.plateNumber}` : ''}{vehicle.isDefault ? ' · الافتراضية' : ''}</span></span>
                  </label>
                ))}
                <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${selectedVehicleId === 'new' ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/10 hover:border-white/25'}`}>
                  <input type="radio" name="saved-vehicle" value="new" checked={selectedVehicleId === 'new'} onChange={() => selectVehicle('new')} className="mt-1 size-4 accent-[#d4af37]" />
                  <span><span className="block font-semibold">سيارة جديدة</span><span className="mt-1 block text-sm text-white/50">أدخل بياناتها في الخطوة التالية.</span></span>
                </label>
              </div>
            </fieldset>

            {selectedVehicleId === 'new' ? (
              <fieldset className="mb-7">
                <legend className="mb-3 text-sm font-semibold text-white/80">حجم السيارة</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {vehicleSizes.map((size) => (
                    <label key={size.value} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${vehicleSize === size.value ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/10 hover:border-white/25'}`}>
                      <input type="radio" name="vehicle-size" value={size.value} checked={vehicleSize === size.value} onChange={() => setVehicleSize(size.value)} className="mt-1 size-4 accent-[#d4af37]" />
                      <span><span className="block font-semibold">{size.label}</span><span className="mt-1 block text-sm text-white/50">{size.description}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <p className="mb-7 rounded-xl bg-white/[0.04] px-4 py-3 text-sm text-white/60">حجم السيارة المسجل: <span className="font-semibold text-white">{vehicleSizes.find((size) => size.value === vehicleSize)?.label}</span></p>
            )}

            {service.addonLinks.length > 0 && (
              <fieldset>
                <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80"><Sparkles aria-hidden="true" className="size-4 text-[#d4af37]" /> إضافات اختيارية</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {service.addonLinks.map(({ addon }) => (
                    <label key={addon.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${selectedAddonIds.includes(addon.id) ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/10 hover:border-white/25'}`}>
                      <input type="checkbox" checked={selectedAddonIds.includes(addon.id)} onChange={() => toggleAddon(addon.id)} className="mt-1 size-4 accent-[#d4af37]" />
                      <span className="flex-1"><span className="block font-semibold">{addon.nameAr}</span><span className="mt-1 block text-sm text-white/50">+ {formatCurrency(addon.price)} · {addon.durationMinutes} دقيقة</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="mt-8 flex justify-end"><button data-testid="booking-step-1-next" type="button" onClick={() => goToStep(2)} className="inline-flex items-center gap-2 rounded-xl bg-[#d4af37] px-6 py-3 font-bold text-black hover:bg-[#e2c55d]">التالي <ArrowLeft aria-hidden="true" className="size-4" /></button></div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="mb-7 flex items-start gap-4"><div className="rounded-2xl bg-[#d4af37]/10 p-3 text-[#d4af37]"><Car aria-hidden="true" /></div><div><h2 className="text-xl font-bold">بيانات السيارة والاشتراك</h2><p className="mt-1 text-sm text-white/50">راجع بيانات السيارة واختر اشتراكًا مؤهلًا إن وجد.</p></div></div>

            {selectedVehicle ? (
              <div className="mb-7 rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="font-semibold">{selectedVehicle.make} {selectedVehicle.model} · {selectedVehicle.year}</p><p className="mt-2 text-sm text-white/55">{selectedVehicle.color}{selectedVehicle.plateNumber ? ` · ${selectedVehicle.plateNumber}` : ''}</p></div>
            ) : (
              <div className="mb-7 grid gap-5 sm:grid-cols-2">
                <div><label htmlFor="vehicle-make" className={labelClass}>الماركة *</label><input id="vehicle-make" value={vehicleMake} onChange={(event) => setVehicleMake(event.target.value)} maxLength={100} autoComplete="off" aria-invalid={invalidField('vehicle-make')} className={inputClass} /></div>
                <div><label htmlFor="vehicle-model" className={labelClass}>الموديل *</label><input id="vehicle-model" value={vehicleModel} onChange={(event) => setVehicleModel(event.target.value)} maxLength={100} autoComplete="off" aria-invalid={invalidField('vehicle-model')} className={inputClass} /></div>
                <div><label htmlFor="vehicle-year" className={labelClass}>سنة الموديل *</label><input id="vehicle-year" type="number" inputMode="numeric" min={1990} max={new Date().getFullYear() + 1} value={vehicleYear} onChange={(event) => setVehicleYear(event.target.value)} aria-invalid={invalidField('vehicle-year')} className={inputClass} /></div>
                <div><label htmlFor="vehicle-color" className={labelClass}>اللون *</label><input id="vehicle-color" value={vehicleColor} onChange={(event) => setVehicleColor(event.target.value)} maxLength={50} autoComplete="off" aria-invalid={invalidField('vehicle-color')} className={inputClass} /></div>
                <div className="sm:col-span-2"><label htmlFor="plate-number" className={labelClass}>رقم اللوحة <span className="text-white/40">(اختياري)</span></label><input id="plate-number" value={plateNumber} onChange={(event) => setPlateNumber(event.target.value)} maxLength={20} autoComplete="off" className={inputClass} /></div>
              </div>
            )}

            {subscriptions.length > 0 && (
              <fieldset>
                <legend className="mb-3 text-sm font-semibold text-white/80">استخدام اشتراك</legend>
                <div className="space-y-3">
                  <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${selectedSubscriptionId === '' ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/10'}`}><input type="radio" name="subscription" checked={selectedSubscriptionId === ''} onChange={() => setSelectedSubscriptionId('')} className="mt-1 size-4 accent-[#d4af37]" /><span><span className="block font-semibold">بدون اشتراك</span><span className="mt-1 block text-sm text-white/50">احتساب السعر العادي للخدمة.</span></span></label>
                  {subscriptions.map((subscription) => {
                    const issue = subscriptionIssue(subscription, service.id, selectedArea?.zone.branchId, selectedVehicleId);
                    return (
                      <label key={subscription.id} className={`flex gap-3 rounded-2xl border p-4 ${issue ? 'cursor-not-allowed border-white/5 opacity-55' : 'cursor-pointer'} ${selectedSubscriptionId === subscription.id ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/10'}`}>
                        <input type="radio" name="subscription" value={subscription.id} checked={selectedSubscriptionId === subscription.id} disabled={Boolean(issue)} onChange={() => setSelectedSubscriptionId(subscription.id)} className="mt-1 size-4 accent-[#d4af37]" />
                        <span>
                          <span className="block font-semibold">{subscription.plan.nameAr}</span>
                          <span className="mt-1 block text-sm text-white/50">{subscription.remainingVisits} زيارات إجمالية متبقية · ينتهي {new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(subscription.endDate))}</span>
                          {subscription.serviceBalances && subscription.serviceBalances.length > 0 && (
                            <span className="mt-2 block rounded-xl bg-black/30 p-2.5 text-xs text-neutral-300 space-y-1">
                              <span className="block font-bold text-[#e5c45a] mb-1">رصيد الخدمات التفصيلي بالاشتراك:</span>
                              {subscription.serviceBalances.map((sb) => (
                                <span key={sb.serviceId} className={`block text-[11px] ${sb.serviceId === service.id ? 'font-bold text-[#e5c45a]' : 'text-neutral-400'}`}>
                                  • {sb.service.nameAr}: <strong className="text-white">{sb.remainingVisits} زيارات</strong> {sb.serviceId === service.id ? '(الخدمة المختارة)' : ''}
                                </span>
                              ))}
                            </span>
                          )}
                          {issue && <span className="mt-2 block text-xs text-amber-200">{issue}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="mt-8 flex items-center justify-between gap-3"><button type="button" onClick={() => goToStep(1)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 font-semibold hover:border-white/35"><ArrowRight aria-hidden="true" className="size-4" /> السابق</button><button data-testid="booking-step-2-next" type="button" onClick={() => { if (validateVehicleDetails()) goToStep(3); }} className="inline-flex items-center gap-2 rounded-xl bg-[#d4af37] px-6 py-3 font-bold text-black hover:bg-[#e2c55d]">التالي <ArrowLeft aria-hidden="true" className="size-4" /></button></div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="mb-7 flex items-start gap-4"><div className="rounded-2xl bg-[#d4af37]/10 p-3 text-[#d4af37]"><MapPin aria-hidden="true" /></div><div><h2 className="text-xl font-bold">عنوان تنفيذ الخدمة</h2><p className="mt-1 text-sm text-white/50">اختر عنوانًا داخل نطاق التغطية أو أضف عنوانًا جديدًا.</p></div></div>

            <fieldset className="mb-7">
              <legend className="mb-3 text-sm font-semibold text-white/80">اختر الفرع المنفذ *</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {bookingBranches.map((branch) => {
                  const branchAreaCount = coverageAreas.filter((area) => area.zone.branchId === branch.id).length;
                  return <label key={branch.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${selectedBranchId === branch.id ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/10 hover:border-white/25'}`}>
                    <input type="radio" name="booking-branch" value={branch.id} checked={selectedBranchId === branch.id} onChange={() => selectBranch(branch.id)} className="mt-1 size-4 accent-[#d4af37]" />
                    <span><span className="block font-semibold">{branch.nameAr}</span><span className="mt-1 block text-sm text-white/50">{branchAreaCount} مناطق تغطية متاحة لهذه الخدمة.</span></span>
                  </label>;
                })}
              </div>
              <p className="mt-3 text-xs leading-6 text-white/45">الفرع يحدد مناطق التغطية والمواعيد ووسائل التحويل المتاحة لحجزك.</p>
            </fieldset>

            {addresses.length > 0 && (
              <fieldset className="mb-7">
                <legend className="mb-3 text-sm font-semibold text-white/80">عناويني</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {addresses.map((address) => {
                    const area = areaForAddress(address, coverageAreas);
                    return <label key={address.id} className={`flex gap-3 rounded-2xl border p-4 ${area ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'} ${selectedAddressId === address.id ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/10'}`}><input type="radio" name="saved-address" checked={selectedAddressId === address.id} disabled={!area} onChange={() => selectAddress(address.id)} className="mt-1 size-4 accent-[#d4af37]" /><span><span className="block font-semibold">{address.compound}{address.isDefault ? ' · الافتراضي' : ''}</span><span className="mt-1 block text-sm text-white/50">{address.street}، {address.buildingNumber}</span>{!area && <span className="mt-2 block text-xs text-amber-200">خارج نطاق التغطية الحالية.</span>}</span></label>;
                  })}
                  <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${selectedAddressId === 'new' ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/10'}`}><input type="radio" name="saved-address" checked={selectedAddressId === 'new'} onChange={() => selectAddress('new')} className="mt-1 size-4 accent-[#d4af37]" /><span><span className="block font-semibold">عنوان جديد</span><span className="mt-1 block text-sm text-white/50">اكتب تفاصيل عنوان التنفيذ.</span></span></label>
                </div>
                {hasUnsupportedSavedAddress && supportWhatsApp ? (
                  <div data-testid="outside-coverage-contact" className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
                    <p>العناوين المعلّمة خارج التغطية لا تعرض مواعيد. تواصل معنا للتحقق من إمكانية الخدمة.</p>
                    <a href={whatsappHref(supportWhatsApp, `أرغب في التحقق من تغطية عنواني لخدمة ${service.nameAr}`)} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-300/35 px-4 py-2 font-bold hover:bg-amber-300/10">
                      <MessageCircle aria-hidden="true" className="size-4" /> واتساب
                    </a>
                  </div>
                ) : null}
              </fieldset>
            )}

            <div className="mb-5"><label htmlFor="coverage-area" className={labelClass}>منطقة التغطية التابعة للفرع *</label><select id="coverage-area" value={selectedAreaId} disabled={selectedAddressId !== 'new'} onChange={(event) => { setSelectedAreaId(event.target.value); setSelectedSubscriptionId(''); }} aria-invalid={invalidField('coverage-area')} className={inputClass}>{branchCoverageAreas.map((area) => <option key={area.id} value={area.id} className="bg-neutral-900">{area.compound} — {area.district}، {area.city}</option>)}</select>{selectedAddressId !== 'new' && <p className="mt-2 text-xs text-white/45">المنطقة والفرع محددان من العنوان المحفوظ.</p>}</div>

            {selectedAddress ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="font-semibold">{selectedAddress.compound}، {selectedAddress.street}</p><p className="mt-2 text-sm text-white/55">{selectedAddress.buildingNumber}{selectedAddress.unitNumber ? `، وحدة ${selectedAddress.unitNumber}` : ''}{selectedAddress.landmark ? ` · ${selectedAddress.landmark}` : ''}</p></div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <div><label htmlFor="street" className={labelClass}>الشارع *</label><input id="street" value={street} onChange={(event) => setStreet(event.target.value)} maxLength={200} autoComplete="street-address" aria-invalid={invalidField('street')} className={inputClass} /></div>
                <div><label htmlFor="building-number" className={labelClass}>رقم المبنى أو الفيلا *</label><input id="building-number" value={buildingNumber} onChange={(event) => setBuildingNumber(event.target.value)} maxLength={100} autoComplete="address-line2" aria-invalid={invalidField('building-number')} className={inputClass} /></div>
                <div><label htmlFor="unit-number" className={labelClass}>رقم الوحدة <span className="text-white/40">(اختياري)</span></label><input id="unit-number" value={unitNumber} onChange={(event) => setUnitNumber(event.target.value)} maxLength={50} autoComplete="address-line3" className={inputClass} /></div>
                <div><label htmlFor="landmark" className={labelClass}>علامة مميزة <span className="text-white/40">(اختياري)</span></label><input id="landmark" value={landmark} onChange={(event) => setLandmark(event.target.value)} maxLength={200} autoComplete="off" className={inputClass} /></div>
                <div className="sm:col-span-2"><label htmlFor="gate-instructions" className={labelClass}>تعليمات البوابة أو الدخول <span className="text-white/40">(اختياري)</span></label><textarea id="gate-instructions" rows={3} value={gateInstructions} onChange={(event) => setGateInstructions(event.target.value)} maxLength={500} className={inputClass} /></div>
                <div className="sm:col-span-2"><label htmlFor="location-url" className={labelClass}>رابط الموقع على الخريطة <span className="text-white/40">(اختياري)</span></label><input id="location-url" type="url" dir="ltr" value={locationUrl} onChange={(event) => setLocationUrl(event.target.value)} placeholder="https://maps.google.com/..." autoComplete="url" aria-invalid={invalidField('location-url')} className={inputClass} /></div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-between gap-3"><button type="button" onClick={() => goToStep(2)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 font-semibold hover:border-white/35"><ArrowRight aria-hidden="true" className="size-4" /> السابق</button><button data-testid="booking-step-3-next" type="button" onClick={() => { if (validateAddress()) goToStep(4); }} className="inline-flex items-center gap-2 rounded-xl bg-[#d4af37] px-6 py-3 font-bold text-black hover:bg-[#e2c55d]">التالي <ArrowLeft aria-hidden="true" className="size-4" /></button></div>
          </div>
        )}

        {step === 4 && (
          <div aria-busy={loadingSlots}>
            <div className="mb-7 flex items-start gap-4"><div className="rounded-2xl bg-[#d4af37]/10 p-3 text-[#d4af37]"><CalendarDays aria-hidden="true" /></div><div><h2 className="text-xl font-bold">اختر الموعد</h2><p className="mt-1 text-sm text-white/50">المواعيد المعروضة محسوبة حسب الفرع ومدة الخدمة.</p></div></div>
            <div className="mb-6"><label htmlFor="booking-date" className={labelClass}>تاريخ الخدمة *</label><input id="booking-date" type="date" min={dateInputValue(new Date())} value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className={inputClass} /></div>

            <div aria-live="polite">
              {loadingSlots ? (
                <div className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 py-10 text-white/60"><LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> جاري تحميل المواعيد…</div>
              ) : slotsError ? (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5 text-sm text-amber-100"><p>{slotsError}</p><button type="button" onClick={() => setAvailabilityRetry((value) => value + 1)} className="mt-4 rounded-lg border border-amber-300/30 px-4 py-2 font-semibold hover:bg-amber-300/10">إعادة المحاولة</button></div>
              ) : availableSlots.length === 0 ? (
                <div className="rounded-2xl border border-white/10 py-10 text-center text-white/55">لا توجد مواعيد متاحة في هذا اليوم. جرّب تاريخًا آخر.</div>
              ) : (
                <fieldset><legend className="mb-3 text-sm font-semibold text-white/80">المواعيد المتاحة</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{availableSlots.map((slot) => <label key={slot.startAt} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${selectedSlot?.startAt === slot.startAt ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/10 hover:border-white/25'}`}><input type="radio" name="booking-slot" checked={selectedSlot?.startAt === slot.startAt} onChange={() => setSelectedSlot(slot)} className="size-4 accent-[#d4af37]" /><span><span className="flex items-center gap-2 font-semibold"><Clock3 aria-hidden="true" className="size-4" />{slot.timeStr}</span><span className="mt-1 block text-xs text-white/45">{slot.totalDurationMinutes} دقيقة</span></span></label>)}</div></fieldset>
              )}
            </div>

            <div className="mt-8 flex items-center justify-between gap-3"><button type="button" onClick={() => goToStep(3)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 font-semibold hover:border-white/35"><ArrowRight aria-hidden="true" className="size-4" /> السابق</button><button data-testid="booking-step-4-next" type="button" disabled={!selectedSlot || loadingSlots} onClick={() => { if (!selectedSlot) { showError('اختر موعدًا متاحًا.', 'booking-slots'); return; } goToStep(5); }} className="inline-flex items-center gap-2 rounded-xl bg-[#d4af37] px-6 py-3 font-bold text-black hover:bg-[#e2c55d] disabled:cursor-not-allowed disabled:opacity-50">التالي <ArrowLeft aria-hidden="true" className="size-4" /></button></div>
          </div>
        )}

        {step === 5 && (
          <div>
            <div className="mb-7 flex items-start gap-4"><div className="rounded-2xl bg-[#d4af37]/10 p-3 text-[#d4af37]"><UserRound aria-hidden="true" /></div><div><h2 className="text-xl font-bold">بيانات التواصل</h2><p className="mt-1 text-sm text-white/50">{useSavedContact ? 'سنستخدم بيانات حسابك المحفوظة لهذا الحجز بالاشتراك.' : 'سنستخدم هذه البيانات للتنسيق بخصوص الحجز.'}</p></div></div>
            {useSavedContact ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5">
                <p className="font-semibold text-emerald-200">بياناتك محفوظة — لن نطلب إدخالها مرة أخرى.</p>
                <p className="mt-2 text-sm text-white/65">{fullName} · <span dir="ltr">{phone}</span> · <span dir="ltr">{whatsapp}</span></p>
                <Link href="/account/profile" className="mt-3 inline-flex text-sm font-semibold text-[#d4af37] underline underline-offset-4">تعديل بيانات الحساب</Link>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2"><label htmlFor="contact-name" className={labelClass}>الاسم الكامل *</label><input id="contact-name" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" maxLength={200} aria-invalid={invalidField('contact-name')} className={inputClass} /></div>
                <div><label htmlFor="contact-phone" className={labelClass}>رقم التواصل *</label><input id="contact-phone" type="tel" dir="ltr" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" maxLength={20} aria-invalid={invalidField('contact-phone')} className={inputClass} /></div>
                <div><label htmlFor="contact-whatsapp" className={labelClass}>رقم واتساب *</label><input id="contact-whatsapp" type="tel" dir="ltr" inputMode="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} autoComplete="tel" maxLength={20} aria-invalid={invalidField('contact-whatsapp')} className={inputClass} /></div>
              </div>
            )}
            <div className="mt-5"><label htmlFor="customer-notes" className={labelClass}>ملاحظات للفريق <span className="text-white/40">(اختياري)</span></label><textarea id="customer-notes" rows={4} value={customerNotes} onChange={(event) => setCustomerNotes(event.target.value)} maxLength={1000} className={inputClass} /><p className="mt-2 text-xs text-white/40">{customerNotes.length}/1000</p></div>
            <div className="mt-8 flex items-center justify-between gap-3"><button type="button" onClick={() => goToStep(4)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 font-semibold hover:border-white/35"><ArrowRight aria-hidden="true" className="size-4" /> السابق</button><button data-testid="booking-step-5-next" type="button" onClick={() => { if (validateContact()) goToStep(6); }} className="inline-flex items-center gap-2 rounded-xl bg-[#d4af37] px-6 py-3 font-bold text-black hover:bg-[#e2c55d]">مراجعة الحجز <ArrowLeft aria-hidden="true" className="size-4" /></button></div>
          </div>
        )}

        {step === 6 && selectedArea && selectedSlot && (
          <div>
            <div className="mb-7 flex items-start gap-4"><div className="rounded-2xl bg-[#d4af37]/10 p-3 text-[#d4af37]"><ClipboardCheck aria-hidden="true" /></div><div><h2 className="text-xl font-bold">راجع الحجز</h2><p className="mt-1 text-sm text-white/50">السعر النهائي والتوفر سيؤكدهما النظام عند الإرسال.</p></div></div>
            <dl className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.025] px-5">
              <div className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]"><dt className="text-sm text-white/45">السيارة</dt><dd className="font-medium">{vehicleMake} {vehicleModel} · {vehicleYear} · {vehicleColor}</dd></div>
              <div className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]"><dt className="text-sm text-white/45">العنوان</dt><dd className="font-medium">{selectedArea.compound}، {street}، {buildingNumber}</dd></div>
              <div className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]"><dt className="text-sm text-white/45">الموعد</dt><dd className="font-medium">{dateFormatter.format(new Date(selectedSlot.startAt))}</dd></div>
              <div className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]"><dt className="text-sm text-white/45">التواصل</dt><dd className="font-medium">{fullName} · <span dir="ltr">{phone}</span></dd></div>
              <div className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]"><dt className="text-sm text-white/45">الاشتراك</dt><dd className="font-medium">{selectedSubscriptionId ? selectedSubscription?.plan.nameAr : 'بدون اشتراك'}</dd></div>
            </dl>

            <div className="mt-6 rounded-2xl border border-[#d4af37]/25 bg-[#d4af37]/[0.06] p-5">
              <div className="flex items-center justify-between gap-4"><span className="text-white/65">الإجمالي التقديري</span><strong className="text-xl text-[#d4af37]">{formatCurrency(estimatedTotal)}</strong></div>
              {estimatedCreditApplied > 0 ? <div className="mt-3 flex items-center justify-between gap-4 text-sm text-emerald-300"><span>رصيد مستخدم</span><span>-{formatCurrency(estimatedCreditApplied)}</span></div> : null}
              <div className="mt-3 flex items-center justify-between gap-4 text-sm"><span className="text-white/55">المطلوب مبدئيًا للتحويل</span><span>{formatCurrency(estimatedTransferAmount)}</span></div>
              <p className="mt-3 text-xs text-white/40">يحسب الخادم المبلغ النهائي بعد إعادة التحقق من الموعد والاشتراك.</p>
            </div>

            {creditBalance > 0 ? <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4"><input id="use-credit" type="checkbox" checked={useCredit} onChange={(event) => setUseCredit(event.target.checked)} className="mt-1 size-4 accent-emerald-400" /><span className="text-sm leading-7 text-white/70"><strong className="block text-emerald-300">استخدم رصيد التعويضات</strong>المتاح: {formatCurrency(creditBalance)}. سيُخصم فقط ما يغطي هذا الحجز، ويُسجل في كشف الرصيد.</span></label> : null}

            <details className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-white/65">
              <summary className="cursor-pointer font-semibold text-white/85">
                {service.cancellationPolicy.nameAr} · الإصدار {service.cancellationPolicy.version}
              </summary>
              <div className="mt-3 space-y-2 leading-7">
                <p>
                  {service.cancellationPolicy.allowsCancellation
                    ? service.cancellationPolicy.noticeHours === 0
                      ? 'يمكن تقديم طلب الإلغاء حتى قبل بدء موعد الخدمة.'
                      : `مهلة الإلغاء المبكر: ${service.cancellationPolicy.noticeHours} ساعة قبل الموعد.`
                    : 'هذه الخدمة لا تتيح طلب الإلغاء من الحساب.'}
                  {service.cancellationPolicy.allowsCancellation && service.cancellationPolicy.allowsLateRequests
                    ? ' الطلب المتأخر يُرسل للمراجعة ولا يعني استردادًا تلقائيًا.'
                    : ''}
                </p>
                <p>
                  {service.cancellationPolicy.allowsRescheduling
                    ? 'تسري المهلة نفسها على طلب تعديل الموعد.'
                    : 'هذه الخدمة لا تتيح طلب تعديل الموعد من الحساب.'}
                </p>
                <p className="whitespace-pre-line text-white/50">{service.cancellationPolicy.policyTextAr}</p>
              </div>
            </details>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 p-4"><input id="policy-accepted" type="checkbox" checked={policyAccepted} onChange={(event) => setPolicyAccepted(event.target.checked)} aria-invalid={invalidField('policy-accepted')} className="mt-1 size-4 accent-[#d4af37]" /><span className="text-sm leading-7 text-white/70">أوافق على <Link href="/policies/booking" className="font-semibold text-[#d4af37] underline underline-offset-4">سياسة الحجز</Link> وعلى سياسة الإلغاء الموضحة أعلاه. <Link href="/policies/cancellation" className="font-semibold text-[#d4af37] underline underline-offset-4">التفاصيل العامة</Link>.</span></label>

            <div className="mt-8 flex items-center justify-between gap-3"><button type="button" disabled={bookingSubmitting} onClick={() => goToStep(5)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 font-semibold hover:border-white/35 disabled:opacity-50"><ArrowRight aria-hidden="true" className="size-4" /> السابق</button><button data-testid="booking-submit" type="button" onClick={createBooking} disabled={bookingSubmitting} aria-busy={bookingSubmitting} className="inline-flex min-w-40 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-6 py-3 font-bold text-black hover:bg-[#e2c55d] disabled:cursor-not-allowed disabled:opacity-50">{bookingSubmitting ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> جاري تأكيد الحجز…</> : <><ShieldCheck aria-hidden="true" className="size-4" /> تأكيد الحجز</>}</button></div>
          </div>
        )}

        {step === 7 && createdBooking && (
          <form onSubmit={submitPaymentProof}>
            <div className="mb-7 flex items-start gap-4"><div className="rounded-2xl bg-emerald-400/10 p-3 text-emerald-300"><CheckCircle2 aria-hidden="true" /></div><div><h2 className="text-xl font-bold">تم إنشاء طلب الحجز</h2><p className="mt-1 text-sm text-white/50">رقم الحجز: <span dir="ltr" className="font-semibold text-white">{createdBooking.number}</span></p></div></div>

            <div className="mb-7 rounded-2xl border border-[#d4af37]/25 bg-[#d4af37]/[0.06] p-5"><p className="text-sm text-white/55">المبلغ المطلوب وفق تأكيد النظام</p><p className="mt-2 text-3xl font-bold text-[#d4af37]">{formatCurrency(createdBooking.depositAmount)}</p></div>

            <fieldset id="payment-methods" className="mb-7" aria-invalid={invalidField('payment-methods')}>
              <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80"><CreditCard aria-hidden="true" className="size-4 text-[#d4af37]" /> وسيلة التحويل *</legend>
              {availablePaymentMethods.length > 0 ? <div className="space-y-3">{availablePaymentMethods.map((method) => <label key={method.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${selectedPaymentMethodId === method.id ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/10'}`}><input type="radio" name="payment-method" value={method.id} checked={selectedPaymentMethodId === method.id} onChange={() => setSelectedPaymentMethodId(method.id)} className="mt-1 size-4 accent-[#d4af37]" /><span><span className="block font-semibold">{method.name}</span><span className="mt-1 block text-sm text-white/55">{paymentTypeLabels[method.type] ?? method.type} · {method.accountName}</span><span dir="ltr" className="mt-1 block text-sm font-semibold text-[#d4af37]">{method.accountNumber}</span>{method.instructions && <span className="mt-2 block text-xs leading-6 text-white/45">{method.instructions}</span>}</span></label>)}</div> : <div role="alert" className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5 text-sm text-amber-100">لا توجد وسيلة تحويل نشطة لهذا الفرع. <Link href="/contact" className="font-semibold underline underline-offset-4">تواصل معنا</Link> مع ذكر رقم الحجز.</div>}
            </fieldset>

            <div className="grid gap-5 sm:grid-cols-2">
              <div><label htmlFor="sender-name" className={labelClass}>اسم صاحب التحويل *</label><input id="sender-name" required minLength={2} maxLength={200} value={senderName} onChange={(event) => setSenderName(event.target.value)} autoComplete="name" className={inputClass} /></div>
              <div><label htmlFor="sender-account" className={labelClass}>رقم الهاتف أو الحساب *</label><input id="sender-account" required minLength={3} maxLength={100} dir="ltr" value={senderPhoneOrAccount} onChange={(event) => setSenderPhoneOrAccount(event.target.value)} autoComplete="off" className={inputClass} /></div>
              <div><label htmlFor="reference-number" className={labelClass}>رقم العملية <span className="text-white/40">(اختياري)</span></label><input id="reference-number" maxLength={100} dir="ltr" value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} autoComplete="off" className={inputClass} /></div>
              <div><label htmlFor="amount-submitted" className={labelClass}>المبلغ الذي تم تحويله *</label><input id="amount-submitted" type="number" required min={1} step={1} inputMode="numeric" value={amountSubmitted} onChange={(event) => setAmountSubmitted(event.target.value)} aria-invalid={invalidField('amount-submitted')} className={inputClass} /></div>
              <div className="sm:col-span-2"><label htmlFor="transfer-time" className={labelClass}>وقت التحويل *</label><input id="transfer-time" type="datetime-local" required max={dateTimeInputValue(new Date())} value={transferTimestamp} onChange={(event) => setTransferTimestamp(event.target.value)} className={inputClass} /></div>
            </div>

            <div className="mt-6">
              <label htmlFor="payment-proof-file" className="flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-white/20 bg-white/[0.025] px-5 py-8 text-center transition-colors hover:border-[#d4af37]">
                <UploadCloud aria-hidden="true" className="mb-3 size-8 text-[#d4af37]" />
                <span className="font-semibold">اختر إثبات التحويل *</span>
                <span id="proof-file-help" className="mt-2 text-xs text-white/45">JPG أو PNG أو WEBP أو PDF، بحد أقصى 10 ميجابايت.</span>
                {proofFile && <span className="mt-3 rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-white/75">{proofFile.name} · {formatBytes(proofFile.size)}</span>}
              </label>
              <input id="payment-proof-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" onChange={onProofFileChange} aria-describedby="proof-file-help" aria-invalid={invalidField('payment-proof-file')} className="sr-only" />
              {uploadedProofFileId && <p role="status" className="mt-3 text-sm text-emerald-300">تم رفع الملف. إذا فشل إرسال البيانات سنعيد استخدامه تلقائيًا.</p>}
            </div>

            <button type="submit" disabled={proofStage !== 'idle' || availablePaymentMethods.length === 0 || (!proofFile && !uploadedProofFileId)} aria-busy={proofStage !== 'idle'} className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-6 py-3.5 font-bold text-black hover:bg-[#e2c55d] disabled:cursor-not-allowed disabled:opacity-50">{proofStage === 'uploading-file' ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> جاري رفع الملف…</> : proofStage === 'submitting-proof' ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> جاري إرسال بيانات التحويل…</> : <><ShieldCheck aria-hidden="true" className="size-4" /> إرسال الإثبات للمراجعة</>}</button>
          </form>
        )}
      </div>
    </section>
  );
}
