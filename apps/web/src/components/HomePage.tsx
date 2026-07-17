import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useThoughts, type Thought } from '../hooks/useThoughts';
import { useProjects } from '../hooks/useProjects';
import { useIsMobile } from '../hooks/useIsMobile';
import { useHistoryFlag } from '../hooks/useHistoryFlag';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { NetworkView } from './NetworkView';
import { RelationshipsDialog } from './RelationshipsDialog';
import { ThoughtsList } from './ThoughtsList';
import { ConfirmDialog } from './ConfirmDialog';
import { thoughtName } from '../lib/thoughtName';
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
    setParent, removeThought, createEdgeRelationship, removeEdgeRelationship,
  } = useThoughts(selectedRootId);
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // focusedNodeId drills into a child node within the selected project
  const [focusedNodeId, setFocusedNodeId] = useState<string | undefined>(undefined);
  const [relDialogOpen, setRelDialogOpen] = useState(false);

  // Mobile: single screen with a slide-down graph top sheet. The sheet and
  // the relationships dialog live in history state so back closes them.
  const isMobile = useIsMobile();
  const [graphOpen, openGraph, closeGraph] = useHistoryFlag('graph');
  const [relOpen, openRel, closeRel] = useHistoryFlag('rel');

  // The sheet's drag handle: pointer-drag resizes the sheet directly (inline
  // flex-basis, transition off), release snaps open/closed; a no-move release
  // is a tap and toggles. State only marks "dragging" — height stays in the
  // DOM so moves never re-render React.
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetDrag = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
  const [sheetDragging, setSheetDragging] = useState(false);
  const graphEverOpened = useRef(false);
  const sheetMax = () => window.innerHeight * 0.46;

  const handleSheetDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    sheetDrag.current = {
      startY: e.clientY,
      startH: sheetRef.current?.getBoundingClientRect().height ?? 0,
      moved: false,
    };
    setSheetDragging(true); // unpauses the graph so the reveal isn't blank
  }, []);

  const handleSheetMove = useCallback((e: React.PointerEvent) => {
    const drag = sheetDrag.current;
    const sheet = sheetRef.current;
    if (!drag || !sheet) return;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dy) > 6) drag.moved = true;
    sheet.style.flexBasis = `${Math.min(Math.max(drag.startH + dy, 0), sheetMax())}px`;
  }, []);

  const handleSheetUp = useCallback(() => {
    const drag = sheetDrag.current;
    const sheet = sheetRef.current;
    sheetDrag.current = null;
    setSheetDragging(false);
    if (!drag || !sheet) return;
    if (!drag.moved) {
      if (graphOpen) closeGraph();
      else openGraph();
      return;
    }
    const shouldOpen = sheet.getBoundingClientRect().height > sheetMax() / 2;
    if (shouldOpen && !graphOpen) openGraph();
    else if (!shouldOpen && graphOpen) closeGraph();
  }, [graphOpen, openGraph, closeGraph]);

  // After a drag settles (same batch as the open/close flag flip), hand the
  // height back to CSS on the next frame so the transition animates from the
  // dragged position to the snapped state.
  useEffect(() => {
    if (sheetDragging || !sheetRef.current) return;
    const sheet = sheetRef.current;
    const raf = requestAnimationFrame(() => { sheet.style.flexBasis = ''; });
    return () => cancelAnimationFrame(raf);
  }, [sheetDragging, graphOpen]);

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

  // Switching project invalidates every bit of navigation state that pointed
  // into the old project's graph — otherwise the new project renders filtered
  // by a node it doesn't contain, i.e. empty.
  const prevRootId = useRef(selectedRootId);
  useEffect(() => {
    if (prevRootId.current === selectedRootId) return;
    prevRootId.current = selectedRootId;
    setFocusedNodeId(undefined);
    if (drillPath?.length) popDrill(drillPath.length);
  }, [selectedRootId, drillPath, popDrill]);

  // Self-heal a dangling focus (e.g. the focused thought was deleted by an
  // MCP client): once the snapshot has loaded without it, fall back to the
  // root view instead of rendering nothing.
  useEffect(() => {
    if (loading || !focusedNodeId) return;
    if (!thoughts.some((t) => t.id === focusedNodeId)) setFocusedNodeId(undefined);
  }, [loading, focusedNodeId, thoughts]);

  // On first load, keep the restored selection if it still exists;
  // otherwise fall back to the first project.
  const hasAutoSelected = useRef(false);
  if (!hasAutoSelected.current && !projectsLoading && projects.length > 0) {
    hasAutoSelected.current = true;
    if (!projects.some((p) => p.id === selectedRootId)) {
      setSelectedRootId(projects[0].id);
    }
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

  // Node click focuses it — the root included, whose focused view is its
  // direct children (the top-level thoughts). Background click clears focus
  // back to the whole graph.
  const handleSelectNode = useCallback((id: string) => {
    setFocusedNodeId(id);
  }, []);

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

  // Every delete X funnels through this confirm. Children of a deleted node
  // aren't deleted — they lose their hierarchy edge and float to the top
  // level, so the dialog says that rather than threatening deletion.
  const requestDelete = useCallback((id: string) => setPendingDeleteId(id), []);

  const confirmDelete = useCallback(() => {
    const id = pendingDeleteId;
    if (!id) return;
    setPendingDeleteId(null);
    const target = thoughts.find((t) => t.id === id);
    removeThought(id);
    // Don't leave any view pointing at the dead id.
    if (id === focusedNodeId) setFocusedNodeId(target?.parentId ?? undefined);
    if (id === drillId) popDrill(1);
  }, [pendingDeleteId, thoughts, removeThought, focusedNodeId, drillId, popDrill]);

  const pendingDelete = pendingDeleteId ? thoughts.find((t) => t.id === pendingDeleteId) : undefined;
  const pendingChildCount = pendingDeleteId
    ? thoughts.filter((t) => t.parentId === pendingDeleteId).length
    : 0;
  const confirmDialog = pendingDelete ? (
    <ConfirmDialog
      message={`Delete "${thoughtName(pendingDelete)}"?`}
      detail={
        pendingChildCount > 0
          ? `${pendingChildCount} subthought${pendingChildCount === 1 ? '' : 's'} will move to the top level.`
          : undefined
      }
      onConfirm={confirmDelete}
      onCancel={() => setPendingDeleteId(null)}
    />
  ) : null;

  // A focused node's neighbourhood: direct children plus relationship
  // neighbours. Shared by the thought list and the graph so they always show
  // the same set.
  const nodesAround = useCallback((id: string) => {
    // The root's children are the top-level thoughts (parentId null).
    if (id === selectedRootId) return thoughts.filter((t) => !t.parentId);
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
  }, [thoughts, edgeRelationships, selectedRootId]);

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
    // Focus: the drilled-into node (tail of the history path) or the root.
    // The graph top sheet and the list share it, so tapping a node in the
    // graph filters both — the same neighbourhood rule as desktop focus.
    const drillNode = drillId ? thoughts.find((t) => t.id === drillId) ?? rootNode : rootNode;
    const drilled = !!drillPath?.length && !!drillNode && !drillNode.isRoot;
    const drillTargetId = (drilled && drillNode ? drillNode.id : selectedRootId) ?? undefined;
    const drillVisible = drilled && drillNode ? nodesAround(drillNode.id) : thoughts;

    // Same shape as the desktop networkThoughts: the focused node first,
    // top-level thoughts hanging off the substituted project root.
    const graphThoughts = drillNode
      ? [
          drillNode,
          ...drillVisible
            .filter((t) => t.id !== drillNode.id)
            .map((t) => (t.parentId ? t : { ...t, parentId: selectedRootId ?? null })),
        ]
      : [];

    // Latch-mount the graph on first interaction, then keep it mounted and
    // merely paused when the sheet is shut. Reopening is then instant — the
    // WebGL context and computed layout survive — instead of paying a fresh
    // init (the ~1s sluggish open). Rendering resumes while dragging so the
    // reveal is never a blank pane.
    if (graphOpen || sheetDragging) graphEverOpened.current = true;
    const mountGraph = graphOpen || sheetDragging || graphEverOpened.current;

    return (
      <div className="home-page home-page--mobile">
        <div
          ref={sheetRef}
          className={`mobile-graph-sheet${graphOpen ? ' mobile-graph-sheet--open' : ''}${sheetDragging ? ' mobile-graph-sheet--dragging' : ''}`}
        >
          {mountGraph && (
            <div className="mobile-graph-sheet-inner">
              <NetworkView
                thoughts={graphThoughts}
                nodeColors={nodeColors}
                onSelectNode={(id) => (id === selectedRootId ? drillToRoot() : drillInto(id))}
                onResetView={drillToRoot}
                edgeRels={edgeRelationships}
                focusedNodeId={drilled ? drillId : undefined}
                paused={!graphOpen && !sheetDragging}
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
          onPointerDown={handleSheetDown}
          onPointerMove={handleSheetMove}
          onPointerUp={handleSheetUp}
          onPointerCancel={handleSheetUp}
          aria-expanded={!!graphOpen}
          aria-label={graphOpen ? 'Close graph' : 'Open graph'}
        >
          <span className="mobile-graph-handle-grip" />
        </button>
        <div className="mobile-screen">
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
            onDeleteThought={requestDelete}
            onNavigateToNode={drillInto}
            onNavigateUp={drilled ? drillUp : undefined}
            onNavigateToRoot={drilled ? drillToRoot : undefined}
            createFab
            readOnly={readOnly}
            allThoughts={thoughts}
            onReparent={setParent}
          />
        </div>
        <RelationshipsDialog
          open={!!relOpen}
          onClose={() => closeRel()}
          projectId={selectedRootId}
          thoughts={thoughts}
          edgeRels={edgeRelationships}
          onAdd={createEdgeRelationship}
          onRemove={removeEdgeRelationship}
        />
        {confirmDialog}
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
          onDeleteThought={requestDelete}
          onNavigateToNode={handleSelectNode}
          onNavigateUp={focusedNodeId ? handleNavigateUp : undefined}
          onNavigateToRoot={focusedNodeId ? handleResetView : undefined}
          onClone={handleCloneProject}
          readOnly={readOnly}
          allThoughts={thoughts}
          onReparent={setParent}
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
      {confirmDialog}
    </div>
  );
}
