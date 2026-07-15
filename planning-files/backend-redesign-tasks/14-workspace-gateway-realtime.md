# Task 14 — Workspace gateway (real-time); remove `mcp-events`

**Read first:** `../backend-redesign-v2.md` §5.
**Depends on:** 09, 10, 11. **Blocks:** 15.

## Goal
Generalize today's MCP-only SSE bus into a workspace gateway that broadcasts **every**
mutation (human + AI) so the feed and canvas panels stay in sync. Keep the proven per-user
RxJS `Subject` → SSE pattern; broaden who publishes.

## Requirements
- Create `apps/api/src/workspace/gateway/workspace.gateway.ts` (+ a service if you prefer to
  keep the bus separate). Base it on the existing
  `apps/api/src/mcp-events/mcp-events.service.ts` (per-user `Subject`, heartbeat, SSE
  `Observable<SseMessage>`), which works well.
- **Event payload** extends the current `McpToolEvent` with `source: 'user' | 'mcp'` and keeps
  entity `type` + resource ids. Define a `WorkspaceEvent` type.
- **Publishers move into the workspace services:** thoughts/labels/relationships each emit a
  typed event on create/update/delete (fill in the TODO hooks left in tasks 09–11). A single
  emit at the service layer now covers both UI-originated and MCP-originated writes — so the
  internal-mcp controller no longer needs to emit (task 15 removes its emit calls).
- **SSE endpoint:** expose the per-user stream (port the controller from
  `apps/api/src/mcp-events/mcp-events.controller.ts`), guarded so a user only receives their
  own events.
- **Remove** the `mcp-events` module (`McpEventsModule`, service, controller) once the
  workspace gateway covers its role and `app.module.ts` no longer imports it.

## Notes
- Do **not** introduce WebSockets — SSE + REST writes is the chosen design (§5). The name
  "gateway" here is the workspace sync component, not necessarily a Nest `WebSocketGateway`.
- Web app currently subscribes to the MCP events stream; keep the event shape close enough
  that the change is a small frontend follow-up (note the new `source` field).

## Acceptance criteria
- `npm run build` succeeds.
- A mutation through the thoughts/labels/relationships services publishes one event with the
  correct `source`.
- The per-user SSE endpoint streams only that user's events, with heartbeat.
- `mcp-events` module is gone.

## Out of scope
- internal-mcp rewiring (task 15).
