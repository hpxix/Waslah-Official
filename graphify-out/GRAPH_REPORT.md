# Graph Report - waslah  (2026-09-12)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 373 nodes · 615 edges · 22 communities (18 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `735cb718`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.tsx
- directus.ts
- AuthDialog.tsx
- useLanguage
- package.json
- import-starter-leads.mjs
- compilerOptions
- bootstrap.mjs
- dependencies
- AdminLeadExplorer.tsx
- scripts
- devDependencies
- test-growth-integration.mjs
- test-lead-core.mjs
- compilerOptions
- directus-extension-waslah-credit-grants-hook/package.json
- directus-extension-waslah-lead-agent/package.json
- smoke-lead-agent.mjs
- test-growth.mjs
- tsconfig.json
- test-b2c.mjs

## God Nodes (most connected - your core abstractions)
1. `ConsoleShell()` - 22 edges
2. `useLanguage()` - 19 edges
3. `compilerOptions` - 17 edges
4. `AuthDialog()` - 15 edges
5. `scripts` - 13 edges
6. `apiErrorMessage()` - 12 edges
7. `authenticatedRequest()` - 11 edges
8. `finalize()` - 11 edges
9. `accountToAuthUser()` - 10 edges
10. `getAccount()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `LandingChat()` --calls--> `useLanguage()`  [EXTRACTED]
  src/App.tsx → src/i18n.tsx
- `WaslaNavCapsule()` --calls--> `useLanguage()`  [EXTRACTED]
  src/App.tsx → src/i18n.tsx
- `ConsoleShell()` --calls--> `useLanguage()`  [EXTRACTED]
  src/App.tsx → src/i18n.tsx
- `ConsoleShell()` --calls--> `apiErrorMessage()`  [EXTRACTED]
  src/App.tsx → src/lib/directus.ts
- `ConsoleShell()` --calls--> `fetchAdminLeads()`  [EXTRACTED]
  src/App.tsx → src/lib/directus.ts

## Import Cycles
- None detected.

## Communities (22 total, 3 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.06
Nodes (31): ChatActivityMode, ChatMessage, ChatThread, CompanyListing, CompanyListingsPage(), DealIntent, groupItems(), InsightDashboard() (+23 more)

### Community 1 - "directus.ts"
Cohesion: 0.09
Nodes (41): adminLeadToLead(), ConsoleShell(), focusWorkspaceSearch(), handleResearch(), openChat(), runConsoleFetch(), selectTab(), sendConsoleMessage() (+33 more)

### Community 2 - "AuthDialog.tsx"
Cohesion: 0.10
Nodes (28): canvas-confetti, App(), AuthDialog(), completeSocialProfile(), createAccount(), sendVerification(), signIn(), startSocialLogin() (+20 more)

### Community 3 - "useLanguage"
Cohesion: 0.10
Nodes (22): lucide-react, react, react-router, @refinedev/core, @refinedev/react-router, LeadFlowVisual(), LegalPage(), LegalPageProps (+14 more)

### Community 4 - "package.json"
Cohesion: 0.08
Nodes (25): name, private, type, version, axios, clsx, eslint, @eslint/js (+17 more)

### Community 5 - "import-starter-leads.mjs"
Cohesion: 0.17
Nodes (19): avatarUrl(), companyImageUrl(), domainFrom(), enrich(), existingFingerprints, finalize(), headers, limited() (+11 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+10 more)

### Community 7 - "bootstrap.mjs"
Cohesion: 0.18
Nodes (9): collections, directusUrl, ensureCollection(), ensureRole(), fieldPayload(), json(), login(), main() (+1 more)

### Community 8 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, axios, canvas-confetti, clsx, @fontsource/ibm-plex-sans, @heroui/react, lucide-react, @paper-design/shaders (+9 more)

### Community 9 - "AdminLeadExplorer.tsx"
Cohesion: 0.20
Nodes (10): AdminLeadExplorer(), emptyResponse, initials(), LeadImage(), LeadRow(), ViewMode, AdminLead, AdminLeadResponse (+2 more)

### Community 10 - "scripts"
Cohesion: 0.15
Nodes (13): scripts, build, data:import:starter, dev, docker:dev, docker:down, docker:logs, docker:up (+5 more)

### Community 11 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, @types/canvas-confetti, @types/node (+4 more)

### Community 12 - "test-growth-integration.mjs"
Cohesion: 0.17
Nodes (10): apiRequire, db, knex, logger, require, router, routes, tenantA (+2 more)

### Community 13 - "test-lead-core.mjs"
Cohesion: 0.17
Nodes (7): db, env, knex, require, router, routes, tenants

### Community 14 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, allowSyntheticDefaultImports, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+3 more)

### Community 15 - "directus-extension-waslah-credit-grants-hook/package.json"
Cohesion: 0.18
Nodes (10): description, directus:extension, host, path, source, type, files, name (+2 more)

### Community 16 - "directus-extension-waslah-lead-agent/package.json"
Cohesion: 0.18
Nodes (10): description, directus:extension, host, path, source, type, files, name (+2 more)

### Community 17 - "smoke-lead-agent.mjs"
Cohesion: 0.47
Nodes (5): assert(), baseUrl, main(), request(), runId

## Knowledge Gaps
- **157 isolated node(s):** `ChatActivityMode`, `ChatMessage`, `ChatThread`, `CompanyListing`, `DealIntent` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 199 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `package.json`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `ConsoleShell()` (e.g. with `adminLeadToLead()` and `newChatId()`) actually correct?**
  _`ConsoleShell()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ChatActivityMode`, `ChatMessage`, `ChatThread` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06376811594202898 - nodes in this community are weakly interconnected._
- **Should `directus.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09191583610188261 - nodes in this community are weakly interconnected._