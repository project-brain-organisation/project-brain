// Destination: apps/web/src/components/NodeHeader.tsx
import { useState } from 'react';
import type { Thought } from '../hooks/useThoughts';
import { useLabelEditor } from '../hooks/useLabelEditor';
import { useInlineEdit } from '../hooks/useInlineEdit';
import { Editable } from './Editable';
import { ColorPicker } from './ColorPicker';
import { LabelRow } from './LabelRow';
import { CloneIcon, ChevronUpIcon, HomeIcon } from './icons';

interface Props {
  activeNode?: Thought;
  isProjectRoot: boolean;
  readOnly?: boolean;
  createFab?: boolean;
  nodeBorderColor: string;
  onNodeBorderColorChange: (color: string) => void;
  onUpdateThought: (id: string, title?: string, body?: string) => void;
  onDeleteThought: (id: string) => void;
  onNavigateToNode?: (id: string) => void;
  onNavigateUp?: () => void;
  onNavigateToRoot?: () => void;
  onClone?: () => Promise<void>;
  onNew: () => void;
}

/** The active node's header: its title, body, colour, navigation/actions and
 *  labels. Lifted out of ThoughtsList so that file is just the card list. */
export function NodeHeader({
  activeNode, isProjectRoot, readOnly, createFab, nodeBorderColor, onNodeBorderColorChange,
  onUpdateThought, onDeleteThought, onNavigateToNode, onNavigateUp, onNavigateToRoot, onClone, onNew,
}: Props) {
  const { thoughtLabels, edgeRelationships, openPicker, openEdgePicker, pickerElement } =
    useLabelEditor(isProjectRoot ? undefined : activeNode?.id, activeNode?.projectId);

  const title = useInlineEdit<HTMLInputElement>(
    activeNode?.title ?? '', (v) => activeNode && onUpdateThought(activeNode.id, v, undefined),
  );
  const body = useInlineEdit<HTMLTextAreaElement>(
    activeNode?.body ?? '', (v) => activeNode && onUpdateThought(activeNode.id, undefined, v),
    { multiline: true },
  );
  const [cloning, setCloning] = useState(false);

  return (
    <div className="thoughts-list-header">
      <div className="thoughts-list-header-text">
        <div className="thoughts-list-title-row">
          <Editable
            edit={title}
            value={activeNode?.title ?? ''}
            as="h2"
            readOnly={readOnly}
            emptyText="Untitled"
            placeholder="Untitled"
            className={readOnly ? 'thoughts-list-title' : 'thoughts-list-title-editable'}
            editClassName="thoughts-list-title-input"
          />
          {!readOnly && <ColorPicker value={nodeBorderColor} onChange={onNodeBorderColorChange} />}
          {!isProjectRoot && onNavigateUp && onNavigateToRoot && (
            <div className="thoughts-list-nav-group">
              <button className="thoughts-list-nav" title="Up one level" onClick={onNavigateUp}><ChevronUpIcon /></button>
              <button className="thoughts-list-nav" title="Back to project root" onClick={onNavigateToRoot}><HomeIcon /></button>
            </div>
          )}
          {/* The project root is deleted from the sidebar, not here. */}
          {!isProjectRoot && !readOnly && activeNode && (
            <button className="thoughts-list-nav thoughts-list-delete" title="Delete this thought" onClick={() => onDeleteThought(activeNode.id)}>×</button>
          )}
          {isProjectRoot && onClone && (
            <button
              className="thoughts-list-clone"
              disabled={cloning}
              title="Clone this graph into a project you own"
              onClick={async () => { setCloning(true); try { await onClone(); } finally { setCloning(false); } }}
            >
              <CloneIcon /><span>{cloning ? 'Cloning…' : 'Clone'}</span>
            </button>
          )}
        </div>
        {/* The project root has no persistable body in the v2 model. */}
        {!isProjectRoot && (
          <Editable
            edit={body}
            value={activeNode?.body ?? ''}
            as="p"
            multiline
            readOnly={readOnly}
            placeholder="Click to add a description..."
            className={readOnly ? 'thoughts-list-header-body' : 'thoughts-list-header-body thoughts-list-body-editable'}
            editClassName="thoughts-list-body-input"
          />
        )}
        {activeNode && !isProjectRoot && (
          <div className="thoughts-list-header-labels">
            <LabelRow
              thoughtLabels={thoughtLabels}
              edgeRelationships={edgeRelationships}
              readOnly={readOnly}
              onNavigate={onNavigateToNode}
              onEditLabel={openPicker}
              onEditEdge={openEdgePicker}
              onAdd={() => openPicker()}
            />
          </div>
        )}
      </div>
      {!createFab && !readOnly && (
        <button className="thoughts-list-new" onClick={onNew} title="New thought">+</button>
      )}
      {pickerElement}
    </div>
  );
}
