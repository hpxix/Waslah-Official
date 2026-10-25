import type { LeadRun } from './directus';

export function compactRunTitle(title: string, ar: boolean) {
  const clean = title.replace(/^people\s+likely\s+to\s+buy\s*/i, '')
    .replace(/^(?:أشخاص|عملاء)\s+(?:من المحتمل|محتملون).*?(?:لشراء|يشترون)\s*/u, '').trim();
  return clean || (ar ? 'بحث عن عملاء' : 'Lead search');
}

export function leadRunStatus(status: string, ar: boolean) {
  const normalized = status.toLowerCase();
  if (['running', 'sourcing', 'researching', 'processing'].includes(normalized)) return { label: ar ? 'جارٍ البحث' : 'Searching', tone: 'live' };
  if (['queued', 'pending'].includes(normalized)) return { label: ar ? 'في الانتظار' : 'Queued', tone: 'neutral' };
  if (normalized === 'partial') return { label: ar ? 'نتائج جزئية' : 'Partial', tone: 'neutral' };
  if (['failed', 'cancelled', 'canceled', 'stopped'].includes(normalized)) return { label: ar ? 'متوقف' : 'Stopped', tone: 'neutral' };
  if (['completed', 'complete', 'sourced', 'delivered', 'success'].includes(normalized)) return { label: ar ? 'مكتمل' : 'Complete', tone: 'complete' };
  return { label: ar ? 'محفوظ' : 'Saved', tone: 'neutral' };
}

export function leadRunModel(run: Pick<LeadRun, 'type' | 'contact_route'>) {
  return run.contact_route === 'astraeus_ultra' ? 'Ultra' : run.contact_route === 'astraeus' || run.type === 'b2b' ? 'Astraeus' : 'Lite';
}

export function shortRunDate(value: string, ar: boolean) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-GB', {
    day: 'numeric', month: 'short', calendar: 'gregory', timeZone: 'Asia/Riyadh',
  }).format(date);
}
