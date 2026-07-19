// Destination: apps/web/src/components/NodeHeader.tsx  (connected — 1 prop)
import { useState } from 'react';
import { useThoughtNavigation } from '../contexts/ThoughtNavigationProvider';
import { useThoughtActions } from '../hooks/useThoughtActions';
import { useCurrentProject } from '../hooks/useCurrentProject';
import { useIsMobile } from '../hooks/useIsMobile';
import { useLabelEditor } from '../hooks/useLabelEditor';
import { useInlineEdit } from '../hooks/useInlineEdit';
import { Editable } from './Editable';
import { ColorPicker } from './ColorPicker';
import { LabelRow } from './LabelRow';
import { CloneIcon, ChevronUpIcon, HomeIcon } from './icons';
import { DEFAULT_NODE_COLOR } from '../lib/graphNode';

/** The active node's header. `onNew` is the only prop: the list owns the
 *  create-and-focus flow (it tracks which new card to open in edit mode), and
 *  the header's "+" is one of its triggers. */
export function NodeHeader({ onNew }: { onNew: () => void }) {
  const { activeNode, drilled, navigateUp, navigateToRoot, navigateToNode } = useThoughtNavigation();
  const { readOnly } = useCurrentProject();
  const { update, remove, setBorderColor, clone } = useThoughtActions();
  const createFab = useIsMobile();

  const { thoughtLabels, edgeRelationships, openPicker, openEdgePicker, pickerElement } =
    useLabelEditor(activeNode?.isRoot ? undefined : activeNode?.id, activeNode?.projectId);

  const title = useInlineEdit<HTMLInputElement>(
    activeNode?.title ?? '', (v) => activeNode && update(activeNode.id, { title: v }),
  );
  const body = useInlineEdit<HTMLTextAreaElement>(
    activeNode?.body ?? '', (v) => activeNode && update(activeNode.id, { body: v }), { multiline: true },
  );
  const [cloning, setCloning] = useState(false);

  const isProjectRoot = !!activeNode?.isRoot;
  const nodeBorderColor = activeNode?.color ?? DEFAULT_NODE_COLOR;

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
          {!readOnly && <ColorPicker value={nodeBorderColor} onChange={setBorderColor} />}
          {!isProjectRoot && drilled && (
            <div className="thoughts-list-nav-group">
              <button className="thoughts-list-nav" title="Up one level" onClick={navigateUp}><ChevronUpIcon /></button>
              <button className="thoughts-list-nav" title="Back to project root" onClick={navigateToRoot}><HomeIcon /></button>
            </div>
          )}
          {!isProjectRoot && !readOnly && activeNode && (
            <button className="thoughts-list-nav thoughts-list-delete" title="Delete this thought" onClick={() => remove(activeNode.id)}>×</button>
          )}
          {isProjectRoot && (
            <button
              className="thoughts-list-clone"
              disabled={cloning}
              title="Clone this graph into a project you own"
              onClick={async () => { setCloning(true); try { await clone(); } finally { setCloning(false); } }}
            >
              <CloneIcon /><span>{cloning ? 'Cloning…' : 'Clone'}</span>
            </button>
          )}
        </div>
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
              onNavigate={navigateToNode}
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
