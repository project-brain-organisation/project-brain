// Environment configuration for the MCP sidecar, validated at startup.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3100),
  serverSecret: required('MCP_SERVER_SECRET'),
  internalApiUrl: process.env.INTERNAL_API_URL ?? 'http://localhost:3000',
  internalApiKey: required('MCP_INTERNAL_KEY'),
  protocolVersion: '2025-03-26',
  allowedOrigins: (
    process.env.MCP_ALLOWED_ORIGINS ??
    'https://claude.ai,https://www.claude.ai,http://localhost:5173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
};
