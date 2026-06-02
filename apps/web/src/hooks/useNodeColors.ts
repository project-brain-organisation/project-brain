import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface ThoughtColor {
  thoughtId: string;
  hex: string;
}

export function useNodeColors() {
  const [nodeColors, setNodeColors] = useState<Record<string, string>>({});

  const fetchColors = useCallback(async () => {
    const rows = await api.get<ThoughtColor[]>('/api/colors');
    const map: Record<string, string> = {};
    for (const r of rows) map[r.thoughtId] = r.hex;
    setNodeColors(map);
  }, []);

  useEffect(() => {
    fetchColors();
  }, [fetchColors]);

  const setColor = useCallback(async (thoughtId: string, hex: string) => {
    setNodeColors((prev) => ({ ...prev, [thoughtId]: hex }));
    await api.put('/api/colors/thought/' + thoughtId, { hex });
  }, []);

  return { nodeColors, setColor };
}
