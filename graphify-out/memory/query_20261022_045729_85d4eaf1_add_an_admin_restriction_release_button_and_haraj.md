---
type: "query"
date: "2026-10-22T04:57:29.742732+00:00"
question: "Add an admin restriction-release button and Haraj API performance section with a risk meter and client performance controls"
contributor: "graphify"
outcome: "useful"
source_nodes: ["directus.ts", "App.tsx"]
---

# Q: Add an admin restriction-release button and Haraj API performance section with a risk meter and client performance controls

## Answer

Expanded vocabulary: admin request fetch api. Graph located directus.ts and App.tsx but lacks newer Haraj implementation. Direct inspection found AdminHarajSafety and the adminContext-protected /admin/haraj-safety API. Implemented dedicated Haraj admin tab, reviewed listing-only or full-scope resume, configure action preserving pauses/usage, actual recent success/latency and UTC daily budgets, bounded 24h/50-event telemetry, internal operational-pressure meter with reasons, bilingual responsive UI, and allowlisted schema diagnostics. Synthetic guard/performance and PostgreSQL isolation tests pass; no Haraj requests or live restriction release performed.

## Outcome

- Signal: useful

## Source Nodes

- directus.ts
- App.tsx