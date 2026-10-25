import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Activity, Clock3, Gauge, Pause, RefreshCw, Save, ShieldCheck, Unlock, X } from 'lucide-react';
import { apiErrorMessage, controlHarajSafety, fetchHarajSafety } from '../lib/directus';
import type { HarajSafetyLimits, HarajSafetyState } from '../lib/directus';
import './admin-haraj.css';

const fields: Array<{ key: keyof HarajSafetyLimits; en: string; ar: string; min: number; max: number }> = [
  { key: 'intervalMs', en: 'Minimum request gap · ms', ar: 'أقل فاصل بين الطلبات · مللي ثانية', min: 1000, max: 3600000 },
  { key: 'requestsPerDay', en: 'Shared daily request budget · 0 = no internal cap', ar: 'ميزانية الطلبات اليومية · 0 = دون حد داخلي', min: 0, max: 10000 },
  { key: 'contactsPerDay', en: 'Daily phone-lookup budget', ar: 'ميزانية كشف الأرقام اليومية', min: 1, max: 1000 },
  { key: 'emptyContactLimit', en: 'Stop after consecutive empty lookups', ar: 'إيقاف كشف الأرقام بعد نتائج فارغة متتالية', min: 1, max: 20 },
];
const labels: Record<string, [string, string]> = {
  invalid_response: ['Invalid response structure', 'بنية استجابة غير صالحة'],
  authentication_rejected: ['Credential rejected', 'رُفض رمز الوصول'], access_restricted: ['Provider access restricted', 'الوصول مقيد لدى المزوّد'],
  rate_limited: ['Provider rate limit', 'حد الطلبات لدى المزوّد'], daily_request_budget_reached: ['Daily request budget reached', 'اكتملت الميزانية اليومية'],
  repeated_empty_contacts: ['Repeated empty phone lookups', 'طلبات أرقام فارغة متكررة'], admin_paused: ['Paused by administrator', 'أوقفه المسؤول'],
  access_review_required: ['Initial access review required', 'مراجعة صلاحية الوصول مطلوبة'], request_failed: ['Request failed', 'فشل الطلب'],
  ok: ['Valid response', 'استجابة صالحة'], empty: ['Valid empty response', 'استجابة فارغة صالحة'],
  search: ['Listing search', 'بحث الإعلانات'], contact: ['Phone lookup', 'كشف رقم'], pause: ['Connection paused', 'إيقاف الاتصال'],
  admin_resume: ['Admin released restriction', 'أزال المسؤول القيد'], admin_configure: ['Performance settings saved', 'حُفظت إعدادات الأداء'],
  contact_pause: ['Phone lookups paused', 'إيقاف كشف الأرقام'],
  connection_paused: ['Connection requires review', 'الاتصال يحتاج مراجعة'], response_errors: ['Recent response failures', 'إخفاقات حديثة في الاستجابة'],
  budget_pressure: ['Daily budget above 80%', 'تجاوز استهلاك الميزانية ٨٠٪'], fast_pacing: ['Request gap below 3 seconds', 'الفاصل بين الطلبات أقل من ٣ ثوانٍ'],
  empty_contacts: ['Consecutive empty phone results', 'نتائج أرقام فارغة متتالية'], contacts_paused: ['Phone circuit remains paused', 'كشف الأرقام ما زال موقوفاً'],
  no_recent_samples: ['No requests observed in the last 24 hours', 'لم تُرصد طلبات خلال آخر ٢٤ ساعة'],
  invalid_json: ['Missing or unreadable JSON', 'JSON مفقود أو غير قابل للقراءة'], missing_search: ['Missing search data', 'بيانات البحث مفقودة'],
  invalid_items: ['Listing items are not an array', 'قائمة الإعلانات ليست مصفوفة'], missing_pagination: ['Pagination flag is missing or invalid', 'مؤشر الصفحات مفقود أو غير صالح'],
  invalid_contact: ['Missing contact response field', 'حقل استجابة التواصل مفقود'],
};

export function AdminHarajSafety({ ar }: { ar: boolean }) {
  const [state, setState] = useState<HarajSafetyState | null>(null);
  const [limits, setLimits] = useState<HarajSafetyLimits | null>(null);
  const [action, setAction] = useState<'resume' | 'configure' | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [searchOnly, setSearchOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = useRef(false);
  const loading = useRef(false);
  const text = (key: string) => labels[key]?.[ar ? 1 : 0] || key;
  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const data = await fetchHarajSafety();
      setState(data); setLimits(current => dirty.current ? current : data.limits); setError('');
    } catch (e) { setError(apiErrorMessage(e)); }
    finally { loading.current = false; }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 10000); return () => window.clearInterval(timer); }, [load]);
  const performance = state?.performance;
  const needsReview = Boolean(state?.paused || state?.contactsPaused);
  const changed = Boolean(limits && state && fields.some(field => limits[field.key] !== state.limits[field.key]));
  const valid = Boolean(limits && fields.every(f => Number.isInteger(limits[f.key]) && limits[f.key] >= f.min && limits[f.key] <= f.max) && (limits.requestsPerDay===0 || limits.contactsPerDay <= limits.requestsPerDay));
  const cooldown = Boolean(state?.retryAt && state.retryAt > Date.now());
  const blocked = busy || Boolean(state?.inFlight) || cooldown;
  const edit = (next: HarajSafetyLimits) => { dirty.current = true; setLimits(next); setNotice(''); };
  const openReview = (next: 'resume' | 'configure') => { setConfirmed(false); setSearchOnly(true); setError(''); setAction(next); };
  async function change(next: 'pause' | 'resume' | 'configure') {
    if (busy || !state || !limits) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await controlHarajSafety(next, limits, confirmed, searchOnly);
      dirty.current = false; setState(data); setLimits(data.limits); setConfirmed(false); setAction(null);
      setNotice(next === 'resume'
        ? ar ? 'أُزيل قيد وصلة. ابدأ بحثاً جديداً عند الجاهزية؛ لم تُعَد أي حملة تلقائياً.' : 'Wasla restriction released. Start a new search when ready; no campaign was restarted.'
        : next === 'configure' ? ar ? 'حُفظت الإعدادات. لم تتغير حالة الإيقاف أو الاستهلاك.' : 'Settings saved. Pause state and usage were preserved.'
        : ar ? 'أُوقفت جميع طلبات حراج.' : 'All Haraj requests paused.');
    } catch (e) { setError(apiErrorMessage(e)); }
    finally { setBusy(false); }
  }
  const time = (value: string | number) => new Date(value).toLocaleString(ar ? 'ar-SA' : 'en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Riyadh' });
  const score = performance?.risk.score ?? null;
  const level = performance?.risk.level || 'unknown';
  const levelText = { unknown: ar ? 'بيانات غير كافية' : 'Insufficient data', low: ar ? 'ضغط منخفض' : 'Low pressure', elevated: ar ? 'ضغط مرتفع' : 'Elevated pressure', review: ar ? 'المراجعة مطلوبة' : 'Review required' }[level];

  return <div className="haraj-console" dir={ar ? 'rtl' : 'ltr'}>
    <header className="haraj-console__heading"><div><span className="haraj-eyebrow"><Activity size={14}/> HARAJ / LITE</span><h2>{ar ? 'أداء اتصال حراج' : 'Haraj connection control'}</h2><p>{ar ? 'تحكم مشترك لجميع حملات عملائك. تحديث كل ١٠ ثوانٍ دون إرسال طلبات إلى حراج.' : 'Shared controls for all client campaigns. Refreshes every 10 seconds without calling Haraj.'}</p></div><button onClick={() => void load()} disabled={busy}><RefreshCw size={15}/>{ar ? 'تحديث' : 'Refresh'}</button></header>
    {error && <p className="haraj-alert is-error" role="alert">{error}</p>}
    {notice && <p className="haraj-alert" role="status">{notice}</p>}
    {!state || !limits ? <p role="status">{ar ? 'جارٍ تحميل حالة الاتصال…' : 'Loading connection telemetry…'}</p> : <>
      <section className="haraj-status">
        <div><span className={`haraj-status__dot ${state.paused ? 'is-paused' : ''}`}/><div><strong>{state.paused ? ar ? 'البحث موقوف' : 'Search paused' : ar ? 'البحث المحمي مفعّل' : 'Guarded search enabled'}</strong><p>{state.reason ? text(state.reason) : ar ? 'طابور واحد · طلب واحد في كل مرة' : 'One shared queue · one request at a time'}</p>{state.reason && <code>{state.reason}</code>}</div></div>
        <div className="haraj-actions"><button className="is-primary" disabled={!needsReview || blocked || !valid} onClick={() => openReview('resume')}><Unlock size={16}/>{ar ? 'إزالة قيد وصلة' : 'Remove Wasla restriction'}</button><button disabled={busy || state.paused} onClick={() => void change('pause')}><Pause size={15}/>{ar ? 'إيقاف الاتصال' : 'Pause connection'}</button></div>
      </section>
      {cooldown && <p className="haraj-alert">{ar ? 'فترة انتظار المزوّد سارية حتى' : 'Provider cooldown remains in force until'} {time(state.retryAt!)}. {ar ? 'لا يمكن تجاوزها من هذه اللوحة.' : 'This panel cannot bypass it.'}</p>}
      {state.inFlight && <p className="haraj-alert">{ar ? 'طلب قيد التنفيذ. انتظر انتهاؤه قبل إزالة القيد.' : 'A request is in flight. Wait for completion before releasing the restriction.'}</p>}
      <div className="haraj-metrics">
        <Metric icon={<Activity size={16}/>} label={ar ? 'الطلبات اليوم · UTC' : 'Requests today · UTC'} value={`${performance?.dailyRequests ?? state.requests} / ${state.limits.requestsPerDay || '∞'}`} hint={ar ? 'شامل جميع حملات العملاء' : 'Across all client campaigns'}/>
        <Metric icon={<ShieldCheck size={16}/>} label={ar ? 'الاستجابات المقبولة' : 'Valid responses'} value={performance?.successRate == null ? '—' : `${performance.successRate}%`} hint={`${performance?.successful ?? 0} / ${performance?.sampleCount ?? 0} ${ar ? 'ضمن العينة الحديثة' : 'in the recent sample'}`}/>
        <Metric icon={<Clock3 size={16}/>} label={ar ? 'زمن الاستجابة · P95' : 'Response latency · P95'} value={performance?.p95Ms == null ? '—' : `${performance.p95Ms} ms`} hint={performance?.latencySampleCount ? `${performance.latencySampleCount} ${ar ? 'طلباً مقاساً' : 'timed requests'}` : ar ? 'يبدأ القياس من الطلب التالي' : 'Timing starts with the next request'}/>
        <Metric icon={<Gauge size={16}/>} label={ar ? 'سقف الوتيرة المضبوط' : 'Configured pacing ceiling'} value={`${Math.round(60000 / state.limits.intervalMs * 10) / 10} / min`} hint={ar ? 'سقف نظري، وليس معدل نتائج مضموناً' : 'Theoretical ceiling, not guaranteed throughput'}/>
      </div>
      <div className="haraj-console__grid">
        <section className={`haraj-card haraj-risk is-${level}`}><span className="haraj-eyebrow">{ar ? 'مؤشر الضغط التشغيلي' : 'OPERATIONAL PRESSURE'}</span><div className="haraj-risk__score"><strong>{score ?? '—'}<small>/100</small></strong><span>{levelText}</span></div>
          <div className="haraj-risk__track" role={score == null ? 'status' : 'meter'} aria-label={ar ? 'مؤشر الضغط الداخلي' : 'Internal operational pressure'} aria-valuemin={score == null ? undefined : 0} aria-valuemax={score == null ? undefined : 100} aria-valuenow={score ?? undefined}><i style={{ width: `${score ?? 0}%` }}/></div>
          <p>{ar ? 'تقييم داخلي لبنية الاتصال والأخطاء والاستهلاك والوتيرة. ليس احتمال حظر ولا اعتماداً من حراج.' : 'Internal assessment of connection state, failures, budget usage and pacing. Not a ban probability or Haraj approval.'}</p>
          <ul>{performance?.risk.reasons.map(reason => <li key={reason}>{text(reason)}</li>)}</ul>
          <div className="haraj-risk__details"><span>{ar ? 'كشف الأرقام' : 'Phone lookups'}<b>{state.contactsPaused ? ar ? 'موقوف' : 'Paused' : ar ? 'محمي' : 'Guarded'}</b></span><span>{ar ? 'استخدام كشف الأرقام اليوم' : 'Phone lookups today'}<b>{performance?.dailyContacts ?? state.contacts} / {state.limits.contactsPerDay}</b></span></div>
          <p>{ar ? 'Lite يستخدم الأرقام المنشورة فقط في ملفه الحالي. إزالة قيد البحث لا تعيد كشف الأرقام افتراضياً.' : 'The current Lite profile uses public phone evidence only. Releasing search does not resume phone lookups by default.'}</p>
        </section>
        <section className="haraj-card"><span className="haraj-eyebrow">{ar ? 'إعدادات الأداء المشتركة' : 'SHARED PERFORMANCE SETTINGS'}</span><h3>{ar ? 'اضبط الوتيرة، لا الحماية.' : 'Tune delivery pressure.'}</h3><p>{ar ? 'تطبق الوتيرة على الطلبات التالية لجميع العملاء. الحدود احترازية داخلية وليست حدوداً معتمدة من حراج.' : 'Pacing applies to subsequent requests for every client. These are internal ceilings, not Haraj-approved limits.'}</p>
          <div className="haraj-presets">{[{ en: 'Lower pressure', ar: 'ضغط أقل', intervalMs: 10000, requestsPerDay: 300, contactsPerDay: 10 }, { en: 'Conservative', ar: 'محافظ', intervalMs: 6000, requestsPerDay: 500, contactsPerDay: 25 }, { en: 'Default', ar: 'الافتراضي', intervalMs: 3000, requestsPerDay: 1000, contactsPerDay: 100 }].map(p => <button key={p.en} disabled={busy} onClick={() => edit({ intervalMs: p.intervalMs, requestsPerDay: p.requestsPerDay, contactsPerDay: p.contactsPerDay, emptyContactLimit: 5 })}>{ar ? p.ar : p.en}</button>)}</div>
          <div className="haraj-fields">{fields.map(field => <label key={field.key} htmlFor={`haraj-${field.key}`}><span>{ar ? field.ar : field.en}</span><input id={`haraj-${field.key}`} type="number" min={field.min} max={field.max} step={1} disabled={busy} value={Number.isNaN(limits[field.key]) ? '' : limits[field.key]} onChange={event => edit({ ...limits, [field.key]: event.target.value === '' ? NaN : Number(event.target.value) })}/></label>)}</div>
          {!valid && <p role="alert">{ar ? 'أدخل حدوداً صحيحة. ميزانية كشف الأرقام لا تتجاوز إجمالي الطلبات.' : 'Enter valid limits. Phone lookups cannot exceed the total request budget.'}</p>}
          <div className="haraj-actions"><button className="is-primary" disabled={busy || !valid || !changed} onClick={() => openReview('configure')}><Save size={15}/>{ar ? 'حفظ إعدادات الأداء' : 'Save performance settings'}</button>{changed && <span>{ar ? 'تغييرات غير محفوظة' : 'Unsaved changes'}</span>}</div><p>{ar ? 'الحفظ لا يلغي الإيقاف ولا يمسح الاستهلاك. لا نغيّر العدد المطلوب أو معايير تأهيل العميل.' : 'Saving never clears a pause or resets usage. Requested lead counts and qualification rules stay unchanged.'}</p>
        </section>
      </div>
      <section className="haraj-card haraj-events"><div><span className="haraj-eyebrow">{ar ? 'سجل الاتصال' : 'CONNECTION TIMELINE'}</span><h3>{ar ? 'HTTP 200 لا يعني دائماً بيانات مقبولة.' : 'HTTP status and usable data, side by side.'}</h3><p>{ar ? 'المؤشرات من طلبات آخر ٢٤ ساعة ضمن أحدث ٥٠ حدثاً محفوظاً؛ ليست إحصاءات كاملة. الأوقات بتوقيت الرياض.' : 'Metrics cover requests in the last 24 hours within the latest 50 stored events—not complete historical totals. Times are Riyadh time.'}</p></div>
        <div className="haraj-events__scroll"><table><thead><tr>{(ar ? ['الوقت', 'العملية', 'HTTP', 'النتيجة', 'الزمن'] : ['Time', 'Operation', 'HTTP', 'Outcome', 'Latency']).map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{[...state.events].reverse().map((event, i) => <tr key={`${event.at}-${i}`}><td>{time(event.at)}</td><td>{text(event.kind)}</td><td><code>{event.status ?? '—'}</code></td><td><span className={event.outcome && !['ok', 'empty'].includes(event.outcome) ? 'haraj-event-error' : ''}>{text(event.outcome || event.reason || event.kind)}</span>{event.diagnostic && <small>{text(event.diagnostic)}</small>}{event.scope && <small>{event.scope === 'search' ? ar ? 'البحث فقط' : 'Search only' : ar ? 'البحث وكشف الأرقام' : 'Search and phone lookups'}</small>}</td><td>{event.durationMs == null ? '—' : `${event.durationMs} ms`}</td></tr>)}</tbody></table>{!state.events.length && <p>{ar ? 'لا توجد أحداث بعد.' : 'No events recorded yet.'}</p>}</div>
        <p className="haraj-telemetry-note">{performance?.generatedAt && `${ar ? 'آخر تحديث:' : 'Updated:'} ${time(performance.generatedAt)} · `}{ar ? 'لا تُعرض رموز الوصول أو بيانات العملاء في السجل.' : 'Tokens and client contact data are never shown in this log.'}</p>
      </section>
      {!state.alertEmailConfigured && <p className="haraj-alert">{ar ? 'تنبيهات البريد غير جاهزة؛ إعدادات SMTP غير مكتملة. الحماية مستمرة.' : 'Email alerts are unavailable: SMTP is incomplete. Request protection remains active.'}</p>}
    </>}
    <Dialog.Root open={action !== null} onOpenChange={open => { if (!open && !busy) setAction(null); }}><Dialog.Portal><Dialog.Overlay className="haraj-dialog-overlay"/><Dialog.Content className="haraj-dialog" dir={ar ? 'rtl' : 'ltr'} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
      <Dialog.Title>{action === 'resume' ? ar ? 'إزالة قيد وصلة؟' : 'Release the Wasla restriction?' : ar ? 'تطبيق إعدادات الأداء؟' : 'Apply performance settings?'}</Dialog.Title><Dialog.Description>{action === 'resume' ? ar ? 'هذا يزيل إيقاف وصلة الداخلي فقط، ولا يتجاوز أي قيد يفرضه حراج. قد يتوقف الاتصال مجدداً إذا استمرت المشكلة.' : 'This clears only Wasla’s internal pause, not any restriction imposed by Haraj. The guard will pause again if the problem persists.' : ar ? 'تتأثر جميع حملات العملاء التي تستخدم اتصال حراج المشترك. لا تتغير حالة الإيقاف.' : 'This affects all client campaigns using the shared Haraj connection. Existing pause state is preserved.'}</Dialog.Description>
      <dl className="haraj-review-summary">{fields.map(f => <div key={f.key}><dt>{ar ? f.ar : f.en}</dt><dd>{state?.limits[f.key]} → {limits?.[f.key]}</dd></div>)}</dl>
      {action === 'resume' && <label className="haraj-check"><input type="checkbox" checked={!searchOnly} onChange={e => setSearchOnly(!e.target.checked)} disabled={busy}/><span>{ar ? 'استئناف كشف الأرقام أيضاً (ليس مطلوباً لملف Lite الحالي)' : 'Also resume phone lookups (not needed for the current Lite profile)'}</span></label>}
      <label className="haraj-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy}/><span>{ar ? 'راجعت سبب الإيقاف أو تعديل الوتيرة، وأؤكد صلاحية الوصول وطريقة الاستخدام والحدود المسموح بها لدى المزوّد.' : 'I reviewed the pause or pacing change and confirm authorized provider access, this access method and permitted limits.'}</span></label>
      {error && <p role="alert" className="haraj-event-error">{error}</p>}<div className="haraj-actions"><button disabled={busy} onClick={() => setAction(null)}>{ar ? 'إلغاء' : 'Cancel'}</button><button className="is-primary" disabled={busy || !confirmed || !valid || (action === 'resume' && blocked)} onClick={() => action && void change(action)}>{busy ? ar ? 'جارٍ الحفظ…' : 'Saving…' : action === 'resume' ? ar ? 'تأكيد إزالة القيد' : 'Confirm release' : ar ? 'تأكيد الإعدادات' : 'Confirm settings'}</button></div><Dialog.Close className="haraj-dialog-close" disabled={busy} aria-label={ar ? 'إغلاق' : 'Close'}><X size={17}/></Dialog.Close>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return <section className="haraj-metric"><span>{icon}{label}</span><strong dir="ltr">{value}</strong><small>{hint}</small></section>;
}
