# Docker Forge MCP

> Generate, audit, and tune Docker Compose stacks inside Claude Code — before you copy-paste anything.

Most DevOps work in AI assistants means prompting for a compose file, getting something almost-right, then spending 30 minutes fixing healthchecks, resource limits, and Traefik labels by hand. Docker Forge does all that **before** the compose file lands in your project.

Pure logic, no API keys, **$0 to run**.

## 4 tools

| Tool | What it does | Tier |
|---|---|---|
| `generate_stack` | Generate a production-ready Docker Compose from a description | Free |
| `audit_compose` | Audit your compose for security & best-practice issues (scored 0-100) | Free |
| `add_traefik` | Generate Traefik v3 labels with middlewares | Free |
| `list_stacks` | List all available stack templates | Free |
| `generate_dockerfile` | Multi-stage, hardened Dockerfile for Node/Python/Go | Pro |
| `generate_env` | Extract all `${VARS}` from a compose and generate .env template | Pro |

## Quick start

```bash
npx -y docker-forge-mcp
```

Or add to your Claude Code MCP config:
```json
{
  "mcpServers": {
    "docker-forge": {
      "command": "npx",
      "args": ["-y", "docker-forge-mcp"]
    }
  }
}
```

## Usage examples

**Generate a stack:**
> "Generate a Docker Compose for a Node.js API with PostgreSQL and Redis, domain api.myapp.com"

**Audit an existing compose:**
> "Audit this docker-compose.yml for security issues" → paste your file

**Add Traefik:**
> "Add Traefik v3 labels for my 'backend' service on port 3000 at api.example.com with rate limiting"

## Supported stacks

| Stack type | Services |
|---|---|
| `node-postgres-redis` | Node.js + PostgreSQL + Redis |
| `node-postgres` | Node.js + PostgreSQL |
| `node-redis` | Node.js + Redis |
| `python-postgres-redis-celery` | FastAPI + PostgreSQL + Redis + Celery |
| `python-postgres` | FastAPI/Django + PostgreSQL |
| `wordpress` | WordPress + MySQL |
| `nextjs-postgres` | Next.js standalone + PostgreSQL |
| `monitoring` | Prometheus + Grafana + node-exporter |
| `nginx` | Nginx static server |

## What's in every generated stack

- `restart: unless-stopped` on all services
- `deploy.resources.limits` (CPU + memory) on every container
- `healthcheck` on every service
- `depends_on` with `condition: service_healthy`
- Named volumes (not anonymous)
- PostgreSQL pinned to `16-alpine`, Redis to `7-alpine`
- Optional Traefik v3 labels + HTTP→HTTPS redirect

## Audit checks

**Critical** (score -20 each): privileged mode, root user, docker socket mounted, plaintext secrets in env, database ports exposed to internet

**Warning** (score -5 each): missing restart policy, no resource limits, `:latest` image tag, no healthcheck, bare `depends_on` without service_healthy

**Info** (score -1): no network isolation, simple depends_on

## Traefik middleware presets

`rate-limit`, `security-headers` (HSTS + XSS + nosniff), `auth-basic`, `compress`, `redirect-https`

## License

MIT — [frederic.suretat.com/lab](https://frederic.suretat.com/lab)
