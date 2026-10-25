import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { notifyProviderSafetyPause } from './provider-credit-alerts.js';
import { harajPerformance } from './haraj-performance.js';

// Internal conservative ceilings, NOT a claim about Haraj's permitted limits.
// A human must confirm authorized access and limits before any automation runs.
export const DEFAULT_HARAJ_LIMITS = Object.freeze({ intervalMs: 3000, requestsPerDay: 1000, contactsPerDay: 100, emptyContactLimit: 5 });
const TABLE = 'wasla_haraj_safety';
const LOCK = 84621973;
const CACHE_LIMIT = 500;
let configured;

export function safeHarajError(code, reason, retryAt = null) {
  const error = new Error(reason.includes('access_review_required')
    ? 'Lead search is waiting for administrator setup. No sourcing requests were sent. An administrator can enable the guarded connection in Wasla-Lite limits.'
    : `Contact retrieval paused. ${reason} Saved leads are kept; an administrator must review the connection before retrying.`);
  Object.assign(error, { code, provider: 'haraj', retryAt, safetyPause: true });
  return error;
}

export function retryAfterAt(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  const time = Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : Date.parse(value);
  return Number.isFinite(time) && time > now ? time : null;
}

export function classifyHarajFailure(error) {
  const status = Number(error?.status || 0);
  const text = `${error?.code || ''} ${error?.message || ''}`;
  if (status === 401 || /unauthenticated|unauthori[sz]ed|invalid[_ -]?(?:token|api[_ -]?key)|(?:token|jwt)[_ -]?(?:is[_ -]?)?expired|expired[_ -]?token|غير مصرح/i.test(text)) return 'authentication_rejected';
  if (status === 403 || /forbidden|banned|blocked|restricted|suspended|captcha|access.?denied|تم حظر|حسابك محظور/i.test(text)) return 'access_restricted';
  if (status === 429 || /rate.?limit|too[_ -]?many[_ -]?requests|throttl|طلبات كثيرة/i.test(text)) return 'rate_limited';
  if (status === 402 || /insufficient.{0,10}(credits|balance)|quota.?exceeded/i.test(text)) return 'credits_depleted';
  if (error?.code === 'HARAJ_INVALID_RESPONSE') return 'invalid_response';
  return 'request_failed';
}

// Retry only idempotent public searches on transient transport/server failures.
// Each operation re-enters the shared guard, so retries consume the same daily
// budget/spacing and can never clear a safety pause or replay a contact reveal.
export async function recoverHarajSearch(operation, { signal, sleep = ms => delay(ms, undefined, { signal }) } = {}) {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try { return await operation(); }
    catch (error) {
      const status = Number(error?.status || 0);
      if (attempt >= 2 || error?.safetyPause || error?.code !== 'HARAJ_REQUEST_FAILED'
        || status && status !== 408 && status < 500) throw error;
      try { await sleep(1500 * (attempt + 1)); }
      catch (waitError) { signal?.throwIfAborted(); throw waitError; }
    }
  }
}

export function validateHarajEndpoint(input) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash
      || !(url.hostname === 'haraj.com.sa' || url.hostname.endsWith('.haraj.com.sa'))) throw new Error();
    // Existing Haraj endpoints carry operation/client metadata in the query
    // string. Reject credentials/unknown fields, not legitimate API metadata.
    const allowed = {
      queryName: /^[A-Za-z][A-Za-z0-9_]{0,63}$/,
      lang: /^(ar|en)$/,
      clientId: /^[A-Za-z0-9._-]{1,64}$/,
      // Existing app version labels include spaces/platform/build parentheses.
      version: /^[A-Za-z0-9._+(), /;-]{1,64}$/,
    };
    for (const [key, value] of url.searchParams) {
      if (!Object.hasOwn(allowed, key) || !allowed[key].test(value) || url.searchParams.getAll(key).length !== 1) throw new Error();
    }
    return url.href;
  } catch {
    // Never include the supplied value: it may accidentally be a credential.
    throw safeHarajError('HARAJ_INVALID_CONFIGURATION', 'The sourcing endpoint is invalid.');
  }
}

export function validateHarajLimits(input) {
  const ranges = { intervalMs: [1000, 3600000], requestsPerDay: [0, 10000], contactsPerDay: [1, 1000], emptyContactLimit: [1, 20] };
  const result = {};
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = Number(input?.[key]);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid Haraj safety limit: ${key}.`);
    result[key] = value;
  }
  if (result.requestsPerDay > 0 && result.contactsPerDay > result.requestsPerDay) throw new Error('Contact budget cannot exceed total request budget.');
  return result;
}

export function initialHarajState() {
  return { paused: true, reason: 'access_review_required', contactsPaused: false, contactPauseReason: null, retryAt: null, limits: { ...DEFAULT_HARAJ_LIMITS }, day: '', requests: 0, contacts: 0, emptyContacts: 0, failures: 0, nextAt: 0, lease: null, cache: {}, events: [] };
}

function record(state, event, now) {
  state.events = [...(state.events || []), { at: new Date(now).toISOString(), ...event }].slice(-50);
}

function pause(state, reason, now, retryAt = null) {
  state.paused = true;
  state.reason = reason;
  state.retryAt = retryAt;
  record(state, { kind: 'pause', reason }, now);
}

function transientTransportStatus(status) {
  const value = Number(status || 0);
  return !value || value === 408 || (value >= 500 && value <= 599);
}

// Migrate only the old transport-error lock. Never clear an operator pause,
// invalid response, authentication/access denial, provider quota or rate limit.
export function recoverTransientHarajPause(state, now = Date.now()) {
  if (!state.paused || state.reason !== 'request_failed') return false;
  const failure = [...(state.events || [])].reverse().find(event => event.outcome === 'request_failed');
  if (!failure || !transientTransportStatus(failure.status)) return false;
  state.nextAt = Math.max(Number(state.nextAt || 0), Number(state.retryAt || 0), now);
  state.paused = false;
  state.reason = null;
  state.retryAt = null;
  record(state, { kind: 'transient_pause_recovered', reason: 'request_failed' }, now);
  return true;
}

function recoverExpiredReadLease(state,time) {
  const lease=state.lease;
  if(!lease||lease.until>time||!['search','comments','profile','posts'].includes(lease.kind))return false;
  // Only known read operations can be retried after their transport deadline.
  // Unknown legacy leases and contact reveals still require explicit review.
  state.lease=null;
  state.nextAt=Math.max(Number(state.nextAt||0),time+state.limits.intervalMs);
  record(state,{kind:'expired_read_lease_recovered',operation:lease.kind},time);
  return true;
}

export function assertHarajSearchReady(state, now=Date.now()) {
  if(state.paused)throw safeHarajError('HARAJ_SAFETY_PAUSED',`Connection status: ${state.reason}.`,state.retryAt);
  if(state.limits.requestsPerDay>0 && state.day===new Date(now).toISOString().slice(0,10) && state.requests>=state.limits.requestsPerDay)
    throw safeHarajError('HARAJ_SAFETY_PAUSED','Connection status: daily_request_budget_reached.');
  return state;
}

// Store.transact serializes short state changes. Network I/O runs OUTSIDE the DB
// transaction under a durable lease, so queued workers cannot exhaust the pool.
export function createHarajSafety({ store, now = Date.now, sleep = (ms, signal) => delay(ms, undefined, { signal }), notify = notifyProviderSafetyPause }) {
  async function status() {
    return store.transact(state => {
      recoverTransientHarajPause(state, now());
      const { cache, lease, ...publicState } = state;
      return { ...publicState, performance: harajPerformance(state, now()), inFlight: Boolean(lease && lease.until > now()) };
    });
  }
  async function control({ action, limits, confirmed, actor, searchOnly = false }) {
    return store.transact(state => {
      if (action === 'pause') pause(state, 'admin_paused', now());
      else if (action === 'setup') {
        // Explicit operator setup may clear ONLY our unused first-run lock.
        // It can never clear an actual provider denial, budget stop or admin pause.
        if (confirmed !== true || state.reason !== 'access_review_required' || state.requests || state.contacts || state.lease) throw new Error('Initial setup cannot clear an active or previously used connection. Review it as an administrator.');
        Object.assign(state, { paused: false, reason: null, contactsPaused: false, contactPauseReason: null, limits: { ...DEFAULT_HARAJ_LIMITS } });
        record(state, { kind: 'operator_initial_setup', actor: String(actor || '') }, now());
      }
      else if (action === 'configure') {
        if (confirmed !== true) throw new Error('Confirm authorized provider access and permitted limits first.');
        state.limits = validateHarajLimits(limits);
        state.nextAt = Math.max(state.nextAt || 0, now() + state.limits.intervalMs);
        record(state, { kind: 'admin_configure', actor: String(actor || ''), limits: { ...state.limits } }, now());
      }
      else if (action === 'resume') {
        if (confirmed !== true) throw new Error('Confirm authorized provider access and permitted limits first.');
        if (state.lease?.until > now()) throw new Error('Wait for the current request to finish before resuming.');
        state.lease = null; // Expired leases require this explicit admin review.
        if (state.retryAt && state.retryAt > now()) throw new Error('The provider Retry-After period has not elapsed.');
        state.limits = validateHarajLimits(limits);
        // Do not reset daily usage or cached results when resuming or changing tokens.
        Object.assign(state, { paused: false, reason: null, retryAt: null, failures: 0 });
        if (!searchOnly) Object.assign(state, { contactsPaused: false, contactPauseReason: null, emptyContacts: 0 });
        record(state, { kind: 'admin_resume', actor: String(actor || ''), scope: searchOnly ? 'search' : 'all', limits: { ...state.limits } }, now());
      } else throw new Error('Unknown Haraj safety action.');
      return { ok: true };
    });
  }
  async function execute({ kind, cacheKey, signal }, operation) {
    if (!['search', 'contact', 'comments', 'profile', 'posts'].includes(kind)) throw new Error('Unknown Haraj request kind.');
    const id = randomUUID();
    for (;;) {
      signal?.throwIfAborted();
      const claim = await store.transact(state => {
        const time = now();
        recoverTransientHarajPause(state, time);
        if (state.paused) return { error: state.reason, retryAt: state.retryAt };
        if (state.lease) {
          if (state.lease.until > time) return { wait: 250 };
          if(!recoverExpiredReadLease(state,time)){
            state.lease = null;
            pause(state, 'interrupted_request_review_required', time);
            return { error: state.reason };
          }
        }
        const key = kind === 'contact' && cacheKey ? String(cacheKey) : null;
        if (key && state.cache?.[key]?.expires > time) return { cached: true, value: state.cache[key].value };
        if (kind === 'contact' && state.contactsPaused) return { cached: true, value: { postContact: null } };
        const day = new Date(time).toISOString().slice(0, 10);
        if (state.day !== day) Object.assign(state, { day, requests: 0, contacts: 0 });
        if (state.limits.requestsPerDay > 0 && state.requests >= state.limits.requestsPerDay) {
          pause(state, 'daily_request_budget_reached', time);
          return { error: state.reason };
        }
        if (kind === 'contact' && state.contacts >= state.limits.contactsPerDay) {
          state.contactsPaused = true;
          state.contactPauseReason = 'daily_contact_budget_reached';
          record(state, { kind: 'contact_pause', reason: state.contactPauseReason }, time);
          return { cached: true, value: { postContact: null }, contactWarning: state.contactPauseReason };
        }
        if (state.nextAt > time) return { wait: Math.min(state.nextAt - time, 1000) };
        state.requests++;
        if (kind === 'contact') state.contacts++;
        state.lease = { id, kind, until: time + 60000 };
        // The configured interval separates request starts. The single lease
        // still prevents overlapping calls; slow responses already satisfy
        // some or all of that spacing and need no second, artificial delay.
        state.nextAt = time + state.limits.intervalMs;
        return { claimed: true };
      });
      if (claim.error) {
        void notify({ reason: claim.error, retryAt: claim.retryAt }).catch(() => {});
        throw safeHarajError('HARAJ_SAFETY_PAUSED', `Connection status: ${claim.error}.`, claim.retryAt);
      }
      if (claim.contactWarning) void notify({ reason: claim.contactWarning, scope: 'contacts' }).catch(() => {});
      if (claim.cached) return claim.value;
      if (claim.claimed) break;
      try { await sleep(claim.wait || 250, signal); }
      catch (waitError) { signal?.throwIfAborted(); throw waitError; }
    }
    const startedAt = now();
    let outcome;
    let failure;
    try { signal?.throwIfAborted(); outcome = await operation(); }
    catch (error) { failure = error; }
    const result = await store.transact(state => {
      const time = now();
      const contactsWerePaused = Boolean(state.contactsPaused);
      if (state.lease?.id !== id) {
        if(['search','comments','profile','posts'].includes(kind)){
          // A recovered read may settle late. Discard it without invalidating
          // the newer worker's lease or persisting stale data.
          record(state,{kind:'late_read_discarded',operation:kind},time);
          return {discardedRead:true};
        }
        pause(state, 'request_lease_lost', time);
        return { error: state.reason };
      }
      state.lease = null;
      state.nextAt = Math.max(Number(state.nextAt || 0), startedAt + state.limits.intervalMs);
      const failureReason = failure ? classifyHarajFailure(failure) : null;
      // A user stop or campaign deadline is not a provider outage. Release the
      // lease without poisoning the next run's failure count or backoff. A real
      // provider denial observed concurrently still retains its normal lock.
      if (signal?.aborted && (!failure || failureReason === 'request_failed')) {
        record(state, { kind: 'request_cancelled', operation: kind, durationMs: Math.max(0, time - startedAt) }, time);
        return { cancelled: true };
      }
      if (failure) {
        const reason = failureReason;
        state.failures++;
        const retryAt = retryAfterAt(failure.retryAfter, time);
        const transient = reason === 'request_failed' && transientTransportStatus(failure.status);
        if (transient) {
          // Bounded backoff, not a sticky account-wide lock. Requests still
          // consume shared budgets and obey spacing/provider Retry-After.
          const backoff = Math.min(30_000, 1500 * 2 ** Math.min(state.failures - 1, 5));
          state.nextAt = Math.max(state.nextAt, time + backoff, retryAt || 0);
        } else pause(state, reason, time, retryAt);
        // Status/code only; raw messages, request bodies, tokens and phone numbers
        // never enter diagnostics or alert messages.
        const diagnostic = ['invalid_json', 'missing_search', 'invalid_items', 'missing_pagination', 'invalid_contact'].includes(failure.responseDiagnostic) ? failure.responseDiagnostic : undefined;
        record(state, { kind, outcome: reason, status: Number(failure.status) || null, durationMs: Math.max(0, time - startedAt), ...(diagnostic ? { diagnostic } : {}) }, time);
      } else {
        state.failures = 0;
        if (kind === 'contact') {
          state.emptyContacts = outcome.empty ? state.emptyContacts + 1 : 0;
          state.cache ||= {};
          for (const [key, entry] of Object.entries(state.cache)) if (entry.expires <= time) delete state.cache[key];
          if (cacheKey) state.cache[String(cacheKey)] = { value: outcome.value, expires: time + (outcome.empty ? 6 : 24) * 3600000 };
          const keys = Object.keys(state.cache);
          for (const key of keys.slice(0, Math.max(0, keys.length - CACHE_LIMIT))) delete state.cache[key];
          if (state.emptyContacts >= state.limits.emptyContactLimit) {
            state.contactsPaused = true;
            state.contactPauseReason = 'repeated_empty_contacts';
            record(state, { kind: 'contact_pause', reason: state.contactPauseReason }, time);
          }
        }
        record(state, { kind, outcome: outcome.empty ? 'empty' : 'ok', status: outcome.status || 200, durationMs: Math.max(0, time - startedAt) }, time);
      }
      return { error: state.paused ? state.reason : null, retryAt: state.retryAt, contactWarning: !contactsWerePaused && state.contactsPaused ? state.contactPauseReason : null };
    });
    if(result.cancelled)signal.throwIfAborted();
    if(result.discardedRead)throw Object.assign(new Error('The interrupted read was discarded. Retry the search.'),{code:'HARAJ_REQUEST_FAILED',status:503,provider:'haraj'});
    if (result.error) {
      void notify({ reason: result.error, retryAt: result.retryAt }).catch(() => {});
      throw safeHarajError('HARAJ_SAFETY_PAUSED', `Connection status: ${result.error}.`, result.retryAt);
    }
    if (result.contactWarning) void notify({ reason: result.contactWarning, scope: 'contacts' }).catch(() => {});
    if (failure) {
      if (signal?.aborted) signal.throwIfAborted();
      throw Object.assign(new Error('The sourcing request failed temporarily. Your saved results are kept; you can retry after the connection recovers.'), { code: 'HARAJ_REQUEST_FAILED', status: Number(failure.status) || null, provider: 'haraj' });
    }
    return outcome.value;
  }
  return { execute, status, control };
}

export function postgresHarajStore(database) {
  let ready;
  async function ensure() {
    ready ||= database.transaction(async trx => {
      // Serialize cold-start DDL as well: concurrent CREATE IF NOT EXISTS can
      // otherwise race on PostgreSQL's backing type/catalog entries.
      await trx.raw('SELECT pg_advisory_xact_lock(?)', [LOCK]);
      await trx.raw(`CREATE TABLE IF NOT EXISTS ${TABLE} (id integer PRIMARY KEY, state jsonb NOT NULL)`);
      await trx(TABLE).insert({ id: 1, state: JSON.stringify(initialHarajState()) }).onConflict('id').ignore();
    })
      .catch(error => { ready = null; throw error; });
    await ready;
  }
  return {
    async transact(fn) {
      await ensure();
      return database.transaction(async trx => {
        await trx.raw('SELECT pg_advisory_xact_lock(?)', [LOCK]);
        const row = await trx(TABLE).where({ id: 1 }).first();
        const state = typeof row.state === 'string' ? JSON.parse(row.state) : row.state;
        const result = await fn(state);
        await trx(TABLE).where({ id: 1 }).update({ state: JSON.stringify(state) });
        return result;
      });
    },
  };
}

export function configureHarajSafety({ database, store, ...options }) {
  configured = createHarajSafety({ store: store || postgresHarajStore(database), ...options });
  return configured;
}

export function harajSafety() {
  if (!configured) throw safeHarajError('HARAJ_SAFETY_UNAVAILABLE', 'The shared request guard is unavailable.');
  return configured;
}
