import { useState } from 'react';
import { Modal } from './Modal';
import './McpDialog.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

const MCP_URL =
  import.meta.env.VITE_MCP_URL ??
  'https://mcp-production-2ecd.up.railway.app/mcp';

export function McpDialog({ open, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(MCP_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="MCP Server"
      description="Connect any MCP-compatible client to Project Brain. Your notes
        become searchable tools the client can use during conversations."
    >
      <div className="mcp-steps">
        <div className="mcp-step">
          <span className="mcp-step-num">1</span>
          <span>Open your MCP client's settings and add a new remote server</span>
        </div>
        <div className="mcp-step">
          <span className="mcp-step-num">2</span>
          <span>Paste the server URL below</span>
        </div>
        <div className="mcp-step">
          <span className="mcp-step-num">3</span>
          <span>Sign in with Google when prompted to authorize access</span>
        </div>
      </div>

      <div className="mcp-url-row">
        <code className="mcp-url">{MCP_URL}</code>
        <button className="mcp-copy-btn" onClick={handleCopy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      <p className="mcp-hint">
        Exposes your full workspace as tools: <code>remember</code> searches
        your notes by meaning, <code>elaborate</code> expands a result into
        its full thought, and further tools let the client browse, create,
        edit, label and organize projects and thoughts.
      </p>
    </Modal>
  );
}
