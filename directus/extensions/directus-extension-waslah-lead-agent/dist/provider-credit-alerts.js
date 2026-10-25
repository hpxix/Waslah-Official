const ALERT_TO = "mastergotmemes@gmail.com";
const ALERT_SUBJECT = "WASLA OUT OF CREDITS*";
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

let sendEmail = null;
let log = null;
const lastDelivered = new Map();
const pending = new Map();

export function configureProviderCreditAlerts({ send, logger }) {
  sendEmail = send;
  log = logger;
}

export function providerCreditFailure(provider, error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  const detail = `${code} ${message}`;
  const depleted = /insufficient[_ -]?(credits?|balance|funds)|out of credits|credits? (?:exhausted|depleted)|quota[_ -]?exceeded|balance[_ -]?(?:exhausted|insufficient|empty|too low)|payment required|no credits? (?:left|remaining)/i.test(detail);
  const expired = /token[_ -]?(?:is[_ -]?)?expired|expired[_ -]?token|jwt expired|invalid[_ -]?token|invalid api key|unauthori[sz]ed|unauthenticated|authentication failed/i.test(detail);
  if (depleted || status === 402) return "credits depleted";
  if (expired || status === 401 || (status === 403 && provider === "haraj")) return "token expired or rejected";
  // A generic 429 is a temporary rate limit, not necessarily an empty balance.
  return null;
}

export async function notifyProviderCreditFailure(provider, error) {
  const reason = providerCreditFailure(provider, error);
  if (!reason) return false;
  const key = `${provider}:${reason}`;
  if (Date.now() - (lastDelivered.get(key) || 0) < ALERT_COOLDOWN_MS) return false;
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    if (!sendEmail) {
      log?.error?.(`Provider alert could not be sent: mail delivery is not configured (${provider}).`);
      return false;
    }
    const impact = provider === "haraj"
      ? "Wasla Lite won't operate because phone numbers aren't there. Haraj contact lookup is unavailable."
      : "OpenRouter is unavailable. AI-powered chat and lead processing may not operate.";
    const text = `WASLA OUT OF CREDITS*\n\nProvider: ${provider === "haraj" ? "Haraj (Lite)" : "OpenRouter"}\nReason: ${reason}\nImpact: ${impact}\nDetected: ${new Date().toISOString()}\n\nPlease renew the provider token or credits and check the integration.`;
    try {
      await sendEmail({ to: ALERT_TO, subject: ALERT_SUBJECT, text });
      lastDelivered.set(key, Date.now());
      log?.warn?.(`Provider credit alert sent for ${provider} (${reason}).`);
      return true;
    } catch (sendError) {
      log?.error?.(`Provider credit alert delivery failed for ${provider}: ${sendError?.message || sendError}`);
      return false;
    }
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

export async function notifyProviderSafetyPause({ reason, retryAt, scope = 'all' }) {
  if (reason === 'credits_depleted') return notifyProviderCreditFailure('haraj', { status: 402 });
  const key = `haraj-safety:${reason}`;
  if (Date.now() - (lastDelivered.get(key) || 0) < ALERT_COOLDOWN_MS) return false;
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    try {
      if (!sendEmail) throw new Error('Mail delivery is not configured.');
      await sendEmail({
        to: ALERT_TO,
        subject: 'WASLA LITE — CONTACT RETRIEVAL PAUSED',
        text: `Wasla Lite contact retrieval is paused.\n\nProvider: Haraj (Lite)\nReason: ${String(reason).replace(/[^a-z_]/gi, '').slice(0, 80)}\n${retryAt ? `Do not resume before: ${new Date(retryAt).toISOString()}\n` : ''}Impact: ${scope === 'contacts' ? 'Further phone lookups are blocked. Listing searches may continue within limits using public contact details.' : 'Further Haraj requests are blocked.'} Saved leads are kept.\nDetected: ${new Date().toISOString()}\n\nAn administrator must review authorized access, request limits and provider restrictions before resuming. Replacing a token does not clear the pause. This alert does not necessarily mean credits are depleted.`,
      });
      lastDelivered.set(key, Date.now());
      log?.warn?.('Haraj safety-pause alert delivered.');
      return true;
    } catch {
      log?.error?.('Haraj safety-pause email could not be delivered. Check SMTP configuration.');
      return false;
    }
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
