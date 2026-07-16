import { useState, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useThoughts, type Thought } from '../hooks/useThoughts';
import { useProjects } from '../hooks/useProjects';
import { useIsMobile } from '../hooks/useIsMobile';
import { useHistoryFlag } from '../hooks/useHistoryFlag';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { NetworkView } from './NetworkView';
import { RelationshipsDialog } from './RelationshipsDialog';
import { ThoughtsList } from './ThoughtsList';
import { ThoughtSheet, type SheetState } from './ThoughtSheet';
import { Fab } from './Fab';
import './HomePage.css';

const DEFAULT_NODE_COLOR = '#e8a838';

/** Present the selected project as a root pseudo-thought so the list/graph
 *  components can treat it like any other node. */
function projectToRootNode(project: { id: string; name: string; color: string | null }): Thought {
  return {
    id: project.id,
    projectId: project.id,
    parentId: null,
    isRoot: true,
    title: project.name,
    body: '',
    color: project.color,
    contentHash: null,
    canvasX: null,
    canvasY: null,
    width: null,
    height: null,
    createdAt: '',
    updatedAt: '',
    parentRelationshipId: null,
  };
}

export function HomePage() {
  const { selectedRootId, setSelectedRootId } = useSelectedRoot();
  const { projects, loading: projectsLoading, createProject, cloneProject, renameProject, setProjectColor } = useProjects();
  const {
    thoughts, edgeRelationships, loading, createThought, updateThought, setThoughtColor,
    removeThought, createEdgeRelationship, removeEdgeRelationship,
  } = useThoughts(selectedRootId);
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState('');
  // focusedNodeId drills into a child node within the selected project
  const [focusedNodeId, setFocusedNodeId] = useState<string | undefined>(undefined);
  const [relDialogOpen, setRelDialogOpen] = useState(false);

  // Mobile: single-screen layout driven by the route; the node preview sheet
  // and relationships dialog live in history state so back closes them.
  const isMobile = useIsMobile();
  const location = useLocation();
  const [sheetNodeId, openSheet, closeSheet] = useHistoryFlag<string>('node');
  const [relOpen, openRel, closeRel] = useHistoryFlag('rel');
  const [sheetExpanded, setSheetExpanded] = useState(false);

  // Mobile Thoughts screen drill-down. Stored as a history stack so the OS/browser
  // back gesture pops one level (drill up); the focused node is the tail. Kept
  // separate from the graph screen's node sheet — the two never interact.
  const [drillPath, pushDrill, popDrill] = useHistoryFlag<string[]>('drill');
  const drillId = drillPath?.[drillPath.length - 1];

  const drillInto = useCallback((id: string) => {
    if (!id || id === selectedRootId) return;
    const path = drillPath ?? [];
    if (path[path.length - 1] === id) return;
    pushDrill([...path, id], { push: true });
  }, [drillPath, selectedRootId, pushDrill]);

  const drillUp = useCallback(() => {
    if (drillPath?.length) popDrill(1);
  }, [drillPath, popDrill]);

  const drillToRoot = useCallback(() => {
    if (drillPath?.length) popDrill(drillPath.length);
  }, [drillPath, popDrill]);

  // Auto-select the first project on first load
  const hasAutoSelected = useRef(false);
  if (!hasAutoSelected.current && !projectsLoading && !selectedRootId && projects.length > 0) {
    hasAutoSelected.current = true;
    setSelectedRootId(projects[0].id);
  }

  const selectedProject = projects.find((p) => p.id === selectedRootId);
  const rootNode = selectedProject ? projectToRootNode(selectedProject) : undefined;
  // Subscribed public graphs are read-only: the viewer can browse but not mutate.
  const readOnly = selectedProject?.role === 'subscriber';

  const handleCreateProject = useCallback(async () => {
    const trimmed = projectName.trim();
    if (!trimmed) return;
    const project = await createProject(trimmed);
    setProjectName('');
    setCreating(false);
    setSelectedRootId(project.id);
  }, [projectName, createProject, setSelectedRootId]);

  const handleCloneProject = useCallback(async () => {
    if (!selectedRootId) return;
    const project = await cloneProject(selectedRootId);
    setSelectedRootId(project.id);
    setFocusedNodeId(undefined);
  }, [selectedRootId, cloneProject, setSelectedRootId]);

  // Background click resets to project root view (not deselecting the project)
  const handleResetView = useCallback(() => {
    setFocusedNodeId(undefined);
  }, []);

  // Node click drills into that node
  const handleSelectNode = useCallback((id: string) => {
    if (id === selectedRootId) {
      setFocusedNodeId(undefined);
      return;
    }
    setFocusedNodeId(id);
  }, [selectedRootId]);

  // Up one level: parent of the focused node; a null parent means the parent IS
  // the project root, so clear the focus. Graph filtering follows for free —
  // both the list and NetworkView re-derive from focusedNodeId.
  const handleNavigateUp = useCallback(() => {
    if (!focusedNodeId) return;
    const focused = thoughts.find((t) => t.id === focusedNodeId);
    setFocusedNodeId(focused?.parentId ?? undefined);
  }, [focusedNodeId, thoughts]);

  // The active node: focused child, or the project root
  const activeNodeId = focusedNodeId || selectedRootId;

  const handleCreateThought = useCallback(async (title: string, body: string) => {
    if (activeNodeId) {
      return await createThought(body, { title, parentId: activeNodeId });
    }
  }, [activeNodeId, createThought]);

  const handleUpdateThought = useCallback((id: string, title?: string, body?: string) => {
    if (id === selectedRootId) {
      // The root pseudo-node is the project itself: title = project name,
      // and it has no body to persist.
      if (title !== undefined) renameProject(id, title);
      return;
    }
    const data: { title?: string; body?: string } = {};
    if (title !== undefined) data.title = title;
    if (body !== undefined) data.body = body;
    updateThought(id, data);
  }, [selectedRootId, renameProject, updateThought]);

  // Node colors come off the thought rows; the root's off the project itself
  const nodeColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of thoughts) {
      if (t.color) map[t.id] = t.color;
    }
    if (selectedProject?.color) map[selectedProject.id] = selectedProject.color;
    return map;
  }, [thoughts, selectedProject]);

  const handleColorChange = useCallback((color: string) => {
    if (!activeNodeId) return;
    if (activeNodeId === selectedRootId) {
      // The root pseudo-node is the project itself
      setProjectColor(activeNodeId, color);
    } else {
      setThoughtColor(activeNodeId, color);
    }
  }, [activeNodeId, selectedRootId, setProjectColor, setThoughtColor]);

  const activeNode = activeNodeId === selectedRootId
    ? rootNode
    : thoughts.find((t) => t.id === activeNodeId);

  // A focused node's neighbourhood: direct children plus relationship
  // neighbours. Shared by the thought list and the graph so they always show
  // the same set.
  const nodesAround = useCallback((id: string) => {
    const around = thoughts.filter((t) => t.parentId === id);
    const present = new Set(around.map((t) => t.id));
    present.add(id);
    for (const rel of edgeRelationships) {
      const otherId =
        rel.sourceId === id ? rel.targetId :
        rel.targetId === id ? rel.sourceId : null;
      if (!otherId || present.has(otherId)) continue;
      const other = thoughts.find((t) => t.id === otherId);
      if (!other) continue;
      around.push(other);
      present.add(otherId);
    }
    return around;
  }, [thoughts, edgeRelationships]);

  const visibleThoughts = useMemo(() => {
    if (!selectedRootId) {
      return [];
    }
    if (focusedNodeId) {
      return nodesAround(focusedNodeId);
    }
    // Project root view: show all thoughts in the project
    return thoughts;
  }, [thoughts, selectedRootId, focusedNodeId, nodesAround]);

  // Mind map shows the active node + visible thoughts. Top-level thoughts hang
  // off the project root, so substitute the project id for null parents.
  // (When drilled in, the root isn't in the graph, so a relationship
  // neighbour's substituted parent link simply dangles and the node hangs off
  // its relationship edge instead.)
  const networkThoughts = useMemo(() => {
    if (!activeNode) return [];
    const withParents = visibleThoughts.map((t) =>
      t.parentId ? t : { ...t, parentId: selectedRootId ?? null },
    );
    return [activeNode, ...withParents];
  }, [activeNode, visibleThoughts, selectedRootId]);

  if (loading || projectsLoading) {
    return <div className="home-page-loading">Loading...</div>;
  }

  if (!selectedRootId) {
    return (
      <div className="home-page-empty">
        {creating ? (
          <div className="home-page-create-form">
            <input
              className="home-page-create-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setProjectName('');
                }
              }}
              placeholder="Project name"
              autoFocus
            />
          </div>
        ) : (
          <button className="home-page-create" onClick={() => setCreating(true)}>
            <span className="home-page-create-icon">+</span>
            <span>Create project</span>
          </button>
        )}
      </div>
    );
  }

  if (isMobile) {
    const isGraphScreen = location.pathname === '/graph';
    const sheetThought = sheetNodeId ? thoughts.find((t) => t.id === sheetNodeId) : undefined;
    const sheetState: SheetState = sheetThought ? (sheetExpanded ? 'expanded' : 'peek') : 'closed';

    // Everything the focused subgraph shows besides the node itself: parent
    // (when it's a real thought, not the project root), children, and
    // relationship neighbours.
    const sheetParent = sheetThought
      ? thoughts.find((t) => t.id === sheetThought.parentId)
      : undefined;
    const sheetNeighbours = sheetThought
      ? [
          ...(sheetParent ? [sheetParent] : []),
          ...nodesAround(sheetThought.id).filter((t) => t.id !== sheetParent?.id),
        ]
      : [];

    const handleSheetState = (s: SheetState) => {
      if (s === 'closed') closeSheet();
      setSheetExpanded(s === 'expanded');
    };

    // Thoughts screen focus: the drilled-into node (tail of the path) or the root.
    const drillNode = drillId ? thoughts.find((t) => t.id === drillId) ?? rootNode : rootNode;
    const drillTargetId = (drillNode && !drillNode.isRoot ? drillNode.id : selectedRootId) ?? undefined;
    const drillVisible = drillNode && !drillNode.isRoot
      ? thoughts.filter((t) => t.parentId === drillNode.id)
      : thoughts;
    const drilled = !!drillPath?.length && !!drillNode && !drillNode.isRoot;

    return (
      <div className="home-page home-page--mobile">
        {isGraphScreen ? (
          <div className="mobile-screen mobile-screen--graph" key="graph">
            <div className="mobile-graph-area">
              <NetworkView
                thoughts={networkThoughts}
                nodeColors={nodeColors}
                onSelectNode={(id) => {
                  if (id === selectedRootId) return; // project root has no preview
                  setSheetExpanded(false);
                  openSheet(id);
                }}
                onResetView={() => handleSheetState('closed')}
                edgeRels={edgeRelationships}
                focusedNodeId={sheetNodeId}
              />
            </div>
            <ThoughtSheet
              thought={sheetThought}
              state={sheetState}
              onStateChange={handleSheetState}
              neighbours={sheetNeighbours}
              onSelectNeighbour={(id) => {
                setSheetExpanded(false);
                openSheet(id);
              }}
              onUpdate={(id, data) => updateThought(id, data)}
              onDelete={(id) => {
                removeThought(id);
                handleSheetState('closed');
              }}
              readOnly={readOnly}
              fab={
                readOnly ? undefined : (
                  <Fab
                    ariaLabel="Add relationship"
                    onClick={() => openRel()}
                    icon={
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    }
                  />
                )
              }
            />
          </div>
        ) : (
          <div className="mobile-screen" key="thoughts">
            <ThoughtsList
              thoughts={drillVisible}
              activeNode={drillNode}
              nodeBorderColor={(drillTargetId && nodeColors[drillTargetId]) || DEFAULT_NODE_COLOR}
              onNodeBorderColorChange={(color) => {
                if (!drillTargetId) return;
                if (drillTargetId === selectedRootId) setProjectColor(drillTargetId, color);
                else setThoughtColor(drillTargetId, color);
              }}
              onCreateThought={(title, body) =>
                createThought(body, { title, parentId: drillTargetId })
              }
              onUpdateThought={handleUpdateThought}
              onDeleteThought={removeThought}
              onNavigateToNode={drillInto}
              onNavigateUp={drilled ? drillUp : undefined}
              onNavigateToRoot={drilled ? drillToRoot : undefined}
              createFab
              readOnly={readOnly}
            />
          </div>
        )}
        <RelationshipsDialog
          open={!!relOpen}
          onClose={() => closeRel()}
          projectId={selectedRootId}
          thoughts={thoughts}
          edgeRels={edgeRelationships}
          onAdd={createEdgeRelationship}
          onRemove={removeEdgeRelationship}
        />
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="home-page-thoughts">
        {readOnly && (
          <div className="home-page-readonly-chip">View only</div>
        )}
        <ThoughtsList
          thoughts={visibleThoughts}
          activeNode={activeNode}
          nodeBorderColor={(activeNodeId && nodeColors[activeNodeId]) || DEFAULT_NODE_COLOR}
          onNodeBorderColorChange={handleColorChange}
          onCreateThought={handleCreateThought}
          onUpdateThought={handleUpdateThought}
          onDeleteThought={removeThought}
          onNavigateToNode={handleSelectNode}
          onNavigateUp={focusedNodeId ? handleNavigateUp : undefined}
          onNavigateToRoot={focusedNodeId ? handleResetView : undefined}
          onClone={handleCloneProject}
          readOnly={readOnly}
        />
      </div>
      <div className="home-page-network">
        <NetworkView
          thoughts={networkThoughts}
          nodeColors={nodeColors}
          onSelectNode={handleSelectNode}
          onResetView={handleResetView}
          edgeRels={edgeRelationships}
          focusedNodeId={focusedNodeId}
        />
        {!readOnly && (
          <div className="network-controls">
            <button className="network-rel-btn" onClick={() => setRelDialogOpen(true)}>
              Relationships
            </button>
          </div>
        )}
      </div>
      {selectedRootId && !readOnly && (
        <RelationshipsDialog
          open={relDialogOpen}
          onClose={() => setRelDialogOpen(false)}
          projectId={selectedRootId}
          thoughts={thoughts}
          edgeRels={edgeRelationships}
          onAdd={createEdgeRelationship}
          onRemove={removeEdgeRelationship}
        />
      )}
    </div>
  );
}
