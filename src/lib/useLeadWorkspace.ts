import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Lead } from "../types";
import { apiErrorMessage, fetchLeadJob, fetchLeadJobs, fetchWorkspaceLeads, getAccount, isLeadJobRunning } from "./directus";
import type { LeadJob } from "./directus";

const STALE_JOB_MS = 30 * 60 * 1000;

function settledJob(job: LeadJob | null): { job: LeadJob | null; error: string } {
  if (!job) return { job: null, error: "" };
  const status = job.status.toLowerCase();
  if (["failed", "error", "cancelled"].includes(status)) {
    return { job, error: job.error_message || "Lead generation failed. No credits were charged for undelivered leads." };
  }
  const updatedAt = job.updated_at ? Date.parse(job.updated_at) : NaN;
  if (isLeadJobRunning(job) && Number.isFinite(updatedAt) && Date.now() - updatedAt > STALE_JOB_MS) {
    const message = "The lead source stopped responding. This search was stopped safely; undelivered leads were not charged.";
    return { job: { ...job, status: "failed", error_message: message }, error: message };
  }
  return { job, error: "" };
}

export function useLeadWorkspace(userId: string | undefined, initialCredits: number, setLeads: Dispatch<SetStateAction<Lead[]>>) {
  const [job, setJob] = useState<LeadJob | null>(null);
  const [credits, setCredits] = useState(initialCredits);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const jobRef = useRef<LeadJob | null>(null);
  const acceptJob = useCallback((next: LeadJob) => {
    jobRef.current = next;
    setJob(next);
    setError("");
    setRevision((value) => value + 1);
  }, []);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    jobRef.current = null;
    setJob(null);
    setError("");
    setLoading(true);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      let repeat = false;
      try {
        const jobs = jobRef.current ? [] : await fetchLeadJobs();
        const fetched = jobRef.current
          ? await fetchLeadJob(jobRef.current.id)
          : jobs.find(isLeadJobRunning) || jobs[0] || null;
        const state = settledJob(fetched);
        const current = state.job;
        // Fetch inventory after status so a completed job always includes its committed results.
        const [items, account] = await Promise.all([fetchWorkspaceLeads(), getAccount()]);
        if (cancelled) return;
        setLeads(items);
        setCredits(Math.floor(account.wallet.balance * 10));
        jobRef.current = current;
        setJob(current);
        setError(state.error);
        repeat = isLeadJobRunning(current);
      } catch (failure) {
        if (cancelled) return;
        setError(apiErrorMessage(failure, "Could not refresh leads. Please try again."));
        repeat = isLeadJobRunning(jobRef.current);
      } finally {
        if (!cancelled) {
          setLoading(false);
          if (repeat) timer = setTimeout(load, 4000);
        }
      }
    }
    void load();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener("focus", onFocus); };
  }, [userId, revision, setLeads, refresh]);

  return { job, credits, setCredits, loading, error, refresh, acceptJob, running: isLeadJobRunning(job) };
}
