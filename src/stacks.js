// Docker Compose stack templates — production-ready, security-hardened

export const STACK_CATALOG = {
  'node-postgres-redis': {
    name: 'Node.js + PostgreSQL + Redis',
    description: 'Full-stack Node.js app with PostgreSQL database and Redis cache',
    tags: ['node', 'express', 'api', 'backend', 'postgres', 'redis', 'cache'],
  },
  'node-postgres': {
    name: 'Node.js + PostgreSQL',
    description: 'Node.js/Express API with PostgreSQL database',
    tags: ['node', 'express', 'api', 'postgres', 'database'],
  },
  'node-redis': {
    name: 'Node.js + Redis',
    description: 'Node.js app with Redis (cache, session store, pub/sub)',
    tags: ['node', 'redis', 'cache', 'session'],
  },
  'python-postgres-redis-celery': {
    name: 'Python + FastAPI + PostgreSQL + Redis + Celery',
    description: 'Full Python async stack with task queue',
    tags: ['python', 'fastapi', 'postgres', 'redis', 'celery', 'async', 'worker'],
  },
  'python-postgres': {
    name: 'Python + FastAPI + PostgreSQL',
    description: 'Python FastAPI with PostgreSQL database',
    tags: ['python', 'fastapi', 'flask', 'django', 'postgres'],
  },
  'wordpress': {
    name: 'WordPress + MySQL',
    description: 'WordPress CMS with MySQL database',
    tags: ['wordpress', 'cms', 'php', 'mysql'],
  },
  'nextjs-postgres': {
    name: 'Next.js + PostgreSQL',
    description: 'Next.js (standalone) with PostgreSQL',
    tags: ['nextjs', 'react', 'frontend', 'fullstack', 'postgres'],
  },
  'monitoring': {
    name: 'Monitoring Stack (Prometheus + Grafana)',
    description: 'Prometheus metrics + Grafana dashboards + node-exporter',
    tags: ['monitoring', 'prometheus', 'grafana', 'metrics', 'observability'],
  },
  'nginx': {
    name: 'Nginx static server',
    description: 'Nginx serving a static site or SPA build',
    tags: ['nginx', 'static', 'spa', 'frontend', 'html'],
  },
};

// Detect stack type from natural language description
export function detectStackType(description) {
  const d = description.toLowerCase();
  if (d.includes('wordpress') || d.includes('cms') || d.includes('wp ')) return 'wordpress';
  if ((d.includes('monitor') || d.includes('prometheus') || d.includes('grafana'))) return 'monitoring';
  if (d.includes('nginx') && (d.includes('static') || d.includes('html') || d.includes('spa'))) return 'nginx';
  if (d.includes('next') && d.includes('postgres')) return 'nextjs-postgres';
  if (d.includes('python') || d.includes('fastapi') || d.includes('django') || d.includes('flask')) {
    if (d.includes('celery') || d.includes('worker') || d.includes('task')) return 'python-postgres-redis-celery';
    if (d.includes('redis')) return 'python-postgres-redis-celery';
    return 'python-postgres';
  }
  if (d.includes('node') || d.includes('express') || d.includes('api')) {
    if (d.includes('redis') && d.includes('postgres')) return 'node-postgres-redis';
    if (d.includes('redis')) return 'node-redis';
    return 'node-postgres';
  }
  return 'node-postgres';
}

// Generate compose YAML string for a given stack
export function generateStack({ stack_type, app_name, domain, include_traefik = false, traefik_network = 'proxy', node_version = '20', python_version = '3.12', db_name }) {
  const name = app_name || 'app';
  const dbName = db_name || name.replace(/[^a-z0-9]/gi, '_');

  switch (stack_type) {
    case 'node-postgres-redis': return nodePostgresRedis(name, dbName, domain, include_traefik, traefik_network, node_version);
    case 'node-postgres': return nodePostgres(name, dbName, domain, include_traefik, traefik_network, node_version);
    case 'node-redis': return nodeRedis(name, domain, include_traefik, traefik_network, node_version);
    case 'python-postgres-redis-celery': return pythonFullStack(name, dbName, domain, include_traefik, traefik_network, python_version);
    case 'python-postgres': return pythonPostgres(name, dbName, domain, include_traefik, traefik_network, python_version);
    case 'wordpress': return wordpress(name, dbName, domain, include_traefik, traefik_network);
    case 'nextjs-postgres': return nextjsPostgres(name, dbName, domain, include_traefik, traefik_network, node_version);
    case 'monitoring': return monitoring(name, domain, include_traefik, traefik_network);
    case 'nginx': return nginxStatic(name, domain, include_traefik, traefik_network);
    default: return nodePostgres(name, dbName, domain, include_traefik, traefik_network, node_version);
  }
}

function traefikLabels(name, domain, port, network) {
  return domain ? `
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${name}.rule=Host(\`${domain}\`)"
      - "traefik.http.routers.${name}.entrypoints=websecure"
      - "traefik.http.routers.${name}.tls=true"
      - "traefik.http.routers.${name}.tls.certresolver=letsencrypt"
      - "traefik.http.services.${name}.loadbalancer.server.port=${port}"
    networks:
      - default
      - ${network}` : '';
}

function traefikNetwork(network) {
  return `
networks:
  default:
    driver: bridge
  ${network}:
    external: true`;
}

function nodePostgresRedis(name, dbName, domain, traefik, network, nodeVer) {
  const domainLabel = domain ? traefikLabels(name, domain, 3000, network) : '';
  const nets = domain ? traefikNetwork(network) : '\nnetworks:\n  default:\n    driver: bridge';
  return `version: "3.9"

services:
  ${name}:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://\${DB_USER}:\${DB_PASS}@postgres:5432/${dbName}
      - REDIS_URL=redis://redis:6379
      - PORT=3000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3${domainLabel}

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASS}
      POSTGRES_DB: ${dbName}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d ${dbName}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --save 60 1 --loglevel warning
    volumes:
      - redis_data:/data
    deploy:
      resources:
        limits:
          cpus: "0.25"
          memory: 64M
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
  redis_data:
${nets}

# .env required:
# DB_USER=myuser
# DB_PASS=changeme_strong_password
`;
}

function nodePostgres(name, dbName, domain, traefik, network, nodeVer) {
  const domainLabel = domain ? traefikLabels(name, domain, 3000, network) : '';
  const nets = domain ? traefikNetwork(network) : '\nnetworks:\n  default:\n    driver: bridge';
  return `version: "3.9"

services:
  ${name}:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://\${DB_USER}:\${DB_PASS}@postgres:5432/${dbName}
      - PORT=3000
    depends_on:
      postgres:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3${domainLabel}

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASS}
      POSTGRES_DB: ${dbName}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d ${dbName}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
${nets}

# .env required:
# DB_USER=myuser
# DB_PASS=changeme_strong_password
`;
}

function nodeRedis(name, domain, traefik, network, nodeVer) {
  const domainLabel = domain ? traefikLabels(name, domain, 3000, network) : '';
  const nets = domain ? traefikNetwork(network) : '\nnetworks:\n  default:\n    driver: bridge';
  return `version: "3.9"

services:
  ${name}:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - PORT=3000
    depends_on:
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3${domainLabel}

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --save 60 1 --loglevel warning
    volumes:
      - redis_data:/data
    deploy:
      resources:
        limits:
          cpus: "0.25"
          memory: 64M
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  redis_data:
${nets}
`;
}

function pythonFullStack(name, dbName, domain, traefik, network, pyVer) {
  const domainLabel = domain ? traefikLabels(name, domain, 8000, network) : '';
  const nets = domain ? traefikNetwork(network) : '\nnetworks:\n  default:\n    driver: bridge';
  return `version: "3.9"

services:
  ${name}:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql+asyncpg://\${DB_USER}:\${DB_PASS}@postgres:5432/${dbName}
      - REDIS_URL=redis://redis:6379
      - PORT=8000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8000/health"]
      interval: 30s
      timeout: 5s
      retries: 3${domainLabel}

  worker:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    command: celery -A app.tasks worker --loglevel=info --concurrency=2
    environment:
      - DATABASE_URL=postgresql+asyncpg://\${DB_USER}:\${DB_PASS}@postgres:5432/${dbName}
      - REDIS_URL=redis://redis:6379
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/1
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASS}
      POSTGRES_DB: ${dbName}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d ${dbName}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --save 60 1 --loglevel warning
    volumes:
      - redis_data:/data
    deploy:
      resources:
        limits:
          cpus: "0.25"
          memory: 64M
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
  redis_data:
${nets}

# .env required:
# DB_USER=myuser
# DB_PASS=changeme_strong_password
`;
}

function pythonPostgres(name, dbName, domain, traefik, network, pyVer) {
  const domainLabel = domain ? traefikLabels(name, domain, 8000, network) : '';
  const nets = domain ? traefikNetwork(network) : '\nnetworks:\n  default:\n    driver: bridge';
  return `version: "3.9"

services:
  ${name}:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql+asyncpg://\${DB_USER}:\${DB_PASS}@postgres:5432/${dbName}
      - PORT=8000
    depends_on:
      postgres:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8000/health"]
      interval: 30s
      timeout: 5s
      retries: 3${domainLabel}

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASS}
      POSTGRES_DB: ${dbName}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d ${dbName}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
${nets}

# .env required:
# DB_USER=myuser
# DB_PASS=changeme_strong_password
`;
}

function wordpress(name, dbName, domain, traefik, network) {
  const wpName = `${name}_wp`;
  const domainLabel = domain ? traefikLabels(wpName, domain, 80, network) : '';
  const nets = domain ? traefikNetwork(network) : '\nnetworks:\n  default:\n    driver: bridge';
  return `version: "3.9"

services:
  wordpress:
    image: wordpress:6-php8.2-apache
    restart: unless-stopped
    environment:
      WORDPRESS_DB_HOST: mysql
      WORDPRESS_DB_USER: \${DB_USER}
      WORDPRESS_DB_PASSWORD: \${DB_PASS}
      WORDPRESS_DB_NAME: ${dbName}
      WORDPRESS_TABLE_PREFIX: wp_
    volumes:
      - wp_content:/var/www/html/wp-content
    depends_on:
      mysql:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M${domainLabel}

  mysql:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: ${dbName}
      MYSQL_USER: \${DB_USER}
      MYSQL_PASSWORD: \${DB_PASS}
      MYSQL_ROOT_PASSWORD: \${DB_ROOT_PASS}
    volumes:
      - mysql_data:/var/lib/mysql
    command: --default-authentication-plugin=mysql_native_password
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p$$MYSQL_ROOT_PASSWORD"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  wp_content:
  mysql_data:
${nets}

# .env required:
# DB_USER=wpuser
# DB_PASS=changeme_strong_password
# DB_ROOT_PASS=changeme_root_password
`;
}

function nextjsPostgres(name, dbName, domain, traefik, network, nodeVer) {
  const domainLabel = domain ? traefikLabels(name, domain, 3000, network) : '';
  const nets = domain ? traefikNetwork(network) : '\nnetworks:\n  default:\n    driver: bridge';
  return `version: "3.9"

services:
  ${name}:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        - NODE_VERSION=${nodeVer}
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://\${DB_USER}:\${DB_PASS}@postgres:5432/${dbName}
      - NEXTAUTH_URL=https://${domain || 'yourdomain.com'}
      - NEXTAUTH_SECRET=\${NEXTAUTH_SECRET}
    depends_on:
      postgres:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 512M
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3${domainLabel}

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASS}
      POSTGRES_DB: ${dbName}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d ${dbName}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
${nets}

# .env required:
# DB_USER=myuser
# DB_PASS=changeme_strong_password
# NEXTAUTH_SECRET=generate_with: openssl rand -base64 32
`;
}

function monitoring(name, domain, traefik, network) {
  const domainLabel = domain ? traefikLabels('grafana', domain, 3000, network) : '';
  const nets = domain ? traefikNetwork(network) : '\nnetworks:\n  default:\n    driver: bridge';
  return `version: "3.9"

services:
  prometheus:
    image: prom/prometheus:latest
    restart: unless-stopped
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=15d'
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:9090/-/healthy"]
      interval: 30s
      timeout: 5s
      retries: 3

  grafana:
    image: grafana/grafana:latest
    restart: unless-stopped
    environment:
      - GF_SECURITY_ADMIN_USER=\${GRAFANA_USER:-admin}
      - GF_SECURITY_ADMIN_PASSWORD=\${GRAFANA_PASS}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_SERVER_ROOT_URL=https://${domain || 'grafana.yourdomain.com'}
    volumes:
      - grafana_data:/var/lib/grafana
    depends_on:
      - prometheus
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 256M
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3${domainLabel}

  node-exporter:
    image: prom/node-exporter:latest
    restart: unless-stopped
    pid: host
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/rootfs'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    deploy:
      resources:
        limits:
          cpus: "0.25"
          memory: 64M

volumes:
  prometheus_data:
  grafana_data:
${nets}

# .env required:
# GRAFANA_PASS=changeme_strong_password
`;
}

function nginxStatic(name, domain, traefik, network) {
  const domainLabel = domain ? traefikLabels(name, domain, 80, network) : '';
  const nets = domain ? traefikNetwork(network) : '\nnetworks:\n  default:\n    driver: bridge';
  return `version: "3.9"

services:
  ${name}:
    image: nginx:alpine
    restart: unless-stopped
    volumes:
      - ./dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    deploy:
      resources:
        limits:
          cpus: "0.25"
          memory: 64M
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/"]
      interval: 30s
      timeout: 5s
      retries: 3${domainLabel}
${nets}

# nginx.conf (create this file):
# server {
#   listen 80;
#   root /usr/share/nginx/html;
#   index index.html;
#   location / { try_files $uri $uri/ /index.html; }
#   gzip on;
#   gzip_types text/plain text/css application/json application/javascript;
# }
`;
}
