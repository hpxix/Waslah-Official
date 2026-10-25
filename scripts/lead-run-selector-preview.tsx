import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../src/styles.css';
import '../src/experience.css';
import '../src/dashboard.css';
import '../src/components/core-leads.css';
import {LeadRunSelector} from '../src/components/LeadRunSelector';
import type {LeadRun} from '../src/lib/directus';
const runs:LeadRun[]=['failed','running','partial','completed','queued'].map((status,index)=>({id:String(index),type:'b2c',contact_route:index===3?'astraeus_ultra':'lite',title:index===3?'Saudi hospitality decision makers':'People likely to buy كاميرات مراقبة',query:'Synthetic QA fixture',deal_intent:'sell',status,error_message:'Long provider error must never appear in the selector. '.repeat(10),target_count:30,result_count:[0,12,2,30,0][index],explanation:null,created_at:'2026-10-23T18:00:00Z',updated_at:'2026-10-23T18:00:00Z'}));
function Preview(){const [selected,setSelected]=useState<string|null>(null);return <main style={{maxWidth:1440,margin:'48px auto',padding:20,fontFamily:'Arial, sans-serif',color:'#fff'}}><h1 style={{fontSize:18,marginBottom:24}}>Query selector · visual QA</h1>{[false,true].map(ar=><section key={String(ar)} style={{border:'1px solid #ffffff14',borderRadius:14,overflow:'hidden',marginBottom:32}}><LeadRunSelector runs={runs} selectedId={selected} total={500} ar={ar} onSelect={setSelected}/></section>)}</main>}
createRoot(document.getElementById('root')!).render(<Preview/>);
