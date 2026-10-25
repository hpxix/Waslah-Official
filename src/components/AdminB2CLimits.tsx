import { useEffect, useState } from 'react';
import { apiErrorMessage, fetchB2CListingLimits, saveB2CListingLimits } from '../lib/directus';
import type { B2CListingLimits } from '../lib/directus';
import { notify } from '../lib/notify';

export function AdminB2CLimits({ ar }: { ar: boolean }) {
  const [limits, setLimits] = useState<B2CListingLimits | null>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emergency, setEmergency] = useState(0);
  async function load() {
    setError('');
    try { const data = await fetchB2CListingLimits(); setLimits(data.limits); setSaved(JSON.stringify(data.limits)); setEmergency(data.emergency_limit); }
    catch (e) { setError(apiErrorMessage(e)); }
  }
  useEffect(() => { void load(); }, []);
  async function save() {
    if (!limits) return;
    setBusy(true);
    try { const data = await saveB2CListingLimits(limits); setLimits(data.limits); setSaved(JSON.stringify(data.limits)); notify.success(ar ? 'تم حفظ الحدود للحملات الجديدة.' : 'Limits saved for new runs.'); }
    catch (e) { notify.danger(apiErrorMessage(e)); }
    finally { setBusy(false); }
  }
  const valid = limits && Object.values(limits).every(n => Number.isInteger(n) && n >= 0 && n <= 10000000);
  return <section className="admin-control__panel admin-b2c-limits" dir={ar ? 'rtl' : 'ltr'}>
    <h2>{ar ? 'حدود البحث في Wasla-Lite' : 'Wasla-Lite search limits'}</h2>
    <p>{ar ? 'حدد أقصى عدد للإعلانات لكل حملة. يتوقف البحث مبكراً إذا اكتمل عدد العملاء أو انتهت النتائج. صفر = بدون حد إداري.' : 'Set the maximum listings per run. Search can finish earlier when enough leads are found or results run out. Zero = no admin cap.'}</p>
    {error ? <p role="alert">{error} <button onClick={() => void load()}>{ar ? 'إعادة المحاولة' : 'Retry'}</button></p> : !limits ? <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading limits…'}</p> : <>
      <div className="admin-b2c-limits__grid">{([30, 50, 200] as const).map(tier => <div className="admin-b2c-limits__card" key={tier}>
        <label htmlFor={`limit-${tier}`}><strong>{tier} {ar ? 'عميل' : 'leads'}</strong><span>{ar ? 'الحد الأقصى للإعلانات' : 'Maximum listings'}</span></label>
        <input id={`limit-${tier}`} type="number" min={0} max={10000000} step={1} value={Number.isNaN(limits[tier]) ? '' : limits[tier]} disabled={busy} onChange={e => setLimits({ ...limits, [tier]: e.target.value === '' ? NaN : Number(e.target.value) })}/>
        <input aria-label={`${tier} ${ar ? 'عميل: حد الإعلانات' : 'leads: listing limit'}`} type="range" min={0} max={100000} step={100} value={Math.min(100000, limits[tier] || 0)} disabled={busy} onChange={e => setLimits({ ...limits, [tier]: Number(e.target.value) })}/>
        <small>{limits[tier] === 0 ? (ar ? 'بدون حد إداري' : 'No admin cap') : `${limits[tier].toLocaleString()} ${ar ? 'إعلان كحد أقصى' : 'listings maximum'}`}</small>
        {tier === 200 && <button disabled={busy} onClick={() => setLimits({ ...limits, 200: 60000 })}>{ar ? 'تعيين 60,000 إعلان' : 'Set to 60,000 listings'}</button>}
      </div>)}</div>
      {emergency > 0 && <p>{ar ? 'حد أمان الخادم:' : 'Server safety ceiling:'} {emergency.toLocaleString()}. {ar ? 'يطبق الحد الأقل.' : 'The lower limit applies.'}</p>}
      <p><small>{ar ? 'تطبق التغييرات على الحملات الجديدة فقط. الأعداد الأخرى تستخدم الشريحة الأعلى التالية. نطاق الشريط حتى 100,000؛ الحقل الرقمي حتى 10,000,000.' : 'Changes apply to new runs only. Other lead counts use the next higher tier. Slider: up to 100,000; exact input: up to 10,000,000.'}</small></p>
      <button disabled={busy || !valid || JSON.stringify(limits) === saved} onClick={() => void save()}>{busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ الحدود' : 'Save limits')}</button>
    </>}
  </section>;
}
