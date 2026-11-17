export function formatINR(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatNumber(val: number): string {
  const safe = Number.isFinite(val) ? val : 0;
  return new Intl.NumberFormat('en-IN').format(safe);
}

/**
 * Returns today's date in YYYY-MM-DD using Asia/Kolkata timezone.
 */
export function getTodayIST(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

export function addDaysIST(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Formats YYYY-MM-DD as DD-MM-YYYY per business standard.
 */
export function formatDateDDMMYYYY(isoDate?: string | null): string {
  if (!isoDate) return '-';
  const clean = isoDate.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function formatTimestampIST(ts?: { toDate?: () => Date } | null): string {
  if (!ts || typeof ts.toDate !== 'function') return '-';
  const date = ts.toDate();
  const datePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
    .format(date)
    .replace(/\//g, '-');
  const timePart = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return `${datePart} ${timePart}`;
}

export type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

export function getDateRangeForPreset(
  preset: DatePreset,
  customFrom?: string,
  customTo?: string
): { from: string; to: string } {
  const today = getTodayIST();
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const y = addDaysIST(today, -1);
    return { from: y, to: y };
  }
  if (preset === 'this_week') {
    const [y, m, d] = today.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const day = dt.getUTCDay(); // 0=Sun..6=Sat
    const diffToMon = day === 0 ? -6 : 1 - day;
    return { from: addDaysIST(today, diffToMon), to: today };
  }
  if (preset === 'this_month') {
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }
  return {
    from: customFrom || `${today.slice(0, 7)}-01`,
    to: customTo || today,
  };
}

export function isDateInRange(dateStr: string | undefined, from: string, to: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= from && d <= to;
}

export function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function makeInvoiceNumber(prefix: string, seqHint?: number): string {
  const today = getTodayIST().replace(/-/g, '').slice(2); // YYMMDD
  const suffix = seqHint ? String(seqHint).padStart(4, '0') : String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}-${today}-${suffix}`;
}

export function emailToInviteId(email: string): string {
  const cleaned = email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `inv_${cleaned}`.slice(0, 120);
}

export function roundMoney(val: number): number {
  return Math.round((Number(val) || 0) * 100) / 100;
}

/**
 * Compresses an uploaded image file on an offscreen canvas so it safely fits within
 * Firestore limits if Firebase Storage is unavailable, or uploads cleanly.
 */
export async function compressImageToDataUrl(file: File, maxSize = 280, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
