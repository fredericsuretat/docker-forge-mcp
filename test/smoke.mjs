import { generateStack, detectStackType, STACK_CATALOG } from '../src/stacks.js';
import { auditCompose } from '../src/audit.js';
import { generateTraefikLabels, listMiddlewarePresets } from '../src/traefik.js';
import { generateDockerfile, generateEnvTemplate } from '../src/dockerfile-gen.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(val, msg) {
  if (!val) throw new Error(msg || 'Assertion failed');
}

// --- generate_stack ---
test('detectStackType: node + postgres + redis', () => {
  assert(detectStackType('node express api with postgres and redis') === 'node-postgres-redis');
});
test('detectStackType: python fastapi', () => {
  assert(detectStackType('python fastapi application') === 'python-postgres');
});
test('detectStackType: wordpress', () => {
  assert(detectStackType('wordpress blog') === 'wordpress');
});
test('detectStackType: monitoring', () => {
  assert(detectStackType('prometheus grafana monitoring') === 'monitoring');
});

test('generateStack: node-postgres-redis', () => {
  const r = generateStack({ stack_type: 'node-postgres-redis', app_name: 'myapp' });
  assert(r.includes('postgres:16-alpine'), 'should use pinned postgres image');
  assert(r.includes('redis:7-alpine'), 'should use pinned redis image');
  assert(r.includes('restart: unless-stopped'), 'should have restart policy');
  assert(r.includes('healthcheck'), 'should have healthcheck');
  assert(r.includes('deploy'), 'should have deploy resource limits');
  assert(r.includes('service_healthy'), 'depends_on should use service_healthy');
  assert(r.includes('myapp'), 'should use app name');
});

test('generateStack: node-postgres-redis with traefik', () => {
  const r = generateStack({ stack_type: 'node-postgres-redis', app_name: 'api', domain: 'api.example.com', include_traefik: true });
  assert(r.includes('traefik.enable=true'), 'should have traefik labels');
  assert(r.includes('api.example.com'), 'should include domain');
  assert(r.includes('letsencrypt'), 'should use letsencrypt');
});

test('generateStack: wordpress', () => {
  const r = generateStack({ stack_type: 'wordpress', app_name: 'blog' });
  assert(r.includes('mysql:8.0'), 'should use MySQL');
  assert(r.includes('wordpress:6-php8.2-apache'), 'should pin WordPress image');
});

test('generateStack: monitoring', () => {
  const r = generateStack({ stack_type: 'monitoring', app_name: 'mon' });
  assert(r.includes('prometheus'), 'should have Prometheus');
  assert(r.includes('grafana'), 'should have Grafana');
  assert(r.includes('node-exporter'), 'should have node-exporter');
});

test('generateStack: python-postgres', () => {
  const r = generateStack({ stack_type: 'python-postgres', app_name: 'api' });
  assert(r.includes('postgres:16-alpine'), 'should have postgres');
  assert(r.includes('asyncpg'), 'should use asyncpg URL format');
});

test('generateStack: all stack types compile', () => {
  for (const key of Object.keys(STACK_CATALOG)) {
    const r = generateStack({ stack_type: key, app_name: 'test' });
    assert(r.length > 100, `Stack ${key} should produce non-empty output`);
  }
});

// --- audit_compose ---
const GOOD_COMPOSE = `
version: "3.9"
services:
  app:
    image: node:20-alpine
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 256M
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
    environment:
      - NODE_ENV=production
`;

const BAD_COMPOSE = `
version: "3.9"
services:
  app:
    image: node:latest
    privileged: true
    user: root
    ports:
      - "3306:3306"
      - "5432:5432"
    environment:
      - DB_PASSWORD=mysecret123
      - API_TOKEN=super_secret_token_value
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
`;

test('auditCompose: good compose has score > 60', () => {
  const r = auditCompose(GOOD_COMPOSE);
  assert(!r.error, 'should not error');
  assert(r.score > 60, `score should be > 60, got ${r.score}`);
});

test('auditCompose: bad compose catches critical issues', () => {
  const r = auditCompose(BAD_COMPOSE);
  assert(!r.error, 'should not error');
  assert(r.summary.critical >= 3, `should catch >= 3 critical issues, got ${r.summary.critical}`);
  const checks = r.issues.map(i => i.check);
  assert(checks.includes('privileged_mode'), 'should catch privileged mode');
  assert(checks.includes('docker_socket'), 'should catch docker socket');
  assert(checks.includes('exposed_db_port'), 'should catch exposed DB port');
});

test('auditCompose: catches plaintext secrets', () => {
  const r = auditCompose(BAD_COMPOSE);
  const secretIssues = r.issues.filter(i => i.check === 'plaintext_secret');
  assert(secretIssues.length >= 1, `should catch plaintext secrets, got ${secretIssues.length}`);
});

test('auditCompose: catches missing restart policy', () => {
  const r = auditCompose(BAD_COMPOSE);
  const checks = r.issues.map(i => i.check);
  assert(checks.includes('no_restart_policy'), 'should catch missing restart policy');
});

test('auditCompose: invalid YAML returns error', () => {
  const r = auditCompose('this is: not: valid: yaml: :::');
  assert(r.error, 'should return error for invalid YAML');
});

// --- add_traefik ---
test('generateTraefikLabels: basic labels', () => {
  const r = generateTraefikLabels({ service_name: 'myapp', domain: 'myapp.example.com', port: 3000 });
  assert(r.labels.some(l => l.includes('traefik.enable=true')), 'should have enable label');
  assert(r.labels.some(l => l.includes('myapp.example.com')), 'should have domain');
  assert(r.labels.some(l => l.includes('letsencrypt')), 'should have letsencrypt');
  assert(r.labels.some(l => l.includes('port=3000') || l.includes('.port=3000')), 'should have port');
  assert(r.compose_snippet.includes('labels:'), 'should have compose snippet');
  assert(r.network_section.includes('external: true'), 'should have network section');
});

test('generateTraefikLabels: with middlewares', () => {
  const r = generateTraefikLabels({
    service_name: 'api',
    domain: 'api.example.com',
    port: 8000,
    middlewares: ['rate-limit', 'security-headers'],
  });
  assert(r.labels.length > 6, 'should have additional middleware labels');
  assert(r.notes.length >= 2, 'should have notes for middlewares');
});

test('generateTraefikLabels: includes HTTP redirect', () => {
  const r = generateTraefikLabels({ service_name: 'app', domain: 'app.com', port: 3000, include_http_redirect: true });
  const hasRedirect = r.labels.some(l => l.includes('redirectscheme'));
  assert(hasRedirect, 'should include HTTP to HTTPS redirect');
});

test('listMiddlewarePresets: returns presets', () => {
  const presets = listMiddlewarePresets();
  assert(presets.length >= 4, 'should have at least 4 presets');
  assert(presets.every(p => p.name && p.description), 'each preset should have name and description');
});

// --- generate_dockerfile ---
test('generateDockerfile: node', () => {
  const r = generateDockerfile({ runtime: 'node', version: '20', port: 3000 });
  assert(r.includes('node:20-alpine'), 'should use specified node version');
  assert(r.includes('HEALTHCHECK'), 'should have HEALTHCHECK');
  assert(r.includes('USER nodejs'), 'should use non-root user');
  assert(r.includes('AS builder'), 'should have multi-stage build');
});

test('generateDockerfile: python', () => {
  const r = generateDockerfile({ runtime: 'python', version: '3.12', port: 8000 });
  assert(r.includes('python:3.12-slim'), 'should use slim image');
  assert(r.includes('HEALTHCHECK'), 'should have HEALTHCHECK');
  assert(r.includes('USER appuser'), 'should use non-root user');
});

test('generateDockerfile: go', () => {
  const r = generateDockerfile({ runtime: 'go', port: 8080 });
  assert(r.includes('FROM scratch'), 'go should use scratch final image');
  assert(r.includes('CGO_ENABLED=0'), 'should disable CGO');
});

test('generateDockerfile: nextjs standalone', () => {
  const r = generateDockerfile({ runtime: 'node', app_type: 'nextjs', version: '20' });
  assert(r.includes('.next/standalone'), 'nextjs should use standalone output');
  assert(r.includes('USER nextjs'), 'should use non-root user');
});

// --- generate_env ---
test('generateEnvTemplate: extracts vars', () => {
  const compose = `
services:
  app:
    environment:
      - DB_USER=\${DB_USER}
      - DB_PASS=\${DB_PASS}
      - API_TOKEN=\${API_TOKEN}
      - NEXTAUTH_SECRET=\${NEXTAUTH_SECRET}
  `;
  const r = generateEnvTemplate(compose);
  assert(r.variables.includes('DB_USER'), 'should extract DB_USER');
  assert(r.variables.includes('DB_PASS'), 'should extract DB_PASS');
  assert(r.variables.includes('API_TOKEN'), 'should extract API_TOKEN');
  assert(r.env_template.includes('# Database'), 'should have database section');
  assert(r.env_template.includes('# Auth / Secrets'), 'should have auth section');
});

test('generateEnvTemplate: no vars → empty template', () => {
  const r = generateEnvTemplate('services:\n  app:\n    image: nginx');
  assert(r.env_template.includes('No environment variables'), 'should indicate no vars found');
  assert(r.variables.length === 0, 'should have no variables');
});

// --- Summary ---
console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
