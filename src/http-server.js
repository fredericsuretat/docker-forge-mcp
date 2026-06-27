#!/usr/bin/env node
// HTTP (Streamable) MCP endpoint — for marketplace hosting (MCPize / AgenticMarket / self-host).
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from './tools.js';
import { detectStackType, generateStack, STACK_CATALOG } from './stacks.js';
import { auditCompose } from './audit.js';
import { generateTraefikLabels, listMiddlewarePresets } from './traefik.js';
import { generateDockerfile, generateEnvTemplate } from './dockerfile-gen.js';

const PORT = Number(process.env.PORT || process.env.MCP_HTTP_PORT || 8788);
const AUTH = process.env.MCP_AUTH_TOKEN || '';
const transports = {};

function buildServer() {
  const server = new Server({ name: 'docker-forge', version: '0.1.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    let result;
    try {
      if (name === 'generate_stack') {
        const stackType = args.stack_type === 'auto' || !args.stack_type
          ? detectStackType(args.description || '')
          : args.stack_type;
        const compose = generateStack({
          stack_type: stackType,
          app_name: args.app_name || 'app',
          domain: args.domain,
          include_traefik: !!args.domain,
          traefik_network: args.traefik_network || 'proxy',
          node_version: args.node_version || '20',
          python_version: args.python_version || '3.12',
          db_name: args.db_name,
        });
        result = {
          stack_type: stackType,
          stack_name: STACK_CATALOG[stackType]?.name || stackType,
          compose_yaml: compose,
          notes: [
            'Copy the compose_yaml content to docker-compose.yml',
            'Create a .env file with the required variables listed at the bottom',
            'Run: docker compose up -d',
            ...(args.domain ? [`Ensure Traefik is running on the '${args.traefik_network || 'proxy'}' network`] : []),
          ],
        };
      } else if (name === 'audit_compose') {
        result = auditCompose(args.compose_yaml || '');
      } else if (name === 'add_traefik') {
        result = generateTraefikLabels({
          service_name: args.service_name,
          domain: args.domain,
          port: args.port,
          network: args.network || 'proxy',
          tls: args.tls !== false,
          certresolver: args.certresolver || 'letsencrypt',
          middlewares: args.middlewares || [],
          include_http_redirect: args.include_http_redirect !== false,
        });
      } else if (name === 'list_stacks') {
        result = {
          stacks: Object.entries(STACK_CATALOG).map(([key, val]) => ({ type: key, name: val.name, description: val.description, tags: val.tags })),
          middleware_presets: listMiddlewarePresets(),
          usage: 'Call generate_stack with stack_type or use "auto" with a description.',
        };
      } else if (name === 'generate_dockerfile') {
        const dockerfile = generateDockerfile({ runtime: args.runtime, app_type: args.app_type, version: args.version, port: args.port || 3000, package_manager: args.package_manager || 'npm' });
        result = { dockerfile, notes: ['Save as "Dockerfile" at the root of your project'] };
      } else if (name === 'generate_env') {
        result = generateEnvTemplate(args.compose_yaml || '');
      } else {
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  return server;
}

const httpServer = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: 'docker-forge-mcp', version: '0.1.0' }));
  }
  if (!req.url.startsWith('/mcp')) { res.writeHead(404); return res.end('Not found'); }
  if (AUTH && req.headers.authorization !== `Bearer ${AUTH}`) { res.writeHead(401); return res.end('Unauthorized'); }

  let body;
  if (req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined; }
    catch { res.writeHead(400); return res.end('Bad JSON'); }
  }

  const sid = req.headers['mcp-session-id'];
  let transport = sid && transports[sid];

  if (!transport && req.method === 'POST' && isInitializeRequest(body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => { transports[id] = transport; },
    });
    transport.onclose = () => { if (transport.sessionId) delete transports[transport.sessionId]; };
    await buildServer().connect(transport);
  } else if (!transport) {
    res.writeHead(400, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'No valid session; send initialize first.' }, id: null }));
  }

  try { await transport.handleRequest(req, res, body); }
  catch (e) { if (!res.headersSent) { res.writeHead(500); res.end('Internal error'); } }
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.error(`[docker-forge] HTTP MCP endpoint on :${PORT}/mcp${AUTH ? ' (auth on)' : ' (no auth)'}`);
  console.error(`[docker-forge] Health check: http://localhost:${PORT}/health`);
});
