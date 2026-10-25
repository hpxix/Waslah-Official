---
type: "query"
date: "2026-10-14T22:28:46.705411+00:00"
question: "Why does it stop at 1.2k? It should go through as much listing as possible to get the leads no?"
contributor: "graphify"
outcome: "dead_end"
source_nodes: ["Lead", "CompanyListingsPage"]
---

# Q: Why does it stop at 1.2k? It should go through as much listing as possible to get the leads no?

## Answer

Expanded graph terms: lead, search, listing. Graph is stale for current b2c pipeline; current b2c.js and live run data show shouldPauseForYield marks routes exhausted after 2-7 reviewed pages without leads. Latest run fetched 1401 of 27500 allowed, evaluated 769, qualified 1, phone 0. Need fix request alignment and stop only at target, true source end, or configured cap; more listings alone cannot guarantee matches.

## Outcome

- Signal: dead_end

## Source Nodes

- Lead
- CompanyListingsPage