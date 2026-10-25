---
type: "query"
date: "2026-10-22T20:05:59.763151+00:00"
question: "Audit and implement Haraj phone consent request verification action scopes revocation audit and export workflow"
contributor: "graphify"
outcome: "corrected"
correction: "Use docs/haraj-consent-workflow.md and the backend contact-consent.js/contact-authorization.js modules for current behavior; graph only reflects older frontend consent."
source_nodes: ["ConsentCheck()", "LeadGenerationReveal()"]
---

# Q: Audit and implement Haraj phone consent request verification action scopes revocation audit and export workflow

## Answer

Expanded graph vocabulary: consent phone reveal integration admin lead. Graph is stale for new backend modules; direct source audit found no consent acquisition API and cached browser downloads. Implemented contact-consent.js signed first-party bridge workflow, action scopes, independent V2 grants, revocation serialization, audit migration, fresh download authorization. Unit and isolated PostgreSQL tests pass; production bridge configuration/deployment remains outstanding.

## Outcome

- Signal: corrected
- Correction: Use docs/haraj-consent-workflow.md and the backend contact-consent.js/contact-authorization.js modules for current behavior; graph only reflects older frontend consent.

## Source Nodes

- ConsentCheck()
- LeadGenerationReveal()