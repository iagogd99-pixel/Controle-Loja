import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toZonedTime, format } from 'date-fns-tz';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BR_TIMEZONE = 'America/Sao_Paulo';

export function getBrasiliaTime() {
  return toZonedTime(new Date(), BR_TIMEZONE);
}

export function getBrasiliaISO() {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx", { timeZone: BR_TIMEZONE });
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDate(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BR_TIMEZONE,
  }).format(d);
}

export function getProductSku(baseSku: string, size?: string) {
  if (!size) return baseSku;
  return `${baseSku}.${size}`;
}

export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === undefined) return null as any;
  if (obj === null) return null as any;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)) as any;
  }

  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key of Object.keys(obj as any)) {
      const val = (obj as any)[key];
      if (val !== undefined) {
        cleaned[key] = sanitizeForFirestore(val);
      } else {
        cleaned[key] = null;
      }
    }
    return cleaned as T;
  }

  return obj;
}

export function sortSizes(sizes: string[]) {
  return [...sizes].sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);

    // If both are numbers, sort numerically
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }

    // Otherwise fallback to alphanumeric sorting
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}
