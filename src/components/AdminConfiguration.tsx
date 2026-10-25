import { useState } from 'react';
import { apiErrorMessage, updateAdminFeatureSettings, updateAdminProvider } from '../lib/directus';
import type { AdminControlScope, AdminFeature, AdminProvider } from '../lib/directus';
import { notify } from '../lib/notify';

function objectJson(text: string) {
  if (text.length > 32000) throw new Error('Configuration must be smaller than 32 KB.');
  const value = JSON.parse(text);
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Configuration must be a JSON object.');
  return value as Record<string, unknown>;
}

export function AdminConfiguration({ ar, scope, features, providers, onFeatureSaved, onProviderSaved }: {
  ar: boolean; scope: AdminControlScope | null; features: AdminFeature[]; providers: AdminProvider[];
  onFeatureSaved: (feature: AdminFeature) => void; onProviderSaved: (provider: AdminProvider) => void;
}) {
  return <section className="admin-control__panel admin-configuration" dir={ar ? 'rtl' : 'ltr'}>
    <h2>{ar ? 'صلاحيات الإدارة العليا' : 'Superior administrator controls'}</h2>
    <p>{ar ? 'حساب الإدارة يتجاوز أقفال نماذج العملاء والاشتراك والتحقق من الجوال. تغييرات الإعدادات تسجّل في سجل التدقيق. قيود المزوّد الخارجية لا يمكن تجاوزها.' : 'Administrators bypass customer model, subscription and phone-verification locks. Configuration changes are audited. External provider restrictions cannot be bypassed.'}</p>
    {scope?.platform_admin_url && <a href={scope.platform_admin_url} target="_blank" rel="noopener noreferrer">{ar ? 'فتح إدارة المنصة المتقدمة — البيانات والمستخدمون والأدوار والتدفقات' : 'Open advanced platform admin — data, users, roles and flows'} ↗</a>}
    <h3>{ar ? 'إعدادات الميزات والنماذج' : 'Feature and model configuration'}</h3>
    <p><small>{ar ? 'إعدادات الميزات ليست مخزناً للأسرار؛ لا تضع رموز API هنا.' : 'Feature configuration is not a secret store. Do not put API tokens here.'}</small></p>
    {features.map(feature => <FeatureEditor key={`${feature.key}:${feature.updated_at}`} ar={ar} feature={feature} onSaved={onFeatureSaved}/>)}
    <h3>{ar ? 'إعدادات المصادر وبيانات الاتصال' : 'Source settings and credentials'}</h3>
    {providers.map(provider => <ProviderEditor key={`${provider.id}:${provider.updated_at}`} ar={ar} provider={provider} onSaved={onProviderSaved}/>)}
    {!providers.length && <p>{ar ? 'أضف مصدراً من تبويب مصادر العملاء أولاً.' : 'Add a source in Sourcing routes first.'}</p>}
  </section>;
}

function FeatureEditor({ ar, feature, onSaved }: { ar: boolean; feature: AdminFeature; onSaved: (feature: AdminFeature) => void }) {
  const [name, setName] = useState(feature.name);
  const [description, setDescription] = useState(feature.description || '');
  const [configuration, setConfiguration] = useState(JSON.stringify(feature.configuration, null, 2));
  const [enabled, setEnabled] = useState(feature.enabled_global);
  const [busy, setBusy] = useState(false);
  return <details><summary>{feature.name} <code>{feature.key}</code></summary><form onSubmit={async event => {
    event.preventDefault(); setBusy(true);
    try { const next = await updateAdminFeatureSettings(feature.key, { name, description, enabled_global: enabled, configuration: objectJson(configuration) }); onSaved(next); notify.success(ar ? 'تم حفظ الإعدادات.' : 'Configuration saved.'); }
    catch (error) { notify.danger(apiErrorMessage(error)); }
    finally { setBusy(false); }
  }}>
    <label>{ar ? 'الاسم' : 'Name'}<input required value={name} maxLength={160} onChange={event => setName(event.target.value)} disabled={busy}/></label>
    <label>{ar ? 'الوصف' : 'Description'}<input value={description} maxLength={2000} onChange={event => setDescription(event.target.value)} disabled={busy}/></label>
    <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={busy}/> {ar ? 'متاح للعملاء افتراضياً' : 'Enabled for customers by default'}</label>
    <label>{ar ? 'الإعدادات (JSON)' : 'Configuration (JSON)'}<textarea dir="ltr" rows={8} maxLength={32000} spellCheck={false} value={configuration} onChange={event => setConfiguration(event.target.value)} disabled={busy}/></label>
    <button disabled={busy}>{busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ إعدادات الميزة' : 'Save feature settings')}</button>
  </form></details>;
}

function ProviderEditor({ ar, provider, onSaved }: { ar: boolean; provider: AdminProvider; onSaved: (provider: AdminProvider) => void }) {
  const [name, setName] = useState(provider.name);
  const [actorId, setActorId] = useState(provider.actor_id);
  const [priority, setPriority] = useState(provider.priority);
  const [enabled, setEnabled] = useState(provider.enabled);
  const [token, setToken] = useState('');
  const [configuration, setConfiguration] = useState(JSON.stringify(provider.configuration, null, 2));
  const [busy, setBusy] = useState(false);
  return <details><summary>{provider.name} <code>{provider.provider_key}</code></summary><form onSubmit={async event => {
    event.preventDefault(); setBusy(true);
    try { const next = await updateAdminProvider(provider.id, { name, actor_id: actorId, priority, enabled, configuration: objectJson(configuration), ...(token.trim() ? { token: token.trim() } : {}) }); setToken(''); onSaved(next); notify.success(ar ? 'تم حفظ المصدر.' : 'Source settings saved.'); }
    catch (error) { notify.danger(apiErrorMessage(error)); }
    finally { setBusy(false); }
  }}>
    <label>{ar ? 'اسم المصدر' : 'Source name'}<input required maxLength={160} value={name} onChange={event => setName(event.target.value)} disabled={busy}/></label>
    <label>Actor ID<input required value={actorId} maxLength={255} onChange={event => setActorId(event.target.value)} disabled={busy}/></label>
    <label>{ar ? 'الأولوية' : 'Priority'}<input type="number" required min={1} max={10000} step={1} value={priority} onChange={event => setPriority(Number(event.target.value))} disabled={busy}/></label>
    <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={busy}/> {ar ? 'المصدر مفعّل' : 'Source enabled'}</label>
    <label>{ar ? 'استبدال رمز API — اتركه فارغاً للاحتفاظ بالحالي' : 'Replace API token — leave empty to keep current'}<input type="password" autoComplete="new-password" value={token} onChange={event => setToken(event.target.value)} disabled={busy}/></label>
    <label>{ar ? 'الإعدادات (JSON)' : 'Configuration (JSON)'}<textarea dir="ltr" rows={8} maxLength={32000} spellCheck={false} value={configuration} onChange={event => setConfiguration(event.target.value)} disabled={busy}/></label>
    <button disabled={busy}>{busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ إعدادات المصدر' : 'Save source settings')}</button>
  </form></details>;
}
