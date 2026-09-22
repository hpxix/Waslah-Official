---
type: "query"
date: "2026-09-14T16:02:50.087050+00:00"
question: "Continue the dashboard and add admin controls for global/per-account B2B and B2C access, Apify APIs, chat outcomes, B2C sourcing rationale, credit adjustments, and AI-understood account data with instant changes."
contributor: "graphify"
outcome: "useful"
source_nodes: ["adminContext()", "chatWithWasla()", "fetchApifyLeads()", "AccountProfile"]
---

# Q: Continue the dashboard and add admin controls for global/per-account B2B and B2C access, Apify APIs, chat outcomes, B2C sourcing rationale, credit adjustments, and AI-understood account data with instant changes.

## Answer

Extended the existing Directus adminContext and lead-agent call paths with database-backed feature flags and account overrides, managed encrypted Apify providers, signed account/global credit adjustment, chat outcome and understood-data logging, AI account memory, B2C sourcing explanations, audit logs, live capabilities enforcement, and a responsive frontend Admin Control Center. New-chat UX now skips lead-type selection when only one channel is enabled.

## Outcome

- Signal: useful

## Source Nodes

- adminContext()
- chatWithWasla()
- fetchApifyLeads()
- AccountProfile