import { useThoughts } from '../hooks/useThoughts';
import { useHistoryFlag } from '../hooks/useHistoryFlag';
import { useOverlay } from '../hooks/useOverlay';
import { useCurrentProject } from '../hooks/useCurrentProject';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { useThoughtNavigation } from '../contexts/ThoughtNavigationProvider';
import { NetworkView } from './NetworkView';
import { RelationshipsDialog } from './RelationshipsDialog';
import { ThoughtsList } from './ThoughtsList';

/**
 * Mobile layout: one screen with a slide-down graph top sheet (drag/snap/
 * preload logic in useOverlay). The sheet and the relationships dialog live
 * in history state so the back gesture closes them.
 */
export function MobileHome() {
  const { selectedRootId } = useSelectedRoot();
  const { readOnly } = useCurrentProject();
  const nav = useThoughtNavigation();
  const { edgeRelationships, createEdgeRelationship, removeEdgeRelationship } = useThoughts(selectedRootId);
  const [relOpen, openRel, closeRel] = useHistoryFlag('rel');
  const sheet = useOverlay();

  return (
    <div className="home-page home-page--mobile">
      <div
        ref={sheet.sheetRef}
        className={`mobile-graph-sheet${sheet.graphOpen ? ' mobile-graph-sheet--open' : ''}${sheet.dragging ? ' mobile-graph-sheet--dragging' : ''}`}
      >
        {sheet.mountGraph && (
          <div className="mobile-graph-sheet-inner">
            <NetworkView
              thoughts={nav.networkThoughts}
              nodeColors={nav.nodeColors}
              onSelectNode={nav.navigateToNode}
              onResetView={nav.navigateToRoot}
              edgeRels={edgeRelationships}
              focusedNodeId={nav.graphFocusId}
              paused={!sheet.graphOpen || sheet.dragging}
            />
            {!readOnly && (
              <div className="network-controls">
                <button className="network-rel-btn" onClick={() => openRel()}>
                  Relationships
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <button
        className="mobile-graph-handle"
        {...sheet.handleProps}
        aria-expanded={sheet.graphOpen}
        aria-label={sheet.graphOpen ? 'Close graph' : 'Open graph'}
      >
        <span className="mobile-graph-handle-grip" />
      </button>
      <div className="mobile-screen">
        <ThoughtsList createFab />
      </div>
      {selectedRootId && (
        <RelationshipsDialog
          open={!!relOpen}
          onClose={() => closeRel()}
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
