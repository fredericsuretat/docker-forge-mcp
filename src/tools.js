// MCP tool definitions for docker-forge-mcp

export const TOOLS = [
  {
    name: 'generate_stack',
    description:
      'Generate a production-ready Docker Compose stack from a natural language description or stack type. ' +
      'Includes security best practices: resource limits, healthchecks, restart policies, non-root users, named volumes. ' +
      'Optionally adds Traefik v3 labels for reverse proxy + HTTPS.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Natural language description of what you want to build, e.g. "Node.js API with PostgreSQL and Redis cache"',
        },
        stack_type: {
          type: 'string',
          enum: ['auto', 'node-postgres-redis', 'node-postgres', 'node-redis', 'python-postgres-redis-celery', 'python-postgres', 'wordpress', 'nextjs-postgres', 'monitoring', 'nginx'],
          description: 'Explicit stack type. Use "auto" to detect from description.',
          default: 'auto',
        },
        app_name: {
          type: 'string',
          description: 'Name for the main application service (used as container name prefix)',
        },
        domain: {
          type: 'string',
          description: 'Public domain for Traefik routing, e.g. "myapp.example.com". If provided, Traefik labels are added.',
        },
        traefik_network: {
          type: 'string',
          description: 'External Docker network for Traefik (default: "proxy")',
          default: 'proxy',
        },
        node_version: {
          type: 'string',
          description: 'Node.js version to use in image tags (default: "20")',
          default: '20',
        },
        python_version: {
          type: 'string',
          description: 'Python version to use in image tags (default: "3.12")',
          default: '3.12',
        },
        db_name: {
          type: 'string',
          description: 'Database name to use (defaults to app_name)',
        },
      },
      required: [],
    },
  },

  {
    name: 'audit_compose',
    description:
      'Audit a Docker Compose YAML string for security vulnerabilities and best-practice violations. ' +
      'Checks: privileged mode, root user, docker socket mounts, plaintext secrets, exposed database ports, ' +
      'missing restart policies, missing resource limits, unpinned image tags, missing healthchecks, ' +
      'and depends_on readiness issues. Returns a score (0-100) and categorized issues (critical/warning/info).',
    inputSchema: {
      type: 'object',
      properties: {
        compose_yaml: {
          type: 'string',
          description: 'The full content of your docker-compose.yml file to audit',
        },
      },
      required: ['compose_yaml'],
    },
  },

  {
    name: 'add_traefik',
    description:
      'Generate Traefik v3 labels for a Docker service. ' +
      'Produces ready-to-paste labels for docker-compose.yml and a networks section. ' +
      'Supports TLS (Let\'s Encrypt), HTTP→HTTPS redirect, and optional middleware presets: ' +
      'rate-limit, security-headers, auth-basic, compress.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'Name of the Docker service (used as router/service name in Traefik)',
        },
        domain: {
          type: 'string',
          description: 'Public domain, e.g. "myapp.example.com"',
        },
        port: {
          type: 'number',
          description: 'Internal port the service listens on (e.g. 3000, 8000, 80)',
        },
        network: {
          type: 'string',
          description: 'External Traefik network name (default: "proxy")',
          default: 'proxy',
        },
        tls: {
          type: 'boolean',
          description: 'Enable TLS with certresolver (default: true)',
          default: true,
        },
        certresolver: {
          type: 'string',
          description: 'Traefik certresolver name (default: "letsencrypt")',
          default: 'letsencrypt',
        },
        middlewares: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['rate-limit', 'security-headers', 'auth-basic', 'compress', 'redirect-https'],
          },
          description: 'Optional middleware presets to enable',
        },
        include_http_redirect: {
          type: 'boolean',
          description: 'Add HTTP→HTTPS redirect router (default: true)',
          default: true,
        },
      },
      required: ['service_name', 'domain', 'port'],
    },
  },

  {
    name: 'list_stacks',
    description: 'List all available Docker Compose stack templates with descriptions and tags.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  {
    name: 'generate_dockerfile',
    description:
      '[PRO] Generate an optimized, security-hardened multi-stage Dockerfile. ' +
      'Supports Node.js (including Next.js standalone), Python (FastAPI/Django), and Go. ' +
      'Features: multi-stage builds, non-root user, minimal final image, HEALTHCHECK.',
    inputSchema: {
      type: 'object',
      properties: {
        runtime: {
          type: 'string',
          enum: ['node', 'python', 'go'],
          description: 'Runtime/language for the Dockerfile',
        },
        app_type: {
          type: 'string',
          description: 'App type hint: "nextjs" for Next.js standalone, "express" for generic Node, etc.',
        },
        version: {
          type: 'string',
          description: 'Runtime version (e.g. "20" for Node.js, "3.12" for Python, "1.22" for Go)',
        },
        port: {
          type: 'number',
          description: 'Port the app listens on (default: 3000)',
          default: 3000,
        },
        package_manager: {
          type: 'string',
          enum: ['npm', 'pnpm', 'yarn'],
          description: 'Package manager for Node.js projects (default: npm)',
          default: 'npm',
        },
      },
      required: ['runtime'],
    },
  },

  {
    name: 'generate_env',
    description:
      '[PRO] Extract all environment variable placeholders (${VAR}) from a Docker Compose YAML ' +
      'and generate a .env template file with categorized comments (database, auth/secrets, app). ' +
      'Includes generation hints for secrets.',
    inputSchema: {
      type: 'object',
      properties: {
        compose_yaml: {
          type: 'string',
          description: 'The docker-compose.yml content to extract variables from',
        },
      },
      required: ['compose_yaml'],
    },
  },
];
