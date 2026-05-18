import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
  }).format(d);
}

export function getProductSku(baseSku: string, size?: string) {
  if (!size) return baseSku;
  return `${baseSku}.${size}`;
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
