export function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, '')}`;
}

export function whatsappHref(phone: string, message?: string) {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `2${digits}`;
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
