# Website understanding in chat

Send a public HTTPS website URL in a Wasla conversation. The chat creates an account- and conversation-scoped reading job and displays persisted, factual progress events. Reopening the conversation resumes status polling.

The reader fetches readable server-rendered text from the submitted page and up to four relevant same-origin product/service/about/pricing links. It respects robots rules, does not authenticate, does not run website scripts, skips non-public targets and does not bypass access blocks. A temporary DNS failure gets one bounded retry, displayed as such. Pages requiring JavaScript may be unreadable, which is disclosed.

Requests validate every redirect and all resolved addresses; HTTPS connections pin the validated DNS answer. Private/reserved networks, IP-literal targets, custom ports and credential-bearing URLs are rejected. Bodies, page counts, runtime and per-account job frequency are bounded. Job creation is serialized per account.

The free-router analysis must provide an exact page URL and a literal source quote for each retained business field. Unsupported source/quote pairs are dropped. The final overview covers offer, customer, customer benefit, commercial model, target audience, fit evidence and geography. Its percentage is supported-field coverage out of seven—not a calibrated confidence, accuracy or conversion score. Missing fields and unreadable pages are reported, and the user must confirm the intended product/audience/market before proceeding.

Website evidence is included only in subsequent prompts from the same authenticated user, workspace (or workspace-less admin) and conversation. It is not written into global Business DNA and never launches a lead search on its own. Existing LinkedIn/Haraj source-link workflows are not intercepted unless the user explicitly asks to read them as a website.

Tests: `bun scripts/test-website-reader.mjs`, TypeScript and production build, plus chat/discovery/Lite regression checks.
