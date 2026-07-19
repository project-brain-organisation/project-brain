import type { ThoughtLabel, ThoughtEdge } from '../hooks/useLabels';

interface Props {
  thoughtLabels: ThoughtLabel[];
  edgeRelationships: ThoughtEdge[];
  readOnly?: boolean;
  onNavigate?: (id: string) => void;
  onEditLabel: (labelId: string) => void;
  onEditEdge: (edgeRelId: string) => void;
  onAdd: () => void;
}

/**
 * The row of label chips + edge chips + "add" button, identical between the
 * ThoughtsList header and every ThoughtCard. Renders a fragment so each caller
 * supplies its own wrapper element (and, on the card, the trailing timestamp) —
 * keeping the existing CSS untouched.
 */
export function LabelRow({
  thoughtLabels, edgeRelationships, readOnly, onNavigate, onEditLabel, onEditEdge, onAdd,
}: Props) {
  return (
    <>
      {thoughtLabels.map((tl) => (
        <button
          key={tl.id}
          className="thought-card-label"
          style={{ borderColor: tl.color, color: tl.color }}
          onClick={() => !readOnly && onEditLabel(tl.id)}
        >
          <span className="thought-card-label-dot" style={{ background: tl.color }} />
          {tl.name}
        </button>
      ))}
      {edgeRelationships.map((er) => (
        <span key={er.id} className="thought-card-edge">
          <button
            className="thought-card-label thought-card-label--edge"
            style={er.label ? { borderColor: er.label.color, color: er.label.color } : undefined}
            onClick={() => !readOnly && onEditEdge(er.id)}
          >
            {er.label && <span className="thought-card-label-dot" style={{ background: er.label.color }} />}
            {er.label?.name ?? 'edge'}
          </button>
          <button
            className="thought-card-edge-target"
            onClick={() => onNavigate?.(er.targetId)}
            disabled={!onNavigate}
            title={`Go to ${er.targetName}`}
          >
            → {er.targetName}
          </button>
        </span>
      ))}
      {!readOnly && <button className="thought-card-label-add" onClick={onAdd}>+</button>}
    </>
  );
}
