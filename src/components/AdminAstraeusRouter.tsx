import { useEffect, useState } from 'react';
import { fetchAstraeusRouter, updateAstraeusRouter, apiErrorMessage } from '../lib/directus';
import type { AstraeusRouterStatus, AstraeusRouterSettings } from '../lib/directus';
import { notify } from '../lib/notify';

export function AdminAstraeusRouter({ ar }: { ar: boolean }) {
  const [status, setStatus] = useState<AstraeusRouterStatus | null>(null);
  const [settings, setSettings] = useState<AstraeusRouterSettings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try { const result = await fetchAstraeusRouter(); setStatus(result); setSettings(result.settings); setError(''); }
    catch (failure) { setError(apiErrorMessage(failure)); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  return <section className="admin-control__panel admin-configuration">
    <header><h2>{ar ? 'محركات Astraeus' : 'Astraeus source engines'}</h2><p>{ar ? 'اختيار المصدر بقواعد JavaScript من القائمة المعتمدة، مع مخطط مدخلات متحقق منه وأسعار الخطة المجانية. الذكاء الاصطناعي لا يختار API.' : 'JavaScript routing over the approved catalog, verified input schemas and FREE-tier prices. AI does not choose the API.'}</p><button disabled={busy} onClick={() => void load()}>{ar ? 'تحديث الاتصال' : 'Refresh connection'}</button></header>
    {error && <p role="alert">{error}</p>}
    {status?.connectionError && <p role="alert">{status.connectionError}</p>}
    {status?.budget && <p>{ar ? 'رصيد الاستخدام المجاني' : 'Included-credit usage'}: ${status.budget.used.toFixed(2)} / ${status.budget.total.toFixed(2)} · {ar ? 'متاح قبل الحجوزات' : 'Available before reservations'}: ${status.budget.remaining.toFixed(2)}</p>}
    {settings && <form onSubmit={async event => {
      event.preventDefault(); setBusy(true);
      try { const next = await updateAstraeusRouter(settings); setSettings(next.settings); notify.success(ar ? 'تم حفظ المحركات.' : 'Engine settings saved.'); }
      catch (failure) { notify.danger(apiErrorMessage(failure)); }
      finally { setBusy(false); }
    }}>
      <label>{ar ? 'سقف الدورة المشتركة بالدولار' : 'Shared cycle ceiling (USD)'}<input type="number" min="0.01" max="5" step="0.01" value={settings.monthlyBudgetUsd} onChange={event => setSettings({ ...settings, monthlyBudgetUsd: Number(event.target.value) })} /></label>
      {(['astraeus', 'ultra'] as const).map(model => <fieldset key={model} className="admin-astraeus-slot"><legend>{model === 'ultra' ? 'Astraeus Ultra' : 'Astraeus'}</legend>
        <p>{model === 'ultra' ? (ar ? 'لا تُحفظ نتيجة دون رقم هاتف صالح. البريد اختياري.' : 'Only matching leads with usable phones. Email is optional.') : (ar ? 'العملاء المطابقون مع أرقام هاتف أو بدونها.' : 'Matching leads with or without phone numbers.')}</p>
        <label><input type="checkbox" checked={settings[model].enabled} onChange={event => setSettings({ ...settings, [model]: { ...settings[model], enabled: event.target.checked } })} />{ar ? 'المحرك مفعّل' : 'Engine enabled'}</label>
        <label>{ar ? 'سقف البحث كاملاً عبر جميع المصادر بالدولار' : 'Maximum USD per search (all sources combined)'}<input type="number" min="0.01" max={settings.monthlyBudgetUsd} step="0.01" value={settings[model].maxRunUsd} onChange={event => setSettings({ ...settings, [model]: { ...settings[model], maxRunUsd: Number(event.target.value) } })} /></label>
        <small>{ar ? 'القائمة معتمدة يدوياً؛ يُستخدم التقييم لترجيح المصادر المتساوية في السعر والتغطية، وليس لحذف مصادر القائمة.' : 'Catalog sources are explicitly approved. Ratings break price/coverage ties; the old Store-wide rating cutoff no longer excludes catalog sources.'}</small>
        <label>{ar ? 'عدد المصادر للمقارنة' : 'Candidates to compare'}<input type="number" min="1" max="12" step="1" value={settings[model].candidateLimit} onChange={event => setSettings({ ...settings, [model]: { ...settings[model], candidateLimit: Number(event.target.value) } })} /></label>
      </fieldset>)}
      <small>{ar ? 'تظل موافقة الإدارة على وصول كل حساب مطلوبة. يتوقف المحرك عند نفاد الرصيد؛ لا إنشاء حسابات أو اشتراكات أو إعادة تعبئة تلقائية.' : 'Account feature approvals still apply. Runs stop at the included-credit limit. No account creation, subscriptions or automatic top-ups.'}</small>
      <button disabled={busy}>{ar ? 'حفظ إعدادات المحركات' : 'Save engine settings'}</button>
    </form>}
    {!!status?.sources?.length && <details><summary>{ar ? 'المصادر المعتمدة (12)' : 'Approved sources (12)'}</summary>{status.sources.map(source=><article key={source.key}><a href={`https://apify.com/${source.slug}`} target="_blank" rel="noreferrer">{source.slug}</a><p>{source.kind} · {source.phones ? (ar ? 'قد تتوفر أرقام' : 'Phones may be available') : (ar ? 'لا توجد تغطية هاتف موثقة' : 'No documented phone coverage')}</p>{source.limitation && <small>{source.limitation}</small>}</article>)}</details>}
    {!!status?.runs.length && <details><summary>{ar ? 'سجل الاختيار والميزانية' : 'Selection and budget history'}</summary>{status.runs.map(run => <article key={run.request_id}><strong>{run.model} · {run.status}</strong><p>{run.actor_id || '—'} · ${Number(run.reserved_usd).toFixed(2)}</p><pre dir="ltr" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(run.audit, null, 2)}</pre></article>)}</details>}
  </section>;
}
