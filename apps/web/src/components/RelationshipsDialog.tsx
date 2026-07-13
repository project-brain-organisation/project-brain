import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { relationshipsApi } from '../lib/pbApi';
import { notifyThoughtsChanged } from '../lib/thoughtsEvents';
import { useLabels } from '../hooks/useLabels';
import type { Thought, EdgeRelationship } from '../hooks/useThoughts';
// Shared overlay/dialog chrome (.mcp-overlay, .mcp-dialog, header classes)
import './McpDialog.css';
import './RelationshipsDialog.css';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  thoughts: Thought[];
  edgeRels: EdgeRelationship[];
}

function thoughtName(thought: Thought | undefined): string {
  if (!thought) return 'Unknown';
  if (thought.title) return thought.title;
  const snippet = thought.body.trim().slice(0, 40);
  return snippet || 'Untitled';
}

/** The API throws Error(responseBody); pull Nest's message out if it's JSON. */
function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    // not JSON — fall through
  }
  return raw || 'Something went wrong';
}

export function RelationshipsDialog({ open, onClose, projectId, thoughts, edgeRels }: Props) {
  const { labels, loading: labelsLoading } = useLabels(open ? projectId : undefined);
  const [sourceId, setSourceId] = useState('');
  const [labelId, setLabelId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const edgeLabels = useMemo(() => labels.filter((l) => l.isEdge), [labels]);

  const thoughtById = useMemo(() => new Map(thoughts.map((t) => [t.id, t])), [thoughts]);

  const sortedThoughts = useMemo(
    () => [...thoughts].sort((a, b) => thoughtName(a).localeCompare(thoughtName(b))),
    [thoughts],
  );

  if (!open) return null;

  // The DB has a unique index on (source, target, label) for edges; block the
  // attempt up front rather than surfacing its 409 after the fact.
  const isDuplicate = Boolean(
    sourceId && labelId && targetId &&
    edgeRels.some(
      (r) => r.sourceId === sourceId && r.targetId === targetId && r.label?.id === labelId,
    ),
  );

  const canAdd = !busy && sourceId && labelId && targetId && sourceId !== targetId && !isDuplicate;

  async function handleAdd() {
    if (!canAdd) return;
    setBusy(true);
    setError(null);
    try {
      await relationshipsApi.create({ projectId, sourceId, targetId, kind: 'edge', labelId });
      setSourceId('');
      setLabelId('');
      setTargetId('');
      notifyThoughtsChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(relId: string) {
    setError(null);
    try {
      await relationshipsApi.remove(relId);
      notifyThoughtsChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return createPortal(
    <div className="mcp-overlay" onClick={onClose}>
      <div className="mcp-dialog rd-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="mcp-dialog-header">
          <h2 className="mcp-dialog-title">Relationships</h2>
          <button className="mcp-dialog-close" onClick={onClose}>&times;</button>
        </div>
        <p className="mcp-dialog-subtitle">
          Define directional relationships between thoughts in this project.
          Each relationship links a source thought to a target thought through
          an edge label, and appears as an arrow in the graph view.
        </p>

        {/* ── Existing relationships ── */}
        <div className="rd-list">
          {edgeRels.length === 0 && (
            <p className="rd-empty">No relationships yet. Create one below.</p>
          )}
          {edgeRels.map((rel) => (
            <div key={rel.id} className="rd-row">
              <span className="rd-cell rd-cell--node" title={thoughtName(thoughtById.get(rel.sourceId))}>
                {thoughtName(thoughtById.get(rel.sourceId))}
              </span>
              <span className="rd-cell rd-cell--label">
                <span
                  className="rd-label-chip"
                  style={rel.label ? { borderColor: rel.label.color, color: rel.label.color } : undefined}
                >
                  {rel.label && <span className="rd-label-dot" style={{ background: rel.label.color }} />}
                  {rel.label?.name ?? 'unlabelled'}
                </span>
                <span className="rd-arrow">→</span>
              </span>
              <span className="rd-cell rd-cell--node" title={thoughtName(thoughtById.get(rel.targetId))}>
                {thoughtName(thoughtById.get(rel.targetId))}
              </span>
              <button
                className="rd-remove"
                onClick={() => handleDelete(rel.id)}
                title="Delete relationship"
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        {/* ── Add relationship ── */}
        {labelsLoading ? null : edgeLabels.length === 0 ? (
          <p className="rd-hint">
            No edge labels in this project yet. Mark a label as an edge label
            in the label picker (the triangle toggle) to use it here.
          </p>
        ) : (
          <div className="rd-add">
            <select
              className="rd-select"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">Source…</option>
              {sortedThoughts.map((t) => (
                <option key={t.id} value={t.id} disabled={t.id === targetId}>
                  {thoughtName(t)}
                </option>
              ))}
            </select>
            <select
              className="rd-select rd-select--label"
              value={labelId}
              onChange={(e) => setLabelId(e.target.value)}
            >
              <option value="">Label…</option>
              {edgeLabels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <select
              className="rd-select"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">Target…</option>
              {sortedThoughts.map((t) => (
                <option key={t.id} value={t.id} disabled={t.id === sourceId}>
                  {thoughtName(t)}
                </option>
              ))}
            </select>
            <button className="rd-add-btn" onClick={handleAdd} disabled={!canAdd}>
              Add
            </button>
          </div>
        )}

        {isDuplicate && <p className="rd-hint rd-hint--duplicate">This relationship already exists.</p>}
        {error && <p className="rd-error">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
