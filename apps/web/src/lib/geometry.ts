export interface EdgePlacement {
  id: string;
  name: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

export function computeEdgeLabels(
  currentIdea: { id: string; parentId: string | null },
  allIdeas: { id: string; parentId: string | null; name: string }[],
): EdgePlacement[] {
  const placements: EdgePlacement[] = [];

  if (currentIdea.parentId) {
    const parent = allIdeas.find((i) => i.id === currentIdea.parentId);
    if (parent) placements.push({ id: parent.id, name: parent.name, position: 'top' });
  }

  const children = allIdeas.filter((i) => i.parentId === currentIdea.id);
  for (const child of children) {
    placements.push({ id: child.id, name: child.name, position: 'bottom' });
  }

  return placements;
}
