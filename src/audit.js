import yaml from 'js-yaml';

// Audit a Docker Compose YAML string for security and best-practice issues
export function auditCompose(composeYaml) {
  let doc;
  try {
    doc = yaml.load(composeYaml);
  } catch (e) {
    return { error: `YAML parse error: ${e.message}`, issues: [] };
  }

  if (!doc || typeof doc !== 'object' || !doc.services) {
    return { error: 'No services found in compose file', issues: [] };
  }

  const issues = [];
  const services = doc.services;

  for (const [svcName, svc] of Object.entries(services)) {
    if (!svc || typeof svc !== 'object') continue;

    // CRITICAL: privileged mode
    if (svc.privileged === true) {
      issues.push({
        severity: 'critical',
        service: svcName,
        check: 'privileged_mode',
        message: `Service '${svcName}' runs in privileged mode — full host access, equivalent to root on the host.`,
        fix: 'Remove "privileged: true". Use specific capabilities (cap_add) instead if needed.',
      });
    }

    // CRITICAL: running as root explicitly
    if (svc.user === 'root' || svc.user === '0' || svc.user === '0:0') {
      issues.push({
        severity: 'critical',
        service: svcName,
        check: 'root_user',
        message: `Service '${svcName}' explicitly runs as root user.`,
        fix: 'Set "user: 1000:1000" or create a non-root user in your Dockerfile.',
      });
    }

    // CRITICAL: docker socket mounted
    const volumes = svc.volumes || [];
    for (const v of volumes) {
      const vStr = typeof v === 'string' ? v : v.source || '';
      if (vStr.includes('/var/run/docker.sock')) {
        issues.push({
          severity: 'critical',
          service: svcName,
          check: 'docker_socket',
          message: `Service '${svcName}' mounts the Docker socket — gives full Docker API access (container escape vector).`,
          fix: 'Only mount docker.sock if absolutely necessary. Consider using a Docker-in-Docker image or Podman instead.',
        });
      }
      // Sensitive host paths
      const sensitivePaths = ['/etc', '/proc', '/sys', '/:'];
      for (const p of sensitivePaths) {
        if (vStr.startsWith(p) || vStr.includes(`:${p}`)) {
          issues.push({
            severity: 'critical',
            service: svcName,
            check: 'sensitive_volume',
            message: `Service '${svcName}' mounts sensitive host path: ${vStr}`,
            fix: 'Avoid mounting sensitive host paths. Use named volumes for data persistence.',
          });
        }
      }
    }

    // CRITICAL: plaintext secrets in environment
    const envVars = normalizeEnv(svc.environment);
    const secretKeyPattern = /PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE|CREDENTIAL|PASSWD|ACCESS_KEY|WEBHOOK/i;
    for (const envLine of envVars) {
      const [key, ...rest] = envLine.split('=');
      const value = rest.join('=');
      if (secretKeyPattern.test(key) && value && !value.includes('${') && !value.startsWith('$')) {
        issues.push({
          severity: 'critical',
          service: svcName,
          check: 'plaintext_secret',
          message: `Service '${svcName}' may have a plaintext secret in environment: ${key}=***`,
          fix: 'Use ${VARIABLE} references loaded from a .env file, or use Docker secrets.',
        });
      }
    }

    // CRITICAL: exposed sensitive ports to 0.0.0.0
    const ports = svc.ports || [];
    const sensitivePorts = { '3306': 'MySQL', '5432': 'PostgreSQL', '6379': 'Redis', '27017': 'MongoDB', '9200': 'Elasticsearch' };
    for (const p of ports) {
      const pStr = typeof p === 'string' ? p : String(p.published || p.target || p);
      const match = pStr.match(/^(?:0\.0\.0\.0:)?(\d+):(\d+)/);
      if (match) {
        const externalPort = match[1];
        const internalPort = match[2];
        if (sensitivePorts[internalPort] && !pStr.startsWith('127.0.0.1')) {
          issues.push({
            severity: 'critical',
            service: svcName,
            check: 'exposed_db_port',
            message: `Service '${svcName}' exposes ${sensitivePorts[internalPort]} port ${internalPort} to the internet (0.0.0.0:${externalPort}).`,
            fix: `Change to "127.0.0.1:${externalPort}:${internalPort}" to restrict access to localhost only, or remove the port mapping if other services connect via Docker network name.`,
          });
        }
      }
    }

    // WARNING: no restart policy
    if (!svc.restart) {
      issues.push({
        severity: 'warning',
        service: svcName,
        check: 'no_restart_policy',
        message: `Service '${svcName}' has no restart policy — container won't restart on crash.`,
        fix: 'Add "restart: unless-stopped" for long-running services.',
      });
    }

    // WARNING: no resource limits
    const hasLimits = svc.deploy?.resources?.limits?.memory || svc.deploy?.resources?.limits?.cpus;
    if (!hasLimits) {
      issues.push({
        severity: 'warning',
        service: svcName,
        check: 'no_resource_limits',
        message: `Service '${svcName}' has no memory/CPU limits — a runaway process can OOM the host.`,
        fix: 'Add deploy.resources.limits (e.g., memory: 256M, cpus: "0.50").',
      });
    }

    // WARNING: image pinned to :latest
    const image = svc.image || '';
    if (image.endsWith(':latest') || (image.includes('/') && !image.includes(':')) || (image && !image.includes(':') && !svc.build)) {
      issues.push({
        severity: 'warning',
        service: svcName,
        check: 'unpinned_image',
        message: `Service '${svcName}' uses unpinned image "${image || 'unknown'}" — not reproducible, may break on next pull.`,
        fix: 'Pin to a specific version tag, e.g., "postgres:16-alpine" instead of "postgres:latest".',
      });
    }

    // WARNING: no healthcheck
    if (!svc.healthcheck && !svc.build) {
      issues.push({
        severity: 'warning',
        service: svcName,
        check: 'no_healthcheck',
        message: `Service '${svcName}' has no healthcheck — Docker won't know if the service is actually ready.`,
        fix: 'Add a healthcheck. Example: test: ["CMD", "wget", "-qO-", "http://localhost:PORT/health"]',
      });
    }

    // WARNING: depends_on without condition: service_healthy
    const deps = svc.depends_on;
    if (deps && typeof deps === 'object' && !Array.isArray(deps)) {
      for (const [dep, depConfig] of Object.entries(deps)) {
        if (depConfig?.condition !== 'service_healthy') {
          issues.push({
            severity: 'warning',
            service: svcName,
            check: 'depends_on_no_healthcheck',
            message: `Service '${svcName}' depends on '${dep}' without condition: service_healthy — may start before dependency is ready.`,
            fix: `Add 'condition: service_healthy' to depends_on.${dep}, and add a healthcheck to '${dep}'.`,
          });
        }
      }
    }
    if (Array.isArray(deps)) {
      for (const dep of deps) {
        issues.push({
          severity: 'info',
          service: svcName,
          check: 'depends_on_simple',
          message: `Service '${svcName}' uses simple depends_on for '${dep}' (waits for start, not readiness).`,
          fix: `Use object form with condition: service_healthy and add healthchecks to '${dep}'.`,
        });
      }
    }

    // INFO: no named networks (all on default)
    const svcNetworks = svc.networks;
    if (!svcNetworks || (Array.isArray(svcNetworks) && svcNetworks.length === 0)) {
      // Only flag if there are multiple services
      if (Object.keys(services).length > 2) {
        issues.push({
          severity: 'info',
          service: svcName,
          check: 'no_network_isolation',
          message: `Service '${svcName}' is on the default network — all services can reach each other.`,
          fix: 'Define named networks and assign only the services that need to communicate.',
        });
      }
    }
  }

  const critical = issues.filter(i => i.severity === 'critical').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const infos = issues.filter(i => i.severity === 'info').length;

  return {
    summary: { critical, warnings, info: infos, total: issues.length },
    score: Math.max(0, 100 - critical * 20 - warnings * 5 - infos * 1),
    issues,
  };
}

function normalizeEnv(env) {
  if (!env) return [];
  if (Array.isArray(env)) return env.map(String);
  return Object.entries(env).map(([k, v]) => `${k}=${v ?? ''}`);
}
