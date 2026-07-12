import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, filter, finalize, map } from 'rxjs';

export interface WorkspaceEvent {
  eventId: string;
  type: string;
  source: 'user' | 'mcp';
  resourceId: string;
  projectId?: string;
  timestamp: string;
}

export interface SseMessage {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

interface UserEvent {
  userId: string;
  event: WorkspaceEvent;
}

@Injectable()
export class WorkspaceEventsService implements OnModuleDestroy {
  private readonly bus = new Subject<UserEvent>();
  private readonly activeStreams = new Map<string, number>();

  publish(userId: string, event: WorkspaceEvent) {
    this.bus.next({ userId, event });
  }

  // Convenience over publish(): fills in the mechanical eventId/timestamp so
  // call sites only state what actually varies.
  emit(
    userId: string,
    type: string,
    event: { source: 'user' | 'mcp'; resourceId: string; projectId?: string },
  ) {
    this.publish(userId, {
      ...event,
      type,
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });
  }

  streamForUser(userId: string): Observable<SseMessage> {
    this.activeStreams.set(userId, (this.activeStreams.get(userId) ?? 0) + 1);

    const heartbeat$ = new Observable<SseMessage>((subscriber) => {
      const interval = setInterval(() => {
        subscriber.next({ data: { ts: new Date().toISOString() }, type: 'workspace.heartbeat' });
      }, 25_000);
      return () => clearInterval(interval);
    });

    const events$ = this.bus.pipe(
      filter((ue) => ue.userId === userId),
      map(
        (ue): SseMessage => ({
          data: ue.event,
          id: ue.event.eventId,
          type: 'workspace.event',
        }),
      ),
    );

    return new Observable<SseMessage>((subscriber) => {
      const subs = [events$.subscribe(subscriber), heartbeat$.subscribe(subscriber)];
      return () => subs.forEach((s) => s.unsubscribe());
    }).pipe(
      finalize(() => {
        const count = (this.activeStreams.get(userId) ?? 1) - 1;
        if (count <= 0) {
          this.activeStreams.delete(userId);
        } else {
          this.activeStreams.set(userId, count);
        }
      }),
    );
  }

  onModuleDestroy() {
    this.bus.complete();
  }
}
