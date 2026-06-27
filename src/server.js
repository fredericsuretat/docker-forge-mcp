#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from './tools.js';
import { detectStackType, generateStack, STACK_CATALOG } from './stacks.js';
import { auditCompose } from './audit.js';
import { generateTraefikLabels, listMiddlewarePresets } from './traefik.js';
import { generateDockerfile, generateEnvTemplate } from './dockerfile-gen.js';

const PRO_TOOLS = new Set(['generate_dockerfile', 'generate_env']);

const server = new Server(
  { name: 'docker-forge', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

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
        stacks: Object.entries(STACK_CATALOG).map(([key, val]) => ({
          type: key,
          name: val.name,
          description: val.description,
          tags: val.tags,
        })),
        middleware_presets: listMiddlewarePresets(),
        usage: 'Call generate_stack with stack_type set to one of the types above, or use stack_type: "auto" with a description.',
      };

    } else if (name === 'generate_dockerfile') {
      const dockerfile = generateDockerfile({
        runtime: args.runtime,
        app_type: args.app_type,
        version: args.version,
        port: args.port || 3000,
        package_manager: args.package_manager || 'npm',
      });
      result = {
        dockerfile,
        notes: [
          'Save as "Dockerfile" at the root of your project',
          'Build with: docker build -t myapp .',
          'For Next.js: ensure "output: \'standalone\'" is set in next.config.js',
        ],
      };

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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[docker-forge] MCP server running on stdio');
