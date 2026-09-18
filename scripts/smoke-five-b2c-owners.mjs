import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const base = "http://localhost:8055";
const environment = Object.fromEntries(readFileSync(".env.docker", "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
  .map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${payload?.errors?.[0]?.message || payload?.message || "unknown error"}`);
  }
  return payload.data;
}

function filtered(path, filter, fields = "*") {
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(filter)) url.searchParams.set(`filter[${key}][_eq]`, value);
  url.searchParams.set("fields", fields);
  return url.pathname + url.search;
}

async function findUserByEmail(email, token) {
  const url = new URL(base + "/users");
  url.searchParams.set("search", email);
  url.searchParams.set("fields", "id,email,role");
  url.searchParams.set("limit", "100");
  const rows = await request(url.pathname + url.search, { token });
  return rows.find((row) => String(row.email).toLowerCase() === email.toLowerCase());
}

async function findItem(path, field, value, fields, token) {
  const url = new URL(base + path);
  url.searchParams.set("limit", "-1");
  url.searchParams.set("fields", fields);
  const rows = await request(url.pathname + url.search, { token });
  return rows.find((row) => String(row[field]) === String(value));
}

const allTests = [
  {
    slug: "cat-food", owner: "Noura", phone: "+966500009101", title: "Premium cat-food subscription",
    prompt: "I run a monthly premium cat-food delivery subscription in Jeddah. I want private cat owners and animal-care buyers who recently listed cats, cat supplies, or pet-care needs. Target people showing active cat ownership or pet-supply interest. Exclude breeders, pet stores, veterinarians, resellers, and other cat-food sellers.",
  },
  {
    slug: "moving-cleaning", owner: "Fahad", phone: "+966500009102", title: "Moving and cleaning bundle",
    prompt: "I sell a bundled home-moving and deep-cleaning service in Riyadh. I want tenants and homeowners preparing to move, people recently listing furniture, and residents discussing apartment rentals or moving needs. Target moving, furniture, rental, and cleaning signals. Exclude moving companies, cleaning companies, brokers, and service resellers.",
  },
  {
    slug: "smart-irrigation", owner: "Omar", phone: "+966500009103", title: "Smart irrigation systems",
    prompt: "I sell smart irrigation controllers and installation for farms and large gardens around Riyadh. I want private farm owners, landowners maintaining crops, and garden owners who recently listed agricultural equipment, farms, irrigation items, or gardening needs. Target ownership and irrigation signals. Exclude agricultural-equipment dealers, installers, resellers, and competitors.",
  },
  {
    slug: "aquarium-care", owner: "Layan", phone: "+966500009104", title: "Aquarium maintenance subscription",
    prompt: "I sell a recurring aquarium cleaning and maintenance subscription in Dammam and Khobar. I want private aquarium owners, fish keepers, and pond owners who recently listed fish, aquariums, tanks, filters, or aquatic supplies. Target clear fish or aquarium ownership signals. Exclude fish shops, breeders, aquarium service companies, and resellers.",
  },
  {
    slug: "wedding-photo", owner: "Saud", phone: "+966500009105", title: "Wedding photography package",
    prompt: "I sell premium wedding photography and short-form video packages in Jeddah. I want engaged couples, families, and event hosts actively planning weddings or celebrations and recently listing wedding, party, venue, decoration, or event-supply needs. Target active event-planning signals. Exclude photographers, studios, event agencies, venues, and equipment resellers.",
  },
];

const requestedSlugs = new Set(String(process.env.SMOKE_ONLY || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean));
const tests = requestedSlugs.size ? allTests.filter((test) => requestedSlugs.has(test.slug)) : allTests;
if (!tests.length) throw new Error(`No smoke tests matched SMOKE_ONLY=${process.env.SMOKE_ONLY}`);

const login = await request("/auth/login", {
  method: "POST",
  body: {
    email: environment.DIRECTUS_ADMIN_EMAIL || "bootstrap@waslah.ai",
    password: environment.DIRECTUS_ADMIN_PASSWORD || "change-me-now",
  },
});
const adminToken = login.access_token;
const [devUser] = await request(filtered("/users", { email: "dev@dev.com" }, "id,role"), { token: adminToken });
if (!devUser) throw new Error("dev@dev.com not found");
const [devMembership] = await request(filtered("/items/organization_members", { user_id: devUser.id }, "organization_id"), { token: adminToken });
if (!devMembership) throw new Error("dev organization not found");
const organizationId = devMembership.organization_id;
const [walletBefore] = await request(filtered("/items/wallets", { organization_id: organizationId }, "id,balance_halalas"), { token: adminToken });

const summaries = [];
for (let index = 0; index < tests.length; index += 1) {
  const test = tests[index];
  const email = `wasla.smoke.${test.slug}@example.com`;
  let user = await findUserByEmail(email, adminToken);
  const staticToken = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  if (!user) {
    user = await request("/users", {
      method: "POST", token: adminToken,
      body: { email, first_name: `Smoke ${test.owner}`, last_name: "Business Owner", status: "active", role: devUser.role, token: staticToken },
    });
  } else {
    await request(`/users/${user.id}`, { method: "PATCH", token: adminToken, body: { token: staticToken, status: "active" } });
  }
  const member = await findItem("/items/organization_members", "user_id", user.id, "id,user_id", adminToken);
  if (!member) {
    await request("/items/organization_members", {
      method: "POST", token: adminToken,
      body: { id: randomUUID(), membership_key: `${organizationId}:${user.id}`, organization_id: organizationId, user_id: user.id, role: "member", status: "active", created_at: new Date().toISOString() },
    });
  }
  const profile = await findItem("/items/customer_profiles", "user_id", user.id, "id,user_id", adminToken);
  if (!profile) {
    await request("/items/customer_profiles", {
      method: "POST", token: adminToken,
      body: { id: randomUUID(), user_id: user.id, organization_id: organizationId, phone_e164: test.phone, phone_verified_at: new Date().toISOString(), avatar_seed: test.owner, locale: "en", marketing_consent: false, privacy_consent_at: new Date().toISOString(), permissions_consent_at: new Date().toISOString(), consent_version: "smoke-test-v1", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    });
  }

  console.log(`TEST ${index + 1}/${tests.length} CHAT ${test.title}`);
  const startedAt = Date.now();
  const chat = await request("/lead-agent/b2c/chat", {
    method: "POST", token: staticToken,
    body: { message: test.prompt, transcript: [], language: "en", conversation_id: randomUUID(), deal_intent: "sell" },
  });
  if (!chat.ready || !chat.planning) throw new Error(`${test.title}: chat did not produce a ready sourcing plan (${(chat.missing || []).join(", ")})`);
  const campaign = await request("/lead-agent/b2c/campaigns", {
    method: "POST", token: staticToken,
    body: { prompt: test.prompt, targetLeadCount: 30, planning: chat.planning, name: test.title },
  });
  await request(`/lead-agent/b2c/campaigns/${campaign.id}/run`, { method: "POST", token: staticToken, body: {} });
  console.log(`TEST ${index + 1}/${tests.length} RUNNING tags=${chat.planning.acquisitionPlan.strategies.map((item) => item.tagName).join(" | ")}`);
  let current;
  let lastLine = "";
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    current = await request(`/lead-agent/b2c/campaigns/${campaign.id}`, { token: staticToken });
    const line = `${current.status} ads=${current.stats.postsFetched || 0} qualified=${current.stats.candidatesQualified || 0} leads=${current.stats.uniqueLeads || 0}/30 contacts=${current.stats.contactAttempts || 0}`;
    if (line !== lastLine) {
      console.log(`TEST ${index + 1}/${tests.length} ${line}`);
      lastLine = line;
    }
    if (["COMPLETED", "PARTIAL", "FAILED"].includes(current.status)) break;
  }
  if (!current || !["COMPLETED", "PARTIAL", "FAILED"].includes(current.status)) throw new Error(`${test.title}: timed out`);
  const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
  summaries.push({
    title: test.title, owner: test.owner, status: current.status, durationSeconds,
    chatText: chat.text, tags: chat.planning.acquisitionPlan.strategies.map((item) => item.tagName),
    targetProfiles: chat.planning.acquisitionPlan.targetProfiles, stats: current.stats, error: current.errorMessage || null,
  });
  console.log(`TEST ${index + 1}/${tests.length} DONE ${current.status} in ${durationSeconds}s`);
}

const [walletAfter] = await request(filtered("/items/wallets", { organization_id: organizationId }, "id,balance_halalas"), { token: adminToken });
console.log("SMOKE_REPORT_JSON");
console.log(JSON.stringify({
  startedBalanceHalalas: Number(walletBefore.balance_halalas),
  endingBalanceHalalas: Number(walletAfter.balance_halalas),
  chargedHalalas: Number(walletBefore.balance_halalas) - Number(walletAfter.balance_halalas),
  tests: summaries,
}, null, 2));
