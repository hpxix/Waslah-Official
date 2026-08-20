import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnv() {
  const envPath = path.join(root, ".env.docker");
  const text = await readFile(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function text(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function limited(value, length = 255) {
  return text(value)?.slice(0, length) || null;
}

function url(value) {
  const normalized = text(value);
  if (!normalized) return null;
  return /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
}

function domainFrom(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (!normalized) continue;
    try {
      return new URL(/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
  }
  return null;
}

function location(...parts) {
  return [...new Set(parts.flat().map(text).filter(Boolean))].join(", ") || null;
}

function avatarUrl(seed) {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed || "Wasla Lead")}&backgroundColor=18191a&fontFamily=Arial&fontWeight=600`;
}

function companyImageUrl(company, domain) {
  if (domain) return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  return avatarUrl(`${company || "Wasla Company"} company`);
}

function enrich(lead) {
  const signals = [];
  let score = 0;
  const add = (condition, key, points) => {
    if (!condition) return;
    signals.push(key);
    score += points;
  };
  add(lead.email, "verified_work_email", 16);
  add(lead.phone, "direct_phone", 16);
  add(lead.website, "company_website", 8);
  add(lead.linkedin_url, "person_linkedin", 8);
  add(lead.company_linkedin_url, "company_linkedin", 7);
  add(lead.title, "decision_maker_title", 9);
  add(lead.seniority, "seniority_identified", 8);
  add(lead.industry, "industry_classified", 6);
  add(lead.location, "location_verified", 5);
  add(lead.company_size, "company_size", 5);
  add(lead.annual_revenue, "revenue_signal", 4);
  add(lead.raw_payload?.technologies || lead.raw_payload?.company_technologies, "technology_stack", 5);
  add(lead.review_count || lead.review_score, "market_reputation", 5);
  score = Math.min(score, 100);
  const status = score >= 65 ? "enriched" : score >= 35 ? "partial" : "raw";
  const fitScore = Math.min(100, Math.round(score * 0.78 + (lead.seniority ? 12 : 0) + (lead.email && lead.phone ? 10 : 0)));
  const summary = status === "enriched"
    ? `${signals.length} verified signals make this record ready for qualification.`
    : status === "partial"
      ? `${signals.length} signals found; additional contact or company enrichment is recommended.`
      : "The source record needs contact and company enrichment before qualification.";
  return {
    enrichment_status: status,
    enrichment_score: score,
    enrichment_signals: signals,
    enrichment_summary: summary,
    fit_score: fitScore,
    qualification_status: status === "enriched" ? "ready" : "needs_enrichment",
  };
}

function finalize(input, source, index) {
  const company = limited(input.company) || limited(input.name) || "Unknown company";
  const name = limited(input.name);
  const companyDomain = domainFrom(input.company_domain, input.website);
  const normalized = {
    name,
    title: limited(input.title),
    company,
    company_normalized: company.toLocaleLowerCase(),
    email: limited(input.email, 128)?.toLocaleLowerCase() || null,
    phone: limited(input.phone, 30),
    person_image_url: avatarUrl(name || company),
    company_image_url: companyImageUrl(company, companyDomain),
    website: url(input.website || companyDomain)?.slice(0, 255) || null,
    linkedin_url: url(input.linkedin_url)?.slice(0, 500) || null,
    company_linkedin_url: url(input.company_linkedin_url)?.slice(0, 500) || null,
    location: limited(input.location),
    industry: limited(input.industry),
    seniority: limited(input.seniority, 80),
    company_size: number(input.company_size),
    annual_revenue: limited(input.annual_revenue, 100),
    review_score: limited(input.review_score, 20),
    review_count: number(input.review_count),
    source,
    source_reference: limited(input.source_reference) || `${source}:${index + 1}`,
    raw_payload: input.raw_payload,
    last_enriched_at: new Date().toISOString(),
  };
  const fingerprintSource = [normalized.email, normalized.phone, companyDomain, normalized.company, normalized.name, normalized.location]
    .map((value) => String(value || "").trim().toLocaleLowerCase())
    .join("|");
  return {
    id: randomUUID(),
    fingerprint: createHash("sha256").update(fingerprintSource).digest("hex"),
    ...normalized,
    ...enrich(normalized),
  };
}

function normalizeV1(row, index) {
  return finalize({
    name: row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" "),
    title: row.job_title,
    company: row.company_name,
    email: row.email,
    phone: row.mobile_number || row.company_phone,
    website: row.company_website || row.company_domain,
    company_domain: row.company_domain,
    linkedin_url: row.linkedin,
    company_linkedin_url: row.company_linkedin,
    location: location(row.city, row.state, row.country, row.company_city, row.company_country),
    industry: row.industry,
    seniority: row.seniority_level || row.functional_level,
    company_size: row.company_size,
    annual_revenue: row.company_annual_revenue_clean || row.company_annual_revenue,
    source_reference: row.linkedin || row.company_domain,
    raw_payload: row,
  }, "starter-people-v1", index);
}

function normalizeMaps(row, index, version) {
  return finalize({
    name: null,
    title: row.categoryName || "Company",
    company: row.title,
    phone: row.phone,
    website: row.website,
    location: location(row.street, row.city, row.state, row.countryCode),
    industry: row.categoryName || row.categories,
    review_score: row.totalScore,
    review_count: row.reviewsCount,
    source_reference: row.url,
    raw_payload: row,
  }, `starter-maps-${version}`, index);
}

function normalizeV4(row, index) {
  return finalize({
    name: row.fullName || [row.firstName, row.lastName].filter(Boolean).join(" "),
    title: row.title || row.position,
    company: row.companyName,
    email: row.email,
    phone: row.phone,
    website: row.companyDomain,
    company_domain: row.companyDomain,
    linkedin_url: row.linkedinUrl,
    company_linkedin_url: row.companyLinkedinUrl,
    location: location(row.personCity, row.personState, row.personCountry, row.companyCity, row.companyState, row.companyCountry),
    industry: row.companyIndustry,
    seniority: row.seniority || row.functional || row.functions,
    company_size: row.companySize,
    annual_revenue: row.annualRevenue,
    source_reference: row.linkedinUrl || row.companyDomain,
    raw_payload: row,
  }, "starter-people-v4", index);
}

async function directusRequest(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${route} failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload.data;
}

await loadEnv();
const baseUrl = process.env.DIRECTUS_PUBLIC_URL || "http://localhost:8055";
const email = process.env.DIRECTUS_ADMIN_EMAIL;
const password = process.env.DIRECTUS_ADMIN_PASSWORD;
if (!email || !password) throw new Error("DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD are required in .env.docker.");

const session = await directusRequest(baseUrl, "/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, mode: "json" }),
});
const headers = { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
const [v1, v2, v3, v4] = await Promise.all([1, 2, 3, 4].map(async (version) => JSON.parse(await readFile(path.join(root, "currentData-Starter", `version${version}.json`), "utf8"))));
const normalized = [
  ...v1.map(normalizeV1),
  ...v2.map((row, index) => normalizeMaps(row, index, "v2")),
  ...v3.map((row, index) => normalizeMaps(row, index, "v3")),
  ...v4.map(normalizeV4),
];
const unique = [...new Map(normalized.map((lead) => [lead.fingerprint, lead])).values()];
const existing = await directusRequest(baseUrl, "/items/lead_inventory?limit=-1&fields=fingerprint", { headers });
const existingFingerprints = new Set(existing.map((lead) => lead.fingerprint));
const pending = unique.filter((lead) => !existingFingerprints.has(lead.fingerprint));

let inserted = 0;
let duplicate = 0;
for (let index = 0; index < pending.length; index += 12) {
  const outcomes = await Promise.all(pending.slice(index, index + 12).map(async (lead) => {
    try {
      await directusRequest(baseUrl, "/items/lead_inventory", {
        method: "POST",
        headers,
        body: JSON.stringify(lead),
      });
      return "inserted";
    } catch (error) {
      if (String(error.message).includes("RECORD_NOT_UNIQUE")) return "duplicate";
      throw error;
    }
  }));
  inserted += outcomes.filter((outcome) => outcome === "inserted").length;
  duplicate += outcomes.filter((outcome) => outcome === "duplicate").length;
}

console.log(`Starter inventory ready: ${unique.length} normalized, ${inserted} inserted, ${unique.length - pending.length + duplicate} already present.`);
