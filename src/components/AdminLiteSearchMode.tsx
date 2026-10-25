import { useEffect, useState } from 'react';
import { apiErrorMessage, fetchLiteSearchMode, saveLiteSearchMode } from '../lib/directus';
import type { AdminAccount, LiteSearchMode } from '../lib/directus';

export function AdminLiteSearchMode({ accounts, ar }: { accounts: AdminAccount[]; ar: boolean }) {
  const [account, setAccount] = useState('');
  const [mode, setMode] = useState<LiteSearchMode>('mixed');
  const [saved, setSaved] = useState<LiteSearchMode>('mixed');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    setLoaded(false); setError(''); setMessage('');
    if (account) fetchLiteSearchMode(account).then(data => {
      if (active) { setMode(data.mode); setSaved(data.mode); setLoaded(true); }
    }).catch(e => { if (active) setError(apiErrorMessage(e)); });
    return () => { active = false; };
  }, [account]);
  async function save() {
    if (!loaded || !account || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await saveLiteSearchMode(account, mode);
      setMode(result.mode); setSaved(result.mode);
      setMessage(ar ? 'تم الحفظ لهذا الحساب. يطبق على عمليات البحث الجديدة.' : 'Saved for this account. Applies to new searches.');
    } catch (e) { setError(apiErrorMessage(e)); }
    finally { setBusy(false); }
  }
  const choices: Array<{ value: LiteSearchMode; label: string; body: string }> = [
    { value: 'comments_only', label: ar ? 'ممتاز فقط · التعليقات' : 'Excellent only · Comments', body: ar ? 'اهتمام معلن في تعليقات إعلانات نفس المنتج. لا انتقال للبحث في الإعلانات.' : 'Interest in comments on matching product ads. No listing-search fallback.' },
    { value: 'listings_only', label: ar ? 'جيد جداً فقط · الإعلانات' : 'Very good only · Listing searches', body: ar ? 'طريقة البحث السابقة في الإعلانات، دون فحص التعليقات.' : 'The existing listing-search method, without scanning comments.' },
    { value: 'mixed', label: ar ? 'التدرج الذكي' : 'Ordered fallback', body: ar ? 'نية الشراء أولاً، ثم تعليقات نفس المنتج، ثم إعلانات المنتج التي تحتوي على رقم.' : 'Buyer intent first, then product comments, then matching product ads with a phone.' },
  ];
  return <section className="admin-control__panel" aria-label={ar ? 'طريقة بحث Lite للحساب' : 'Account Lite search mode'}>
    <h2>{ar ? 'طريقة بحث Lite لكل حساب' : 'Lite search mode per account'}</h2>
    <label className="admin-account-picker"><span>{ar ? 'الحساب' : 'Account'}</span><select disabled={busy} value={account} onChange={e => { setLoaded(false); setAccount(e.target.value); }}>
      <option value="">{ar ? 'اختر الحساب' : 'Choose an account'}</option>
      {accounts.map(item => <option key={item.user_id} value={item.email}>{item.email} · {item.organization_name}</option>)}
    </select></label>
    {account && <>
      <div className="admin-feature-grid">{choices.map(choice => <article key={choice.value}><div><span><strong>{choice.label}</strong><small>{choice.body}</small></span></div><button type="button" aria-pressed={mode === choice.value} disabled={!loaded || busy} onClick={() => setMode(choice.value)}>{mode === choice.value ? (ar ? 'محدد ✓' : 'Selected ✓') : (ar ? 'اختيار' : 'Select')}</button></article>)}</div>
      {!loaded && !error && <p role="status">{ar ? 'جارٍ تحميل إعداد الحساب…' : 'Loading account setting…'}</p>}
      <p><small>{ar ? 'هذه تصنيفات حسب المصدر وليست ضماناً للشراء. البحث المختلط يخصص 15 ثانية للتعليقات ثم ينتقل للإعلانات عند نقص النتائج. وضع التعليقات فقط يحفظ التقدم كل دقيقتين ويواصل حتى اكتمال العدد أو نفاد النتائج المتاحة أو إيقاف البحث. تبقى حدود الاتصال والخصوصية مفعلة.' : 'These are source categories, not purchase guarantees. Mixed search gives comments 15 seconds before falling back to listings if results are short. Comments-only checkpoints every two minutes and continues until the target, available sources are exhausted, or the search is stopped. Connection and privacy limits remain active.'}</small></p>
      <button type="button" disabled={!loaded || busy || mode === saved} onClick={() => void save()}>{busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ طريقة البحث لهذا الحساب' : 'Save search mode for this account')}</button>
    </>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
