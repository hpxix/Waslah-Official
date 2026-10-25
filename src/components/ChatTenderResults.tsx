import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage, fetchTenderSearch, startTenderSearch } from '../lib/directus';
import type { TenderOffer, TenderSearch } from '../lib/directus';
import './chat-tenders.css';

export function ChatTenderResults({ offer, ar }: { offer: TenderOffer; ar: boolean }) {
  const [job, setJob] = useState<TenderSearch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!job?.id || ['sourced','partial','failed','cancelled'].includes(job.status)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const next = await fetchTenderSearch(job.id); if (active) { setJob(next); setError(''); } }
      catch (failure) { if (active) setError(apiErrorMessage(failure)); }
      if (active) timer = setTimeout(poll,4000);
    };
    timer = setTimeout(poll,1000);
    return () => { active = false; clearTimeout(timer); };
  }, [job?.id, job?.status]);
  async function start() {
    if (busy || job) return;
    setBusy(true); setError('');
    try { const result = await startTenderSearch(offer,key.current); setJob({...result,tenders:[]}); }
    catch (failure) { setError(apiErrorMessage(failure)); }
    finally { setBusy(false); }
  }
  return <section className="chat-tenders" aria-label={ar ? 'منافسات اعتماد' : 'Etimad opportunities'}>
    <strong>{ar ? 'فرص الحكومة · اعتماد' : 'Government opportunities · Etimad'}</strong>
    {!job && <><p>{ar ? 'بحث محدود ضمن ميزانية الاتصال الحالية، بعد موافقتك فقط. النتائج هنا وليست عملاء CRM.' : 'A bounded search using the current connection budget, only with your approval. Results stay here—not in CRM.'}</p><button disabled={busy} onClick={()=>void start()}>{busy ? (ar ? 'جارٍ البدء…' : 'Starting…') : (ar ? 'عرض المنافسات' : 'Show tenders')}</button></>}
    {job && !['sourced','partial','failed','cancelled'].includes(job.status) && <p role="status">{ar ? 'جارٍ فحص لوحة المنافسات العامة…' : 'Checking the public tender board…'}</p>}
    {(error || job?.error) && <p role="alert">{error || job?.error}</p>}
    {job?.status === 'sourced' && !job.tenders.length && <p>{ar ? 'لم تظهر منافسات مفتوحة مطابقة في العينة التي فُحصت. هذا لا يعني عدم وجود فرص على المنصة.' : 'No matching open tenders appeared in the inspected sample. This does not mean the platform has no opportunities.'}</p>}
    {job?.tenders.map((tender,index)=><article key={`${tender.reference}-${index}`}>
      <a href={tender.url} target="_blank" rel="noopener noreferrer">{tender.title || tender.reference}</a>
      <p>{tender.agency} · {tender.location}</p><p>{tender.activity}</p>
      <small>{ar ? 'آخر موعد' : 'Deadline'}: <bdi>{tender.deadline}</bdi> · {ar ? 'المرجع' : 'Reference'}: {tender.reference}</small>
      {tender.bookletPrice !== null && <p>{ar ? 'سعر الكراسة' : 'Booklet price'}: {tender.bookletPrice} SAR</p>}
      {!!tender.requiredDocuments.length && <p>{tender.requiredDocuments.join(' · ')}</p>}
    </article>)}
    {!!job?.tenders.length && <details><summary>{ar ? 'كيف تقدم؟' : 'How to submit'}</summary><p>{ar ? 'افتح رابط المنافسة الرسمي، وسجّل الدخول بحساب منشأتك في اعتماد. راجع الأهلية والكراسة والمواعيد، واشترِ الكراسة إن كانت مطلوبة، ثم قدّم العرض والمستندات حسب تعليمات المنافسة. وصلة لا تشتري الكراسة ولا تقدّم عرضاً نيابةً عنك.' : 'Open the official tender link and sign in with your organization’s Etimad account. Review eligibility, documents and deadlines, purchase the booklet if required, then submit the proposal and documents according to that tender’s instructions. Wasla does not purchase documents or submit bids for you.'}</p><a href="https://www.mof.gov.sa/eservices/Pages/Etimad.aspx" target="_blank" rel="noopener noreferrer">{ar ? 'دليل خدمات اعتماد الرسمي' : 'Official Etimad services'}</a></details>}
  </section>;
}
