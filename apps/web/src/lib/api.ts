export interface Payee {
  id: number;
  type: 'person' | 'company';
  name: string;
  defaultCategoryId: number | null;
  defaultPaymentMethodId: number | null;
  active: boolean;
  favourite: boolean;
  notes: string | null;
  aliases: string[];
  paymentCount: number;
  totalPaidPaise: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
  active: boolean;
  sortOrder: number;
  aliases: string[];
}

export interface PaymentMethod {
  id: number;
  code: string;
  displayName: string;
  active: boolean;
}

export interface MasterData {
  payees: Payee[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
}

export interface LedgerTransaction {
  id: number;
  transactionDate: string;
  transactionTime: string;
  payeeId: number;
  payeeName: string;
  amountPaise: number;
  categoryId: number | null;
  categoryName: string | null;
  paymentMethodId: number | null;
  paymentMethodName: string | null;
  paymentMethodCode: string | null;
  note: string | null;
  source: string;
  status: 'posted' | 'voided';
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface QuickPreview {
  command: string;
  valid: boolean;
  payeeId: number | null;
  payeeName: string | null;
  isNewPayee: boolean;
  amountPaise: number | null;
  categoryId: number | null;
  categoryName: string | null;
  paymentMethodId: number | null;
  paymentMethodName: string | null;
  transactionDate: string | null;
  transactionTime: string | null;
  note: string | null;
  needsReview: boolean;
  errors: string[];
  warnings: string[];
}

export function formatTime12(value: string): string {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${minute} ${period}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function patch<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function formatInr(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(paise / 100);
}

export function rupeesToPaise(value: string): number | null {
  const normalized = value.trim().replaceAll(',', '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

export function queryString(
  values: Record<string, string | number | boolean | null | undefined>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}
