// Generate optimized, security-hardened Dockerfiles

export function generateDockerfile({ runtime, app_type, version, port = 3000, build_tool, package_manager = 'npm' }) {
  switch (runtime) {
    case 'node': return nodeDockerfile({ app_type, version: version || '20', port, package_manager });
    case 'python': return pythonDockerfile({ app_type, version: version || '3.12', port });
    case 'go': return goDockerfile({ version: version || '1.22', port });
    default: return nodeDockerfile({ app_type, version: version || '20', port, package_manager });
  }
}

function nodeDockerfile({ app_type, version, port, package_manager }) {
  const isNextJs = app_type === 'nextjs';
  const lockFile = package_manager === 'pnpm' ? 'pnpm-lock.yaml' : package_manager === 'yarn' ? 'yarn.lock' : 'package-lock.json';
  const installCmd = package_manager === 'pnpm' ? 'pnpm install --frozen-lockfile --prod'
    : package_manager === 'yarn' ? 'yarn install --frozen-lockfile --production'
    : 'npm ci --omit=dev';
  const installAllCmd = package_manager === 'pnpm' ? 'pnpm install --frozen-lockfile'
    : package_manager === 'yarn' ? 'yarn install --frozen-lockfile'
    : 'npm ci';
  const buildCmd = package_manager === 'pnpm' ? 'pnpm build'
    : package_manager === 'yarn' ? 'yarn build'
    : 'npm run build';

  if (isNextJs) {
    return `# Multi-stage Next.js Dockerfile (standalone output)
# Requires: output: 'standalone' in next.config.js

FROM node:${version}-alpine AS deps
WORKDIR /app
COPY package.json ${lockFile} ./
RUN ${installAllCmd}

FROM node:${version}-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN ${buildCmd}

FROM node:${version}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=${port}

RUN addgroup --system --gid 1001 nodejs && \\
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE ${port}
CMD ["node", "server.js"]
`;
  }

  return `# Multi-stage Node.js Dockerfile — production-hardened

FROM node:${version}-alpine AS builder
WORKDIR /app
COPY package.json ${lockFile} ./
RUN ${installAllCmd}
COPY . .
RUN ${buildCmd} 2>/dev/null || true

FROM node:${version}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=${port}

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nodejs

# Install only prod dependencies
COPY package.json ${lockFile} ./
RUN ${installCmd} && npm cache clean --force

# Copy built app
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/src ./src

USER nodejs
EXPOSE ${port}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD wget -qO- http://localhost:${port}/health || exit 1

CMD ["node", "src/index.js"]
`;
}

function pythonDockerfile({ app_type, version, port }) {
  return `# Multi-stage Python Dockerfile — production-hardened

FROM python:${version}-slim AS builder
WORKDIR /app

# Install build deps
RUN apt-get update && apt-get install -y --no-install-recommends \\
    build-essential \\
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:${version}-slim AS runner
WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=${port}

# Non-root user
RUN useradd --create-home --shell /bin/bash --uid 1001 appuser

# Copy installed packages from builder
COPY --from=builder /root/.local /home/appuser/.local

# Copy app code
COPY --chown=appuser:appuser . .

USER appuser
ENV PATH=/home/appuser/.local/bin:$PATH

EXPOSE ${port}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${port}/health')" || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "${port}"]
`;
}

function goDockerfile({ version, port }) {
  return `# Multi-stage Go Dockerfile — minimal final image

FROM golang:${version}-alpine AS builder
WORKDIR /app

# Download dependencies first (layer caching)
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o /app/server ./cmd/server

FROM scratch AS runner
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/server /server
EXPOSE ${port}

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\
  CMD ["/server", "-health"]

CMD ["/server"]
`;
}

export function generateEnvTemplate(composeYaml) {
  // Extract all ${VAR} patterns from compose YAML
  const varPattern = /\$\{([A-Z_][A-Z0-9_]*)\}/g;
  const found = new Set();
  let match;
  while ((match = varPattern.exec(composeYaml)) !== null) {
    found.add(match[1]);
  }

  if (found.size === 0) {
    return { env_template: '# No environment variables detected in compose file', variables: [] };
  }

  const vars = [...found].sort();
  const lines = ['# .env — auto-generated template from docker-compose.yml', '# Fill in the values before running docker compose up', ''];

  // Group by category
  const dbVars = vars.filter(v => /^(DB_|POSTGRES_|MYSQL_|MONGO_)/.test(v));
  const authVars = vars.filter(v => /^(SECRET|TOKEN|API_KEY|AUTH_|NEXTAUTH_|JWT_)/.test(v));
  const appVars = vars.filter(v => !dbVars.includes(v) && !authVars.includes(v));

  if (dbVars.length > 0) {
    lines.push('# Database');
    for (const v of dbVars) {
      const hint = v.includes('PASS') || v.includes('PASSWORD') ? '# REQUIRED: generate with: openssl rand -base64 24' : '';
      if (hint) lines.push(hint);
      lines.push(`${v}=`);
    }
    lines.push('');
  }

  if (authVars.length > 0) {
    lines.push('# Auth / Secrets');
    for (const v of authVars) {
      lines.push('# REQUIRED: generate with: openssl rand -base64 32');
      lines.push(`${v}=`);
    }
    lines.push('');
  }

  if (appVars.length > 0) {
    lines.push('# Application');
    for (const v of appVars) {
      lines.push(`${v}=`);
    }
  }

  return {
    env_template: lines.join('\n'),
    variables: vars,
    count: vars.length,
  };
}
