# Promotion content — Docker Forge MCP

> Ready-to-post for r/selfhosted, r/devops, r/LocalLLaMA, Hacker News, dev.to, X

---

## 1. r/selfhosted + r/devops (audience = self-hosters, homelab DevOps)

**Title:** I built a free MCP that generates production-ready Docker Compose stacks (with Traefik labels, healthchecks, resource limits) inside Claude Code

**Body:**
Every time I spun up a new service for my homelab, I'd ask Claude to generate a compose file, get something almost right, then spend 30 minutes fixing:
- Missing `restart: unless-stopped`
- No resource limits (docker out of memory = 💀)
- `:latest` tags everywhere
- No healthchecks → `depends_on` starts before postgres is ready
- Traefik labels wrong every time

So I made a free MCP that does all this **before** the file lands in my editor.

`npx -y docker-forge-mcp`

**4 tools:**
- `generate_stack` — describe what you need ("Node.js API + Postgres + Redis, domain api.myapp.com") → full compose with healthchecks, resource limits, Traefik v3 labels
- `audit_compose` — paste your existing compose → security score (0-100) + categorized issues (critical/warning/info). Catches: exposed database ports, plaintext secrets, docker socket mounts, unpinned images
- `add_traefik` — just the Traefik labels for an existing service, with middleware presets (rate-limit, security-headers, HTTPS redirect)
- `list_stacks` — see all 9 supported stacks

Pure logic, no API keys, $0 to run. MIT.

GitHub: github.com/fredericsuretat/docker-forge-mcp
`npx -y docker-forge-mcp`

---

## 2. r/LocalLLaMA (audience = local AI users, Claude Code / Cursor users)

**Title:** Free MCP that generates + audits Docker Compose stacks inside Claude Code — no API keys, $0 to run

**Body:**
If you're running a homelab or self-hosting services and using Claude Code, you know the drill: ask for a compose file, get something "almost right", fix it by hand.

I built a tiny MCP that gives Claude Code native Docker knowledge — it generates production-ready stacks and audits existing ones, all as pure logic with no external API calls.

`npx -y docker-forge-mcp`

Works in Claude Code, Cursor, Cline — anywhere MCP runs.

**Key tools:**
- `generate_stack`: "I need a Python FastAPI with PostgreSQL and Celery workers, domain worker.myapp.com" → full compose, Traefik labels, healthchecks, resource limits, .env template
- `audit_compose`: security score + issues for any existing compose (catches docker socket mounts, root user, exposed DB ports, plaintext secrets, :latest tags)
- `add_traefik`: Traefik v3 labels + middleware chain (rate-limit, HSTS, auth-basic) from a service name + domain + port

Pure logic = $0 to run, no keys, MIT.

---

## 3. Show HN

**Title:** Show HN: An MCP that generates and audits Docker Compose stacks inside your AI coding assistant

Most LLM-generated Docker Compose files have the same problems: missing healthchecks, no resource limits, `:latest` image tags, bare `depends_on` that starts before postgres is ready, and wrong Traefik labels. Docker Forge is a tiny MCP that fixes this before the file lands in the editor.

`generate_stack` takes a natural language description → production-ready compose (9 stack types: Node+Postgres+Redis, Python+Celery, WordPress, Next.js, monitoring...). Every generated stack has healthchecks, `depends_on: condition: service_healthy`, resource limits, named volumes, pinned image versions, restart policies, and optional Traefik v3 labels with HTTP→HTTPS redirect.

`audit_compose` gives an existing compose a score (0-100) and finds: privileged containers, exposed database ports (MySQL 3306, Postgres 5432, Redis 6379 to 0.0.0.0), docker socket mounts, plaintext secrets in env vars, missing restart policies, missing resource limits, `:latest` image tags, missing healthchecks.

`add_traefik` generates Traefik v3 labels from service name + domain + port, with middleware presets: rate-limit (60 req/min), security-headers (HSTS+nosniff+XSS), auth-basic, compress.

Pure logic, no API keys, $0 to run. `npx -y docker-forge-mcp`. MIT.

GitHub: github.com/fredericsuretat/docker-forge-mcp

---

## 4. dev.to post

**Title:** I built a free MCP server that generates production-ready Docker Compose stacks in Claude Code

**Tags:** docker, devops, ai, mcp, traefik

**Body:**

When I generate Docker Compose files with AI, I always have to fix the same things after:

```
# What AI gives you
services:
  app:
    image: node:latest  # ← unpinned
    ports:
      - 3306:3306  # ← database exposed to internet
    environment:
      DB_PASSWORD: mysecret  # ← plaintext secret

# What production needs
services:
  app:
    image: node:20-alpine  # pinned
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: "0.50"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
    depends_on:
      postgres:
        condition: service_healthy  # wait for actual readiness
    environment:
      DB_PASSWORD: ${DB_PASSWORD}  # from .env
```

I got tired of fixing this every time, so I made a free MCP server: **Docker Forge**.

### Install

```bash
# Add to Claude Code
npx -y docker-forge-mcp
```

Or add to your `~/.claude.json`:
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

### 4 tools

**`generate_stack`** — Describe what you want in plain English:

> "Generate a Python FastAPI app with PostgreSQL and Redis, domain api.myapp.com"

Returns a complete compose file with: pinned images, healthchecks, `depends_on: condition: service_healthy`, resource limits, named volumes, restart policies, Traefik v3 labels + HTTP→HTTPS redirect.

**`audit_compose`** — Paste your existing compose, get a security score (0-100):

Catches: privileged containers (critical), root user (critical), Docker socket mounts (critical), database ports exposed to 0.0.0.0 (critical), plaintext secrets in env vars (critical), missing restart policies (warning), no resource limits (warning), `:latest` image tags (warning), missing healthchecks (warning).

**`add_traefik`** — Just need Traefik labels for an existing service?

```
service_name: "backend", domain: "api.myapp.com", port: 3000, middlewares: ["rate-limit", "security-headers"]
```

Returns labels block + networks section ready to paste.

**`list_stacks`** — 9 stack types: Node+Postgres+Redis, Node+Postgres, Python+Celery, WordPress+MySQL, Next.js, monitoring (Prometheus+Grafana), Nginx static.

### No API keys, $0 to run

It's pure logic — a table of templates + security checks. No external calls, no tokens, no cost even at zero users. Works offline.

MIT, GitHub: github.com/fredericsuretat/docker-forge-mcp

---

## 5. X / Twitter thread

Tweet 1:
"Your AI coding assistant has no idea what a production Docker Compose file actually needs.

Missing healthchecks. No resource limits. :latest tags. DB ports exposed to the internet.

I built a free MCP that fixes all this before the file lands in your editor.

npx -y docker-forge-mcp 🧵"

Tweet 2:
"generate_stack: describe what you need in plain English

→ Node.js + Postgres + Redis, domain api.myapp.com

Returns a complete compose with:
✅ Pinned image versions
✅ Resource limits (memory + CPU)
✅ Healthchecks + depends_on: service_healthy
✅ Traefik v3 labels + HTTPS redirect"

Tweet 3:
"audit_compose: paste your existing docker-compose.yml

→ Security score (0-100) + categorized issues

Catches:
🔴 Privileged containers
🔴 DB ports exposed to 0.0.0.0
🔴 Plaintext secrets in env vars
🟡 :latest image tags
🟡 Missing restart policies
🟡 No resource limits"

Tweet 4:
"add_traefik: generates Traefik v3 labels from service + domain + port

Middleware presets: rate-limit, security-headers (HSTS+nosniff), auth-basic, compress

Pure logic, no API keys, $0 to run. MIT.
npx -y docker-forge-mcp
github.com/fredericsuretat/docker-forge-mcp"
