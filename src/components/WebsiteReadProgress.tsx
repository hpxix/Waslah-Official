import { useEffect, useRef, useState } from 'react';
import { fetchWebsiteRead } from '../lib/directus';
import type { WebsiteRead } from '../lib/directus';
import './website-read.css';
import { BookOpen, BrainCircuit, ChevronRight, Globe, LoaderCircle, ShieldCheck } from 'lucide-react';

export function WebsiteReadProgress({job,ar,onUpdate}:{job:WebsiteRead;ar:boolean;onUpdate:(job:WebsiteRead)=>void}) {
  const callback=useRef(onUpdate);callback.current=onUpdate;
  const [notice,setNotice]=useState('');
  const [elapsed,setElapsed]=useState(0);
  useEffect(()=>{if(job.status!=='reading')return;const timer=setInterval(()=>setElapsed(Math.max(0,(Date.now()-Date.parse(job.created_at))/1000)),250);return()=>clearInterval(timer);},[job.id,job.status,job.created_at]);
  useEffect(()=>{
    if(job.status!=='reading')return;let cancelled=false;let timer:ReturnType<typeof setTimeout>;
    async function poll(){try{const next=await fetchWebsiteRead(job.id);if(cancelled)return;setNotice('');callback.current(next);if(next.status!=='reading')return;}catch{if(cancelled)return;setNotice(ar?'تعذر تحديث الحالة مؤقتاً؛ أعيد الاتصال دون تغيير محادثتك.':'Status refresh is temporarily unavailable; reconnecting without changing your conversation.');}if(!cancelled)timer=setTimeout(poll,1200);}
    void poll();return()=>{cancelled=true;clearTimeout(timer);};
  },[job.id,job.status,ar]);
  const labels:Record<string,string>=ar?{validating:'أتحقق من أمان عنوان الموقع',reading_homepage:'أفتح الصفحة الرئيسية',checking_robots:'أتحقق من قواعد قراءة الموقع',reading_page:'أقرأ صفحة مرتبطة بالمنتج أو الشركة',page_read:'اكتملت قراءة الصفحة',analyzing:'أحلل النصوص المقروءة وأربط كل معلومة بدليل',report_ready:'اكتمل إعداد النظرة الشاملة'}:{validating:'Validating the public website address',reading_homepage:'Opening the homepage',checking_robots:'Checking website reading rules',reading_page:'Reading a linked product or company page',page_read:'Finished reading this page',analyzing:'Analyzing readable text and grounding each finding in evidence',report_ready:'Overview prepared'};
  labels.retrying_dns=ar?'تعذر حل عنوان الموقع مؤقتاً؛ أعيد محاولة DNS مرة واحدة':'Temporary DNS lookup failure; retrying once';
  labels.retrying_analysis=ar?'لم يكتمل التحليل؛ أعيد المحاولة بالنصوص المحفوظة':'Analysis was incomplete; retrying with the saved page text';
  const seconds=job.status==='reading'?elapsed:Math.max(0,(Date.parse(job.events.at(-1)?.at||job.created_at)-Date.parse(job.created_at))/1000);
  const duration=`${seconds>=60?`${Math.floor(seconds/60)}m `:''}${Math.floor(seconds%60)}s`;
  return <section className="website-read-card chat-tool-log" dir={ar?'rtl':'ltr'} aria-label={ar?'قراءة الموقع':'Website reading'}>
    <details open={job.status==='reading'}>
      <summary>{job.status==='reading'?<LoaderCircle size={17} className="chat-tool-spinner"/>:null}<span className={job.status==='reading'?'chat-loading-text':undefined}>{job.status==='reading'?(ar?'أقرأ موقعك':'Reading your website'):(ar?`مدة العمل ${duration}`:`Worked for ${duration}`)}</span>{job.status==='reading'?<small dir="ltr">{elapsed.toFixed(1)}s</small>:<ChevronRight size={17}/>}</summary>
      <ol>{job.events.map((event,index)=>{const Icon=/analy|report/.test(event.stage)?BrainCircuit:/valid|robots/.test(event.stage)?ShieldCheck:/home/.test(event.stage)?Globe:BookOpen;return <li key={`${event.at}-${index}`}><Icon size={17}/><div><span>{labels[event.stage]||event.stage}</span>{event.url&&<small dir="ltr">{event.url}</small>}</div></li>;})}</ol>
    </details>
    {job.error&&<p role="alert">{job.error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>;
}
