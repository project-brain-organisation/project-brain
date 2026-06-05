/**
 * WorkspaceEventsService unit tests
 *
 * Scenario: workspace gateway publishes typed event per mutation and user isolation
 *
 * Test Budget: 4 distinct behaviors × 2 = 8 max unit tests (using 5)
 * Behaviors:
 *   B1: publish() routes WorkspaceEvent only to the correct user's stream
 *   B2: events carry the required source field ('user' | 'mcp')
 *   B3: streams from different users are isolated (no cross-user leakage)
 *   B4: onModuleDestroy() completes the bus (no further emissions after destroy)
 *
 * bypass: property-based testing requires an arbitrary generator library (e.g. fast-check)
 * that is not installed; single-example tests used as permitted fallback.
 * The observable-based bus has no domain invariants to quantify — it routes or it doesn't.
 */

import { WorkspaceEventsService, type WorkspaceEvent } from '../../../src/workspace/gateway/workspace-events.service';

function makeEvent(overrides: Partial<WorkspaceEvent> = {}): WorkspaceEvent {
  return {
    eventId: 'evt-1',
    type: 'thought.created',
    source: 'user',
    resourceId: 'res-1',
    projectId: 'proj-1',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('WorkspaceEventsService', () => {
  let service: WorkspaceEventsService;

  beforeEach(() => {
    service = new WorkspaceEventsService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  // ── B1: event delivery to the correct user ──────────────────────

  describe('B1 — publish routes to the correct user stream', () => {
    it('streamForUser receives events published for that user', (done) => {
      const userId = 'user-alice';
      const event = makeEvent({ eventId: 'evt-alice', type: 'thought.created' });

      const received: WorkspaceEvent[] = [];

      const sub = service.streamForUser(userId).subscribe((msg) => {
        if ((msg as { type?: string }).type === 'workspace.event') {
          received.push(msg.data as WorkspaceEvent);
          sub.unsubscribe();
          expect(received).toHaveLength(1);
          expect(received[0].eventId).toBe('evt-alice');
          done();
        }
      });

      service.publish(userId, event);
    });
  });

  // ── B2: source field is preserved on the event payload ──────────

  describe('B2 — source field propagates through the bus', () => {
    it('event published with source=user arrives with source=user', (done) => {
      const userId = 'user-bob';
      const event = makeEvent({ source: 'user', eventId: 'evt-src-user' });

      const sub = service.streamForUser(userId).subscribe((msg) => {
        if ((msg as { type?: string }).type === 'workspace.event') {
          sub.unsubscribe();
          expect((msg.data as WorkspaceEvent).source).toBe('user');
          done();
        }
      });

      service.publish(userId, event);
    });

    it('event published with source=mcp arrives with source=mcp', (done) => {
      const userId = 'user-carol';
      const event = makeEvent({ source: 'mcp', eventId: 'evt-src-mcp' });

      const sub = service.streamForUser(userId).subscribe((msg) => {
        if ((msg as { type?: string }).type === 'workspace.event') {
          sub.unsubscribe();
          expect((msg.data as WorkspaceEvent).source).toBe('mcp');
          done();
        }
      });

      service.publish(userId, event);
    });
  });

  // ── B3: user isolation ─────────────────────────────────────────

  describe('B3 — streams are isolated per user', () => {
    it('user-A stream does not receive events published for user-B', (done) => {
      const userA = 'user-alpha';
      const userB = 'user-beta';

      const receivedByA: WorkspaceEvent[] = [];

      const subA = service.streamForUser(userA).subscribe((msg) => {
        if ((msg as { type?: string }).type === 'workspace.event') {
          receivedByA.push(msg.data as WorkspaceEvent);
        }
      });

      // Publish to B first, then to A
      service.publish(userB, makeEvent({ eventId: 'evt-b', type: 'label.created' }));
      service.publish(userA, makeEvent({ eventId: 'evt-a', type: 'thought.deleted' }));

      // Allow microtask queue to flush
      setTimeout(() => {
        subA.unsubscribe();
        expect(receivedByA).toHaveLength(1);
        expect(receivedByA[0].eventId).toBe('evt-a');
        done();
      }, 0);
    });
  });

  // ── B4: destroy completes the bus ─────────────────────────────

  describe('B4 — onModuleDestroy completes the bus', () => {
    it('stream completes after onModuleDestroy()', (done) => {
      const userId = 'user-destroy';
      let completed = false;

      service.streamForUser(userId).subscribe({
        complete: () => {
          completed = true;
          expect(completed).toBe(true);
          done();
        },
      });

      service.onModuleDestroy();
    });
  });
});
