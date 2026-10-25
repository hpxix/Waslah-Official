// Isolated manual UI fixture. Dummy records only; no provider/database calls.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {LeadPhoneNumbers} from '../src/components/LeadPhoneNumbers';
import '../src/components/compact-lead-crm.css';
const samples=[{phone:'0555555001',phoneNumbers:[]},{phone:'0555555002',phoneNumbers:[{number:'0555555002',label:'Mobile'},{number:'0555555003',label:'WhatsApp'},{number:'0115555004',label:'Listing relay'}]}];
createRoot(document.getElementById('root')!).render(<main><h1>Contact numbers · UI verification</h1><p>Illustrative records only. Extra numbers must not change row width or height.</p>{[false,true].map(ar=><section dir={ar?'rtl':'ltr'} key={String(ar)}><h2>{ar?'العربية':'English'}</h2><table style={{tableLayout:'fixed',width:'100%',borderCollapse:'collapse'}}><thead><tr><th style={{width:'40%'}}>Lead</th><th style={{width:'30%'}}>Phone</th><th style={{width:'30%'}}>City</th></tr></thead><tbody>{samples.map((lead,i)=><tr key={i}><td>{ar?'عميل توضيحي':'Illustrative contact'} {i+1}</td><td><LeadPhoneNumbers lead={lead} ar={ar}/></td><td>{ar?'الرياض':'Riyadh'}</td></tr>)}</tbody></table></section>)}</main>);
