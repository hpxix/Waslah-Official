---
type: "query"
date: "2026-10-22T03:44:01.594127+00:00"
question: "Chat shrinks depending on sidebar and messages; restore stable chat sizing and CRM icon"
contributor: "graphify"
outcome: "useful"
source_nodes: ["App()", "ConsoleShell()", "SidebarMetalToggle()"]
---

# Q: Chat shrinks depending on sidebar and messages; restore stable chat sizing and CRM icon

## Answer

Expanded graph vocabulary: chat sidebar shell app. App(), ConsoleShell(), and SidebarMetalToggle() locate the shell. Live DOM confirmed empty chat page shrank to 776px while a conversation occupied 1480px. The old deployed build had auto-width flex sizing driven by content. Source now explicitly stretches the page, sets width 100%, resets auto margins, and constrains workspace/grid tracks; desktop lane uses stable 1120px expanded and 1320px collapsed canvas sizes. CRM already uses SquareKanban in source and requires frontend redeployment. Verify browser after rebuilding.

## Outcome

- Signal: useful

## Source Nodes

- App()
- ConsoleShell()
- SidebarMetalToggle()