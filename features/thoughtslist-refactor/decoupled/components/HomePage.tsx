// Destination: apps/web/src/components/HomePage.tsx  (skeleton — providers + layout only)
//
// This is a STRUCTURAL sketch, not a full rewrite: it shows how HomePage becomes
// providers + layout once the wiring lives in the domain layer. The parts marked
// "unchanged" (the mobile sheet drag mechanics, graph preload, project
// empty-state/create form) move over verbatim from the current HomePage — they're
// page chrome, not thought-list domain, so they're elided here for focus.
import { useState } from 'react';
import { useProjects } from '../hooks/useProjects';
import { useIsMobile } from '../hooks/useIsMobile';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { ConfirmProvider } from '../contexts/ConfirmProvider';
import { ThoughtNavigationProvider, useThoughtNavigation } from '../contexts/ThoughtNavigationProvider';
import { useCurrentProject } from '../hooks/useCurrentProject';
import { ThoughtsList } from './ThoughtsList';
import { NetworkView } from './NetworkView';
import { RelationshipsDialog } from './RelationshipsDialog';
import './HomePage.css';

export function HomePage() {
  const { selectedRootId } = useSelectedRoot();
  const { projects, loading } = useProjects();

  if (loading) return <div className="home-page-loading">Loading...</div>;
  // …unchanged: the no-project empty-state + create-project form…
  if (!selectedRootId || projects.length === 0) return <ProjectEmptyState />;

  // Providers wrap the whole surface so the list AND the graph read the same
  // navigation stack, confirm dialog, and project.
  return (
    <ConfirmProvider>
      <ThoughtNavigationProvider>
        <HomeSurface />
      </ThoughtNavigationProvider>
    </ConfirmProvider>
  );
}

/** Layout only. Reads derived graph data from the shared nav hook; passes the
 *  ThoughtsList a single layout flag. No mutation/navigation wiring. */
function HomeSurface() {
  const isMobile = useIsMobile();
  const { readOnly } = useCurrentProject();
  const { networkThoughts, nodeColors, graphFocusId, navigateToNode, navigateToRoot, loading } =
    useThoughtNavigation();
  const [relOpen, setRelOpen] = useState(false);

  if (loading) return <div className="home-page-loading">Loading...</div>;

  const graph = (
    <NetworkView
      thoughts={networkThoughts}
      nodeColors={nodeColors}
      onSelectNode={navigateToNode}
      onResetView={navigateToRoot}
      focusedNodeId={graphFocusId}
      // edgeRels + paused (mobile) come from a small useRelationships()/sheet hook
    />
  );

  if (isMobile) {
    return (
      <div className="home-page home-page--mobile">
        {/* …unchanged: graph top-sheet + drag handle wrapping `graph`… */}
        <div className="mobile-screen">
          <ThoughtsList createFab />
        </div>
        {/* …unchanged: history-flag RelationshipsDialog… */}
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="home-page-thoughts">
        {readOnly && <div className="home-page-readonly-chip">View only</div>}
        <ThoughtsList />
      </div>
      <div className="home-page-network">
        {graph}
        {!readOnly && (
          <div className="network-controls">
            <button className="network-rel-btn" onClick={() => setRelOpen(true)}>Relationships</button>
          </div>
        )}
      </div>
      {!readOnly && <RelationshipsDialog open={relOpen} onClose={() => setRelOpen(false)} /* …props… */ />}
    </div>
  );
}

// Placeholder for the unchanged empty-state/create-project form.
function ProjectEmptyState() {
  return <div className="home-page-empty">{/* …unchanged… */}</div>;
}
