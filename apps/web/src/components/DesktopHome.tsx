import { useState } from 'react';
import { useThoughts } from '../hooks/useThoughts';
import { useCurrentProject } from '../hooks/useCurrentProject';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { useThoughtNavigation } from '../contexts/ThoughtNavigationProvider';
import { NetworkView } from './NetworkView';
import { RelationshipsDialog } from './RelationshipsDialog';
import { ThoughtsList } from './ThoughtsList';

/** Desktop layout: thought list and graph side by side. */
export function DesktopHome() {
  const { selectedRootId } = useSelectedRoot();
  const { readOnly } = useCurrentProject();
  const nav = useThoughtNavigation();
  const { edgeRelationships, createEdgeRelationship, removeEdgeRelationship } = useThoughts(selectedRootId);
  const [relOpen, setRelOpen] = useState(false);

  return (
    <div className="home-page">
      <div className="home-page-thoughts">
        {readOnly && <div className="home-page-readonly-chip">View only</div>}
        <ThoughtsList />
      </div>
      <div className="home-page-network">
        <NetworkView
          thoughts={nav.networkThoughts}
          nodeColors={nav.nodeColors}
          onSelectNode={nav.navigateToNode}
          onResetView={nav.navigateToRoot}
          edgeRels={edgeRelationships}
          focusedNodeId={nav.graphFocusId}
        />
        {!readOnly && (
          <div className="network-controls">
            <button className="network-rel-btn" onClick={() => setRelOpen(true)}>
              Relationships
            </button>
          </div>
        )}
      </div>
      {selectedRootId && !readOnly && (
        <RelationshipsDialog
          open={relOpen}
          onClose={() => setRelOpen(false)}
          projectId={selectedRootId}
          thoughts={nav.allThoughts}
          edgeRels={edgeRelationships}
          onAdd={createEdgeRelationship}
          onRemove={removeEdgeRelationship}
        />
      )}
    </div>
  );
}
