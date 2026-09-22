import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import './src/styles.css';
import './src/experience.css';
const brand = { id: 'fixture', company_name: 'Omar Agricultural Systems', website: 'https://example.com', industry: 'Agriculture', description: 'Milking equipment and installation for Saudi dairy farms.', value_proposition: 'A practical route to more efficient milk production.', products_services: ['Milking systems', 'Installation and support'], brand_voice: 'Knowledgeable, warm, practical', brand_values: ['Reliability', 'Transparency'], target_markets: ['Saudi Arabia'], goals: ['Qualified consultations'], tone_rules: ['No unverified performance claims'], colors: ['#a7ffcf'], logo_url: '', completion_score: 90 };
const audiences = [{ id: 'segment', name: 'Growing dairy farms', type: 'B2B', description: 'Farm owners investing in reliable equipment', pains: ['Labour costs'], triggers: ['Herd expansion'], jobs_to_be_done: ['Improve output'], channels: ['instagram'], geography: ['Riyadh', 'Al Qassim'], estimated_size: 1500, status: 'active' }];
const content = [{ id: 'draft', title: 'Your next productive season starts here', copy: 'Expanding your herd? Start with the bottleneck, not the brochure.\n\nWe help dairy farm owners assess the right milking setup for their herd, team, and operating goals.\n\nTell us about your farm and book an equipment consultation.', rationale: 'A practical diagnostic invitation builds trust before asking for a purchase.', visual_direction: 'Editorial farm photography, muted sage tones, a close-up of the equipment in real use.', channel: 'instagram', format: 'post', status: 'draft', approval_status: 'pending', connection_id: null, scheduled_for: null, media: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
axios.defaults.adapter = async config => {
  const path = config.url || '';
  const body = config.data ? JSON.parse(config.data) : {};
  let data: unknown = {};
  if (path.endsWith('/growth/overview')) data = { brand, audiences, campaigns: [], content, journeys: [], funnel: [], connections: [], infrastructure: { ai: true, postiz: false, chatwoot: false, langfuse: false } };
  else if (path.endsWith('/growth/brand')) data = Object.assign(brand, body);
  else if (path.endsWith('/growth/content/draft')) data = Object.assign(content[0], body, { approval_status: body.copy ? 'pending' : body.approval_status });
  else if (path.endsWith('/growth/inbox')) data = { configured: false, conversations: [] };
  return { data: { data }, status: 200, statusText: 'OK', headers: {}, config };
};
const { GrowthWorkspace, WaslaTutorial } = await import('./src/components/GrowthWorkspace');
function Preview() {
  const [language, setLanguage] = useState<'en'|'ar'>('en');
  const [guide, setGuide] = useState(false);
  return <><nav style={{ display: 'flex', gap: 12, padding: 10, color: '#fff', background: '#111' }}><span>UI TEST · Synthetic data only</span><button onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}>EN / AR</button><button onClick={() => setGuide(!guide)}>Guide / Growth</button></nav><main className={language === 'ar' ? 'hconsole is-arabic' : 'hconsole'} style={{ display: 'block', height: 'auto', minHeight: '100vh', overflow: 'visible', background: '#090c0b' }}>{guide ? <WaslaTutorial language={language} onNavigate={() => setGuide(false)} onStartTour={() => {}} /> : <GrowthWorkspace language={language} leads={[]} onOpenSocials={() => {}} onStartTour={() => setGuide(true)} />}</main><div id="wasla-modal-root" /></>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
