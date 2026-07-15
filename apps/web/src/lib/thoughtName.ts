/** Display name for a thought: its title, else a body snippet, else a fallback.
 *  Structural param so it works for both the API row and the client Thought shape. */
export function thoughtName(thought: { title?: string | null; body?: string | null } | undefined): string {
  if (!thought) return 'Unknown';
  if (thought.title) return thought.title;
  const snippet = (thought.body ?? '').trim().slice(0, 40);
  return snippet || 'Untitled';
}
