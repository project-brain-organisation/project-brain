import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';

const API_URL = import.meta.env.VITE_API_URL || '';

interface WorkspaceEvent {
  eventId: string;
  type: string;
  source: 'user' | 'mcp';
  resourceId: string;
  projectId?: string;
  timestamp: string;
}

/**
 * Subscribes to the workspace SSE stream and invalidates the affected query
 * when something changes OUTSIDE this tab (MCP tools, other sessions).
 * Events with source 'user' are ignored — mutations here already patch the
 * cache optimistically.
 */
export function useWorkspaceEvents() {
  const queryClient = useQueryClient();
  const retryGate = useRef(0);

  useEffect(() => {
    const url = `${API_URL}/api/workspace/events`;
    let es: EventSource | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      es = new EventSource(url, { withCredentials: true });

      es.addEventListener('workspace.event', (e: MessageEvent) => {
        const event = JSON.parse(e.data) as WorkspaceEvent;
        if (event.source !== 'mcp') return;

        if (event.type.startsWith('project')) {
          queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        } else {
          queryClient.invalidateQueries({
            queryKey: event.projectId ? queryKeys.workspace(event.projectId) : ['workspace'],
          });
        }
      });

      es.onopen = () => {
        retryGate.current = 0;
      };

      es.onerror = () => {
        es?.close();
        es = null;

        const delay = Math.min(1000 * 2 ** retryGate.current, 30_000);
        retryGate.current++;
        setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      cancelled = true;
      es?.close();
      es = null;
    };
  }, [queryClient]);
}
