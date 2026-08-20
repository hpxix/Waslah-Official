const baseUrl = (process.env.DIRECTUS_URL || "http://localhost:8055").replace(/\/$/, "");
const workflowSecret = process.env.N8N_WEBHOOK_SECRET || "replace-with-a-long-random-secret";
const runId = Date.now();
const email = `smoke+${runId}@waslah.ai`;
const password = "SmokeTest!123";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, { method = "GET", token, headers, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function main() {
  await request("/lead-agent/auth/register", {
    method: "POST",
    body: {
      email,
      password,
      name: "Waslah Smoke Test",
      business: `Waslah Test ${runId}`,
      phone: `+96655${String(runId).slice(-7)}`,
    },
  });

  const session = await request("/auth/login", { method: "POST", body: { email, password, mode: "json" } });
  const token = session.access_token;
  assert(token, "Login did not return an access token.");

  const verification = await request("/lead-agent/auth/phone/request", { method: "POST", token, body: {} });
  assert(verification.dev_code, "Development OTP was not exposed. Set SMS_DEV_EXPOSE_CODE=true for smoke tests.");
  const verified = await request("/lead-agent/auth/phone/confirm", {
    method: "POST",
    token,
    body: { code: verification.dev_code },
  });
  assert(verified.credited === true && verified.balance_sar === 30, "Welcome credit was not awarded exactly once.");

  const leadRequest = await request("/lead-agent/requests", {
    method: "POST",
    token,
    headers: { "Idempotency-Key": `smoke-request-${runId}` },
    body: {
      query: "Riyadh dental clinic owners interested in lead generation",
      criteria: { searchStringsArray: ["dental clinics Riyadh"] },
      target_count: 2,
    },
  });
  assert(leadRequest.status === "queued", "Lead request was not queued.");

  const ingestion = await request("/lead-agent/integrations/leads", {
    method: "POST",
    headers: { "X-Waslah-Workflow-Secret": workflowSecret },
    body: {
      request_id: leadRequest.id,
      provider_job_id: `smoke-${runId}`,
      leads: [
        {
          name: "Noura Alqahtani",
          title: "Clinic Owner",
          company: `Riyadh Smile ${runId}`,
          email: `noura.${runId}@example.com`,
          phone: "+966555000001",
          website: `https://riyadh-smile-${runId}.example.com`,
          location: "Riyadh, Saudi Arabia",
          industry: "Dental",
          source: "smoke-test",
          fit_score: 91
        },
        {
          name: "Fahad Alsalem",
          title: "General Manager",
          company: `Pearl Dental ${runId}`,
          email: `fahad.${runId}@example.com`,
          phone: "+966555000002",
          website: `https://pearl-dental-${runId}.example.com`,
          location: "Riyadh, Saudi Arabia",
          industry: "Dental",
          source: "smoke-test",
          fit_score: 84
        }
      ]
    },
  });
  assert(ingestion.ingested === 2, "Lead ingestion count is incorrect.");

  const previews = await request(`/lead-agent/requests/${leadRequest.id}/results`, { token });
  assert(previews.length === 2, "Expected two request results.");
  assert(previews[0].revealed === false && previews[0].email.includes("***"), "Lead preview exposed private contact data.");

  const reveal = await request(`/lead-agent/leads/${previews[0].id}/reveal`, { method: "POST", token, body: {} });
  assert(reveal.charged_sar === 1 && reveal.balance_sar === 29, "Lead reveal did not debit exactly 1 SAR.");
  assert(reveal.lead.email.includes("@example.com"), "Revealed lead did not include full contact data.");

  const replay = await request(`/lead-agent/leads/${previews[0].id}/reveal`, { method: "POST", token, body: {} });
  assert(replay.charged_sar === 0 && replay.balance_sar === 29, "Repeated reveal charged the wallet twice.");

  const account = await request("/lead-agent/me", { token });
  assert(account.phone_verified && account.wallet.balance === 29, "Final account state is inconsistent.");

  console.log(JSON.stringify({
    status: "ok",
    account: email,
    request_id: leadRequest.id,
    leads_ingested: ingestion.ingested,
    final_balance_sar: account.wallet.balance,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
