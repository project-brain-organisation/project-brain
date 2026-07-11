import express, { type Request, type Response } from 'express';
import { ApiClient } from './api-client.js';
import {
  authErrorMessage,
  getMcpAccessToken,
  getMcpServerKey,
  verifyMcpAccessToken,
} from './auth.js';
import { createToolRegistry } from './tools/index.js';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  ToolCallParams,
} from './types.js';

const port = Number(process.env.PORT ?? 3100);
const serverSecret = process.env.MCP_SERVER_SECRET;
const internalApiUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:3000';
const internalApiKey = process.env.MCP_INTERNAL_KEY;
const protocolVersion = '2025-03-26';
const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS ?? 'https://claude.ai,https://www.claude.ai,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

if (!serverSecret) {
  throw new Error('Missing MCP_SERVER_SECRET');
}

if (!internalApiKey) {
  throw new Error('Missing MCP_INTERNAL_KEY');
}

const apiClient = new ApiClient(internalApiUrl, internalApiKey);
const { tools, toolByName } = createToolRegistry(apiClient);
const app = express();

// Behind Railway's reverse proxy: honor X-Forwarded-Proto so selfBase() is https.
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

function selfBase(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

function unauthorized(res: Response, message: string) {
  res.status(401).json({ error: message });
}

// RFC 9728: every 401 must carry a challenge pointing at the protected-resource
// metadata, otherwise OAuth discovery (claude.ai connectors) cannot proceed.
function unauthorizedWithChallenge(req: Request, res: Response, message: string) {
  const realm = process.env.MCP_AUTH_REALM ?? 'mcp';
  const resource =
    process.env.MCP_RESOURCE_METADATA_URL ??
    `${selfBase(req)}/.well-known/oauth-protected-resource/mcp`;
  res.setHeader(
    'WWW-Authenticate',
    `Bearer realm="${realm}", resource_metadata="${resource}", error="invalid_token", error_description="${message}"`,
  );
  unauthorized(res, message);
}

// A request is authorized when it carries either the shared server key
// (internal callers) or a per-user OAuth bearer token (MCP clients — claude.ai
// cannot send custom headers, so the bearer path must suffice on its own).
async function authorize(req: Request): Promise<{
  ok: boolean;
  claims: Awaited<ReturnType<typeof verifyMcpAccessToken>>;
}> {
  const hasServerKey = getMcpServerKey(req) === serverSecret;
  const userToken = getMcpAccessToken(req);
  const claims = userToken ? await verifyMcpAccessToken(userToken) : null;
  return { ok: hasServerKey || claims !== null, claims };
}

function jsonRpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  };
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

// RFC 9728 protected-resource metadata, served on this origin (clients derive
// the metadata URL from the MCP server URL). The authorization server is the
// API, which hosts /.well-known/oauth-authorization-server and the OAuth routes.
app.get(
  ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'],
  (req: Request, res: Response) => {
    const authorizationServer = process.env.MCP_PUBLIC_API_URL ?? internalApiUrl;
    res.json({
      resource: process.env.MCP_PUBLIC_RESOURCE_URL ?? `${selfBase(req)}/mcp`,
      authorization_servers: [authorizationServer],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp:tools'],
    });
  },
);

app.use('/mcp', (req, res, next) => {
  const origin = req.header('origin');
  if (!origin) {
    next();
    return;
  }

  if (!allowedOrigins.includes(origin)) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  next();
});

app.use('/mcp', (req, res, next) => {
  const clientProtocol = req.header('mcp-protocol-version');
  if (clientProtocol && clientProtocol !== protocolVersion) {
    res
      .status(400)
      .json({ error: `Unsupported MCP protocol version: ${clientProtocol}` });
    return;
  }

  res.setHeader('MCP-Protocol-Version', protocolVersion);
  next();
});

app.get('/mcp', async (req, res) => {
  const auth = await authorize(req);
  if (!auth.ok) {
    unauthorizedWithChallenge(req, res, authErrorMessage(req));
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(': connected\n\n');

  const interval = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

app.post('/mcp', async (req: Request, res: Response) => {
  const auth = await authorize(req);
  if (!auth.ok) {
    unauthorizedWithChallenge(req, res, authErrorMessage(req));
    return;
  }

  const message = req.body as JsonRpcRequest;
  const id = message.id ?? null;

  if (message.jsonrpc !== '2.0' || !message.method) {
    res.status(400).json(jsonRpcError(id, -32600, 'Invalid Request'));
    return;
  }

  if (message.method === 'initialize') {
    res.json(
      jsonRpcResult(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: {
          name: 'project-brain-sidecar',
          version: '0.1.0',
        },
      }),
    );
    return;
  }

  if (message.method === 'notifications/initialized') {
    res.status(204).send();
    return;
  }

  if (message.method === 'ping') {
    res.json(jsonRpcResult(id, {}));
    return;
  }

  if (message.method === 'tools/list') {
    res.json(jsonRpcResult(id, { tools }));
    return;
  }

  if (message.method === 'tools/call') {
    // Tool calls always need a per-user identity — the server key is not enough.
    const claims = auth.claims;
    if (!claims) {
      unauthorizedWithChallenge(req, res, authErrorMessage(req));
      return;
    }

    const userId = claims.sub;
    const scope = typeof claims.scope === 'string' ? claims.scope : undefined;

    const params = (message.params ?? {}) as ToolCallParams;

    if (!params.name) {
      res.json(jsonRpcError(id, -32602, 'Missing tool name'));
      return;
    }

    const tool = toolByName.get(params.name);
    if (!tool) {
      res.json(jsonRpcError(id, -32601, `Unknown tool: ${params.name}`));
      return;
    }

    let result;
    try {
      const args = tool.parseArguments(params.arguments ?? {});
      result = await tool.execute({ userId, scope }, args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`tools/call ${params.name} threw: ${message}`);
      res.json(jsonRpcError(id, -32603, `${params.name} failed: ${message}`));
      return;
    }

    if (!result.ok) {
      const detail = result.error.slice(0, 300);
      console.error(`tools/call ${params.name} upstream ${result.status}: ${detail}`);
      res.json(jsonRpcError(id, -32001, `${tool.name} failed (${result.status}): ${detail}`));
      return;
    }

    res.json(
      jsonRpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      }),
    );
    return;
  }

  res.json(jsonRpcError(id, -32601, `Method not found: ${message.method}`));
});

app.listen(port, () => {
  console.log(`MCP sidecar running on http://localhost:${port}`);
  console.log(`Internal API: ${internalApiUrl}`);
});
