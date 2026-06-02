import { useEffect, useRef } from 'react';
import { notifyThoughtsChanged } from '../lib/thoughtsEvents';

const API_URL = import.meta.env.VITE_API_URL || '';

export function useMcpToolEvents() {
  const retryGate = useRef(0);

  useEffect(() => {
    const url = `${API_URL}/api/mcp/events`;
    let es: EventSource | null = null;

    function connect() {
      es = new EventSource(url, { withCredentials: true });

      es.addEventListener('mcp.tool.used', (e: MessageEvent) => {
        const data = JSON.parse(e.data) as {
          category: string;
          toolName: string;
          operation: string;
        };

        if (data.category === 'thoughts' || data.category === 'colors') {
          notifyThoughtsChanged();
        }

        if (data.category === 'labels') {
          window.dispatchEvent(new Event('labels-changed'));
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
      es?.close();
      es = null;
    };
  }, []);
}
