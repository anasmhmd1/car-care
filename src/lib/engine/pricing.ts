export type DepositType = 'FIXED' | 'PERCENTAGE';

export interface PriceComponent {
  price: number;
  durationMinutes: number;
  slotCount?: number;
}

export interface BookingQuoteInput {
  base: PriceComponent;
  addons?: readonly PriceComponent[];
  depositRequired: boolean;
  fullPrepayment: boolean;
  depositType: DepositType;
  depositValue: number;
  subscriptionCoversBase?: boolean;
}

export interface BookingQuote {
  basePrice: number;
  addonPrice: number;
  totalPrice: number;
  depositAmount: number;
  totalDurationMinutes: number;
  slotCount: number;
}

function assertMoney(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer.`);
}

export function calculateDeposit(
  totalPrice: number,
  required: boolean,
  fullPrepayment: boolean,
  type: DepositType,
  value: number,
): number {
  assertMoney(totalPrice, 'totalPrice');
  assertMoney(value, 'depositValue');
  if (totalPrice === 0 || !required) return 0;
  if (fullPrepayment) return totalPrice;
  const requested = type === 'PERCENTAGE' ? Math.ceil(totalPrice * Math.min(value, 100) / 100) : value;
  return Math.min(totalPrice, requested);
}

export function calculateBookingQuote(input: BookingQuoteInput): BookingQuote {
  assertMoney(input.base.price, 'base.price');
  if (!Number.isInteger(input.base.durationMinutes) || input.base.durationMinutes <= 0) {
    throw new Error('base.durationMinutes must be a positive integer.');
  }
  if (!Number.isInteger(input.base.slotCount ?? 1) || (input.base.slotCount ?? 1) < 1) {
    throw new Error('base.slotCount must be a positive integer.');
  }

  const addons = input.addons ?? [];
  for (const addon of addons) {
    assertMoney(addon.price, 'addon.price');
    if (!Number.isInteger(addon.durationMinutes) || addon.durationMinutes < 0) {
      throw new Error('addon.durationMinutes must be a non-negative integer.');
    }
    if (!Number.isInteger(addon.slotCount ?? 0) || (addon.slotCount ?? 0) < 0) {
      throw new Error('addon.slotCount must be a non-negative integer.');
    }
  }

  const basePrice = input.subscriptionCoversBase ? 0 : input.base.price;
  const addonPrice = addons.reduce((total, addon) => total + addon.price, 0);
  const totalPrice = basePrice + addonPrice;
  return {
    basePrice,
    addonPrice,
    totalPrice,
    depositAmount: calculateDeposit(
      totalPrice,
      input.depositRequired,
      input.fullPrepayment,
      input.depositType,
      input.depositValue,
    ),
    totalDurationMinutes: input.base.durationMinutes + addons.reduce((total, addon) => total + addon.durationMinutes, 0),
    slotCount: (input.base.slotCount ?? 1) + addons.reduce((total, addon) => total + (addon.slotCount ?? 0), 0),
  };
}
