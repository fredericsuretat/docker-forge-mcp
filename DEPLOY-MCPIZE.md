# docker-forge-mcp — déploiement MCPize

## Statut

- ✅ **npm** : `docker-forge-mcp@0.1.0` publié (https://www.npmjs.com/package/docker-forge-mcp)
- ✅ **GitHub** : https://github.com/fredericsuretat/docker-forge-mcp
- ✅ **GCloud** : HTTP server sur 35.209.238.241:8788 (service systemd `docker-forge-mcp`)
- ⏳ **MCPize** : nécessite `mcpize login` (navigateur, OAuth GitHub) — voir ci-dessous

## MCPize — procédure de déploiement

```bash
cd ~/Documents/Dev/mcp-docker-forge

# 1) Ré-authentification (session expirée, ouvre le navigateur)
npx -y mcpize login

# 2) Déployer
npx -y mcpize deploy -y --skip-wizard

# 3) Pricing
npx -y mcpize publish --pricing "Free: 500 req/month, 3 core tools (generate_stack, audit_compose, add_traefik, list_stacks). Pro 12 USD/month: unlimited requests, generate_dockerfile (multi-stage Node/Python/Go), generate_env template extraction, priority support."

# 4) Logo + SEO
npx -y mcpize publish --generate-logo
```

## Pricing à configurer
- **Free** : 500 req/mois, outils: generate_stack, audit_compose, add_traefik, list_stacks
- **Pro $12/mois** : illimité + generate_dockerfile + generate_env

## SEO listing MCPize

**Titre:** `Docker Forge`

**Tagline:** Generate, audit, and tune Docker Compose stacks inside Claude Code — before you copy-paste anything.

**Description:**
Every LLM-generated Docker Compose has the same problems: missing healthchecks, no resource limits, `:latest` image tags, database ports exposed to the internet, bare `depends_on` that starts before postgres is ready. Docker Forge fixes all this before the file lands in your project.

4 tools — pure logic, no API keys, $0 to run:

**generate_stack** — describe in plain English ("Node.js API + PostgreSQL + Redis, domain api.myapp.com") → production-ready compose with healthchecks, `depends_on: service_healthy`, resource limits (memory + CPU), named volumes, pinned image versions, restart policies, and optional Traefik v3 labels.

**audit_compose** — paste your compose → security score (0-100) + categorized issues. Catches: privileged containers (critical), database ports exposed to 0.0.0.0 (critical), docker socket mounts (critical), plaintext secrets in env (critical), missing restart policies, no resource limits, `:latest` tags, missing healthchecks.

**add_traefik** — Traefik v3 labels + middleware chain (rate-limit, security-headers/HSTS, auth-basic, compress) from service name + domain + port.

**list_stacks** — 9 stack types: Node+Postgres+Redis, Python+Celery, WordPress+MySQL, Next.js, Prometheus+Grafana, Nginx.

[PRO] **generate_dockerfile** — multi-stage, hardened Dockerfile for Node.js, Python, Go (non-root user, HEALTHCHECK, minimal final image).

[PRO] **generate_env** — extract all `${VAR}` from a compose file and generate a categorized .env template.

**Tags:** `mcp` `docker` `compose` `devops` `traefik` `security` `audit` `dockerfile` `infrastructure` `claude-code` `cursor` `stack` `generator`

## GCloud endpoint (pour AgenticMarket)
- URL: `http://35.209.238.241:8788/mcp`
- Health: `http://35.209.238.241:8788/health`
- Pour AgenticMarket: utiliser cet endpoint + définir MCP_AUTH_TOKEN si nécessaire

## Redéploiement
```bash
cd ~/Documents/Dev/mcp-docker-forge
git commit -am "..."
npx -y mcpize deploy -y --skip-wizard
```
