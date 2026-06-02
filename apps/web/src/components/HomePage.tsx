import { useState, useCallback, useMemo, useRef } from 'react';
import { useThoughts } from '../hooks/useThoughts';
import { useNodeColors } from '../hooks/useNodeColors';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { NetworkView } from './NetworkView';
import { ThoughtsList } from './ThoughtsList';
import './HomePage.css';

export function HomePage() {
  const { selectedRootId, setSelectedRootId } = useSelectedRoot();
  const { roots, thoughts, loading, createThought, createRoot, updateThought, removeThought } = useThoughts(selectedRootId);
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState('');
  const { nodeColors, setColor } = useNodeColors();
  // focusedNodeId drills into a child node within the selected project
  const [focusedNodeId, setFocusedNodeId] = useState<string | undefined>(undefined);

  // Auto-select the most recently edited project on first load
  const hasAutoSelected = useRef(false);
  if (!hasAutoSelected.current && !loading && !selectedRootId && roots.length > 0) {
    hasAutoSelected.current = true;
    setSelectedRootId(roots[0].id);
  }

  const handleCreateProject = useCallback(async () => {
    const trimmed = projectName.trim();
    if (!trimmed) return;
    const project = await createRoot(trimmed);
    setProjectName('');
    setCreating(false);
    setSelectedRootId(project.id);
  }, [projectName, createRoot, setSelectedRootId]);

  // Background click resets to project root view (not deselecting the project)
  const handleResetView = useCallback(() => {
    setFocusedNodeId(undefined);
  }, []);

  // Node click drills into that node
  const handleSelectNode = useCallback((id: string) => {
    setFocusedNodeId(id);
  }, []);

  // The active node: focused child, or the project root
  const activeNodeId = focusedNodeId || selectedRootId;

  const handleCreateThought = useCallback(async (title: string, body: string) => {
    if (activeNodeId) {
      return await createThought(body, { title, parentId: activeNodeId });
    }
  }, [activeNodeId, createThought]);

  const handleUpdateThought = useCallback((id: string, title?: string, body?: string) => {
    const data: any = {};
    if (title !== undefined) data.title = title;
    if (body !== undefined) data.body = body;
    updateThought(id, data);
  }, [updateThought]);

  const activeNode = roots.find((r) => r.id === activeNodeId)
    || thoughts.find((t) => t.id === activeNodeId);

  const visibleThoughts = useMemo(() => {
    if (!selectedRootId) {
      return [];
    }
    if (focusedNodeId) {
      // Drilled into a specific node: show its direct children
      return thoughts.filter((t) => t.parentId === focusedNodeId);
    }
    // Project root view: show all thoughts in the project
    return thoughts.filter((t) => !t.isRoot);
  }, [thoughts, selectedRootId, focusedNodeId]);

  // Graph shows the active node + visible thoughts
  const networkThoughts = useMemo(() => {
    if (!activeNode) return [];
    return [activeNode, ...visibleThoughts];
  }, [activeNode, visibleThoughts]);

  // Clear focused node when project changes
  const handleProjectSelect = useCallback((id: string | undefined) => {
    setFocusedNodeId(undefined);
    setSelectedRootId(id);
  }, [setSelectedRootId]);

  if (loading) {
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
          nodeBorderColor={activeNodeId ? nodeColors[activeNodeId] ?? '#e8a838' : '#e8a838'}
          onNodeBorderColorChange={(color) => {
            if (activeNodeId) setColor(activeNodeId, color);
          }}
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
        />
      </div>
    </div>
  );
}
