import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Subject, Observable, filter, map, finalize } from 'rxjs';

export interface McpToolEvent {
  eventId: string;
  toolName: string;
  category: 'thoughts' | 'labels' | 'colors' | 'read';
  operation: 'create' | 'update' | 'delete' | 'read';
  timestamp: string;
  resourceIds?: Record<string, string>;
}

export interface SseMessage {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

interface UserEvent {
  userId: string;
  event: McpToolEvent;
}

@Injectable()
export class McpEventsService implements OnModuleDestroy {
  private readonly bus = new Subject<UserEvent>();
  private readonly activeStreams = new Map<string, number>();

  publishToolEvent(userId: string, event: McpToolEvent) {
    this.bus.next({ userId, event });
  }

  streamForUser(userId: string): Observable<SseMessage> {
    const streamKey = userId;
    this.activeStreams.set(streamKey, (this.activeStreams.get(streamKey) ?? 0) + 1);

    const heartbeat$ = new Observable<SseMessage>((subscriber) => {
      const interval = setInterval(() => {
        subscriber.next({
          data: { ts: new Date().toISOString() },
          type: 'mcp.heartbeat',
        });
      }, 25_000);

      return () => clearInterval(interval);
    });

    const events$ = this.bus.pipe(
      filter((ue) => ue.userId === userId),
      map(
        (ue): SseMessage => ({
          data: ue.event,
          id: ue.event.eventId,
          type: 'mcp.tool.used',
        }),
      ),
    );

    return new Observable<SseMessage>((subscriber) => {
      const subs = [
        events$.subscribe(subscriber),
        heartbeat$.subscribe(subscriber),
      ];

      return () => subs.forEach((s) => s.unsubscribe());
    }).pipe(
      finalize(() => {
        const count = (this.activeStreams.get(streamKey) ?? 1) - 1;
        if (count <= 0) {
          this.activeStreams.delete(streamKey);
        } else {
          this.activeStreams.set(streamKey, count);
        }
      }),
    );
  }

  onModuleDestroy() {
    this.bus.complete();
  }
}
