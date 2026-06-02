// End-to-end OAuth + PKCE smoke test for the MCP sidecar.
// 1. Load JWT_SECRET from apps/api/.env
// 2. Pick first user from DB and mint a session JWT (pb_token)
// 3. Run authorize (PKCE S256) -> capture code
// 4. Exchange code at /api/auth/mcp/token -> access_token
// 5. Call MCP sidecar tools/call list_projects with bearer access_token

import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

const API = process.env.API_URL ?? 'http://localhost:3000';
const MCP = process.env.MCP_URL ?? 'http://localhost:3100/mcp';
const MCP_SERVER_SECRET = process.env.MCP_SERVER_SECRET ?? 'dev-mcp-secret';
const CLIENT_ID = 'pb-e2e-test';
const REDIRECT_URI = 'http://localhost:9999/cb';

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

async function main() {
  if (!process.env.JWT_SECRET) throw new Error('Missing JWT_SECRET');
  if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL');

  const sql = neon(process.env.DATABASE_URL);
  const users = await sql`select id, username from users order by created_at asc limit 1`;
  if (users.length === 0) throw new Error('No users in DB. Sign in via Google first.');
  const user = users[0];
  console.log('[1] user:', user.id, user.username);

  const pbToken = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '5m' });
  console.log('[2] minted pb_token (session JWT)');

  // PKCE
  const codeVerifier = b64url(randomBytes(32));
  const codeChallenge = b64url(createHash('sha256').update(codeVerifier).digest());

  // Authorize
  const authorizeUrl = new URL(`${API}/api/auth/mcp/authorize`);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeUrl.searchParams.set('state', 'state-' + randomBytes(4).toString('hex'));
  authorizeUrl.searchParams.set('scope', 'mcp:tools');
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  const authRes = await fetch(authorizeUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: { Authorization: `Bearer ${pbToken}` },
  });

  if (authRes.status !== 302 && authRes.status !== 301) {
    const text = await authRes.text();
    throw new Error(`authorize expected 302, got ${authRes.status}: ${text}`);
  }

  const location = authRes.headers.get('location');
  if (!location) throw new Error('authorize: no Location header');
  const cbUrl = new URL(location);
  const code = cbUrl.searchParams.get('code');
  if (!code) throw new Error(`authorize: no code in redirect (${location})`);
  console.log('[3] authorize -> code:', code.slice(0, 12) + '…');

  // Token exchange
  const tokenRes = await fetch(`${API}/api/auth/mcp/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(`token exchange failed: ${tokenRes.status} ${JSON.stringify(tokenJson)}`);
  }
  console.log('[4] token exchange ok. expires_in:', tokenJson.expires_in, 'scope:', tokenJson.scope);

  // tools/call list_projects via MCP sidecar
  const mcpRes = await fetch(MCP, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mcp-key': MCP_SERVER_SECRET,
      Authorization: `Bearer ${tokenJson.access_token}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'list_projects', arguments: {} },
    }),
  });
  const mcpJson = await mcpRes.json();
  console.log('[5] MCP list_projects status:', mcpRes.status);
  console.log(JSON.stringify(mcpJson, null, 2));
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
