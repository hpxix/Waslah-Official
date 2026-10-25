---
type: "query"
date: "2026-10-14T22:22:59.903425+00:00"
question: "check the latest queries on why is waslah not looking into enough listings to get me the leads"
contributor: "graphify"
outcome: "dead_end"
source_nodes: ["Lead", "LeadGenerationRun"]
---

# Q: check the latest queries on why is waslah not looking into enough listings to get me the leads

## Answer

Expanded graph terms: lead, search, listing, generation. The existing graph is stale and does not include the current b2c.js pipeline; live database and current source were required. Latest Lite run stopped at 1401 fetched of 27500 allowed because all five strategies hit low_yield_cutoff after 2-7 reviewed pages. 1 candidate qualified, 0 phones resolved. The stored prompt was contaminated with Mission context and the generated terms excluded supplier words. See current b2c.js shouldPauseForYield and current b2c-keywords.js qualification.

## Outcome

- Signal: dead_end

## Source Nodes

- Lead
- LeadGenerationRun