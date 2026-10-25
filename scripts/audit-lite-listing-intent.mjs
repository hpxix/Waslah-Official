// Read newline-delimited {title,body} JSON from stdin; never print listing text or contact data.
import { readFileSync } from 'node:fs';
import { classifyListingIntent } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/lite-listing-intent.js';

const counts = new Map();
const examples = [];
let total = 0;
for (const line of readFileSync(0, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const { title, body } = JSON.parse(line);
  const { intent } = classifyListingIntent(title, body);
  counts.set(intent, (counts.get(intent) || 0) + 1);
  if (process.argv.includes('--examples') && intent === 'not_stated' && examples.length < 24) {
    const redact = (value) => String(value || '').replace(/\+?\d[\d\s-]{7,}\d/g, '[number]')
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]').replace(/https?:\/\/\S+/gi, '[url]');
    examples.push({ title: redact(title).slice(0, 100), body: redact(body).slice(0, 135) });
  }
  total += 1;
}
console.log(JSON.stringify({ total, byIntent: Object.fromEntries([...counts].sort()), ...(examples.length ? { examples } : {}) }, null, 2));
