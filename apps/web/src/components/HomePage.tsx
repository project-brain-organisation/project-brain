import { useState, useCallback, useMemo, useRef } from 'react';
import { useThoughts, type Thought } from '../hooks/useThoughts';
import { useProjects } from '../hooks/useProjects';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { NetworkView, type NetworkViewMode } from './NetworkView';
import { RelationshipsDialog } from './RelationshipsDialog';
import { ThoughtsList } from './ThoughtsList';
import './HomePage.css';

const DEFAULT_NODE_COLOR = '#e8a838';
const VIEW_MODE_KEY = 'pb-network-view-mode';

function loadViewMode(): NetworkViewMode {
  return localStorage.getItem(VIEW_MODE_KEY) === 'graph' ? 'graph' : 'mindmap';
}

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
    edgeLabels: [],
    parentRelationshipId: null,
  };
}

export function HomePage() {
  const { selectedRootId, setSelectedRootId } = useSelectedRoot();
  const { projects, loading: projectsLoading, createProject, renameProject, setProjectColor } = useProjects();
  const {
    thoughts, edgeRelationships, loading, createThought, updateThought, setThoughtColor,
    removeThought, createEdgeRelationship, removeEdgeRelationship,
  } = useThoughts(selectedRootId);
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState('');
  // focusedNodeId drills into a child node within the selected project
  const [focusedNodeId, setFocusedNodeId] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<NetworkViewMode>(loadViewMode);
  const [relDialogOpen, setRelDialogOpen] = useState(false);

  const handleViewModeChange = useCallback((mode: NetworkViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }, []);

  // Auto-select the first project on first load
  const hasAutoSelected = useRef(false);
  if (!hasAutoSelected.current && !projectsLoading && !selectedRootId && projects.length > 0) {
    hasAutoSelected.current = true;
    setSelectedRootId(projects[0].id);
  }

  const selectedProject = projects.find((p) => p.id === selectedRootId);
  const rootNode = selectedProject ? projectToRootNode(selectedProject) : undefined;

  const handleCreateProject = useCallback(async () => {
    const trimmed = projectName.trim();
    if (!trimmed) return;
    const project = await createProject(trimmed);
    setProjectName('');
    setCreating(false);
    setSelectedRootId(project.id);
  }, [projectName, createProject, setSelectedRootId]);

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

  const visibleThoughts = useMemo(() => {
    if (!selectedRootId) {
      return [];
    }
    if (focusedNodeId) {
      // Drilled into a specific node: show its direct children
      return thoughts.filter((t) => t.parentId === focusedNodeId);
    }
    // Project root view: show all thoughts in the project
    return thoughts;
  }, [thoughts, selectedRootId, focusedNodeId]);

  // Mind map shows the active node + visible thoughts. Top-level thoughts hang
  // off the project root, so substitute the project id for null parents.
  // Graph mode shows every thought in the project — no root pseudo-node, no
  // drill-down; NetworkView applies the one-hop filter around focusedNodeId.
  const networkThoughts = useMemo(() => {
    if (viewMode === 'graph') return thoughts;
    if (!activeNode) return [];
    const withParents = visibleThoughts.map((t) =>
      t.parentId ? t : { ...t, parentId: selectedRootId ?? null },
    );
    return [activeNode, ...withParents];
  }, [viewMode, thoughts, activeNode, visibleThoughts, selectedRootId]);

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

  return (
    <div className="home-page">
      <div className="home-page-thoughts">
        <ThoughtsList
          thoughts={visibleThoughts}
          activeNode={activeNode}
          nodeBorderColor={(activeNodeId && nodeColors[activeNodeId]) || DEFAULT_NODE_COLOR}
          onNodeBorderColorChange={handleColorChange}
          onCreateThought={handleCreateThought}
          onUpdateThought={handleUpdateThought}
          onDeleteThought={removeThought}
          onNavigateToNode={handleSelectNode}
        />
      </div>
      <div className="home-page-network">
        <NetworkView
          thoughts={networkThoughts}
          nodeColors={nodeColors}
          onSelectNode={handleSelectNode}
          onResetView={handleResetView}
          mode={viewMode}
          edgeRels={edgeRelationships}
          focusedNodeId={focusedNodeId}
        />
        <div className="network-controls">
          <div className="network-view-toggle">
            <button
              className={`network-toggle-btn ${viewMode === 'mindmap' ? 'network-toggle-btn--active' : ''}`}
              onClick={() => handleViewModeChange('mindmap')}
            >
              Mind map
            </button>
            <button
              className={`network-toggle-btn ${viewMode === 'graph' ? 'network-toggle-btn--active' : ''}`}
              onClick={() => handleViewModeChange('graph')}
            >
              Graph
            </button>
          </div>
          <button className="network-rel-btn" onClick={() => setRelDialogOpen(true)}>
            Relationships
          </button>
        </div>
      </div>
      {selectedRootId && (
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
