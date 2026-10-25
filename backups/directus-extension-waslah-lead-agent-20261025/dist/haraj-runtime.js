// One wall-clock allowance across passes, queue waits, HTTP calls and recovery.
// Explicit user retries get a new allowance; automatic continuations do not.
export const HARAJ_RUNTIME_VERSION = 'five-minutes-per-30-v1';
export const harajRuntimeMs = target => Math.ceil(Math.max(1, Number(target) || 30) * 300_000 / 30);
const stages = ['buyer_intent', 'product_comments', 'product_ads'];
const weights = { buyer_intent: 1, product_comments: 1, product_ads: 2 };

export function harajRuntime(previous, target, attemptKey = 'initial', now = Date.now()) {
  const budgetMs = harajRuntimeMs(target);
  if (previous?.version === HARAJ_RUNTIME_VERSION && previous.attemptKey === attemptKey
    && Number.isFinite(previous.startedAtMs)) {
    return { ...previous, budgetMs, deadlineAtMs: previous.startedAtMs + budgetMs };
  }
  return { version: HARAJ_RUNTIME_VERSION, attemptKey, budgetMs, startedAtMs: now,
    deadlineAtMs: now + budgetMs, stages: {}, stoppedStages: {} };
}

export function enterHarajStage(runtime, stage, now = Date.now()) {
  if (!stage || !weights[stage]) return runtime.deadlineAtMs;
  runtime.stages ||= {};
  if (!runtime.stages[stage]) {
    const remainingWeight = stages.slice(stages.indexOf(stage)).reduce((sum, key) => sum + weights[key], 0);
    // Unused time from an exhausted earlier stage flows into the remaining stages.
    const allowance = Math.max(0, runtime.deadlineAtMs - now) * weights[stage] / remainingWeight;
    runtime.stages[stage] = { startedAtMs: now, deadlineAtMs: Math.min(runtime.deadlineAtMs, now + Math.floor(allowance)) };
  }
  return Math.min(runtime.deadlineAtMs, runtime.stages[stage].deadlineAtMs);
}

export function harajTimeError(runtime, stage, deadlineAtMs) {
  return Object.assign(new Error('The Haraj search time allowance has been reached.'), {
    code: deadlineAtMs < runtime.deadlineAtMs ? 'HARAJ_STAGE_TIME_LIMIT' : 'HARAJ_TIME_LIMIT',
    stage, provider: 'haraj',
  });
}

export function harajDeadline(runtime, stage, parentSignal, { now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
  const deadlineAtMs = enterHarajStage(runtime, stage, now());
  const controller = new AbortController();
  const expire = () => controller.abort(harajTimeError(runtime, stage, deadlineAtMs));
  const remaining = deadlineAtMs - now();
  const timer = remaining > 0 ? schedule(expire, remaining) : null;
  if (remaining <= 0) expire();
  return { deadlineAtMs, signal: parentSignal ? AbortSignal.any([parentSignal, controller.signal]) : controller.signal,
    close: () => { if (timer !== null) cancel(timer); } };
}

export const isHarajTimeLimit = error => ['HARAJ_TIME_LIMIT', 'HARAJ_STAGE_TIME_LIMIT'].includes(error?.code);

export function harajTimeLimitMessage(runtime, delivered, requested) {
  const seconds = Math.round(runtime.budgetMs / 1000);
  const duration = `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ''}`;
  return `Haraj reached its ${duration} time limit. ${delivered} of ${requested} leads were saved. Saved results are kept; this does not mean the source was exhausted.`;
}
