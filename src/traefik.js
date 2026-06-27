// Traefik v3 label generator

const PRESET_MIDDLEWARES = {
  'auth-basic': (name) => ({
    labels: [
      `traefik.http.middlewares.${name}-auth.basicauth.usersfile=/etc/traefik/.htpasswd`,
    ],
    note: 'Create .htpasswd with: htpasswd -nb admin yourpassword',
  }),
  'redirect-https': (name) => ({
    labels: [
      `traefik.http.middlewares.${name}-redirect.redirectscheme.scheme=https`,
      `traefik.http.middlewares.${name}-redirect.redirectscheme.permanent=true`,
    ],
    note: 'Add this to HTTP router middlewares to force HTTPS redirect',
  }),
  'rate-limit': (name, opts = {}) => ({
    labels: [
      `traefik.http.middlewares.${name}-ratelimit.ratelimit.average=${opts.average || 60}`,
      `traefik.http.middlewares.${name}-ratelimit.ratelimit.burst=${opts.burst || 20}`,
      `traefik.http.middlewares.${name}-ratelimit.ratelimit.period=1m`,
    ],
    note: `Rate limit: ${opts.average || 60} req/min average, burst ${opts.burst || 20}`,
  }),
  'security-headers': (name) => ({
    labels: [
      `traefik.http.middlewares.${name}-headers.headers.stsSeconds=63072000`,
      `traefik.http.middlewares.${name}-headers.headers.stsIncludeSubdomains=true`,
      `traefik.http.middlewares.${name}-headers.headers.stsPreload=true`,
      `traefik.http.middlewares.${name}-headers.headers.forceSTSHeader=true`,
      `traefik.http.middlewares.${name}-headers.headers.contentTypeNosniff=true`,
      `traefik.http.middlewares.${name}-headers.headers.browserXssFilter=true`,
      `traefik.http.middlewares.${name}-headers.headers.referrerPolicy=strict-origin-when-cross-origin`,
    ],
    note: 'Security headers: HSTS, XSS protection, content type nosniff',
  }),
  'compress': (name) => ({
    labels: [
      `traefik.http.middlewares.${name}-compress.compress=true`,
    ],
    note: 'Enable gzip/zstd compression',
  }),
};

export function generateTraefikLabels({
  service_name,
  domain,
  port,
  network = 'proxy',
  tls = true,
  certresolver = 'letsencrypt',
  middlewares = [],
  entrypoint_http = 'web',
  entrypoint_https = 'websecure',
  include_http_redirect = true,
}) {
  const name = service_name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const labels = [];
  const notes = [];
  const extraMiddlewareDefs = [];

  labels.push(`traefik.enable=true`);

  // HTTPS router
  if (tls) {
    const middlewareList = [];

    // Process requested middlewares
    for (const mw of middlewares) {
      const mwKey = typeof mw === 'string' ? mw : mw.type;
      const mwOpts = typeof mw === 'object' ? mw : {};
      if (PRESET_MIDDLEWARES[mwKey]) {
        const preset = PRESET_MIDDLEWARES[mwKey](name, mwOpts);
        extraMiddlewareDefs.push(...preset.labels);
        notes.push(preset.note);
        middlewareList.push(`${name}-${mwKey.replace('-', '')}`);
      }
    }

    const mwChain = middlewareList.length > 0 ? middlewareList.join(',') : undefined;

    labels.push(`traefik.http.routers.${name}.rule=Host(\`${domain}\`)`);
    labels.push(`traefik.http.routers.${name}.entrypoints=${entrypoint_https}`);
    labels.push(`traefik.http.routers.${name}.tls=true`);
    labels.push(`traefik.http.routers.${name}.tls.certresolver=${certresolver}`);
    if (mwChain) labels.push(`traefik.http.routers.${name}.middlewares=${mwChain}`);
    labels.push(`traefik.http.services.${name}.loadbalancer.server.port=${port}`);

    // HTTP -> HTTPS redirect router
    if (include_http_redirect) {
      labels.push(`traefik.http.routers.${name}-http.rule=Host(\`${domain}\`)`);
      labels.push(`traefik.http.routers.${name}-http.entrypoints=${entrypoint_http}`);
      labels.push(`traefik.http.routers.${name}-http.middlewares=${name}-https-redirect`);
      labels.push(`traefik.http.middlewares.${name}-https-redirect.redirectscheme.scheme=https`);
      labels.push(`traefik.http.middlewares.${name}-https-redirect.redirectscheme.permanent=true`);
    }
  } else {
    labels.push(`traefik.http.routers.${name}.rule=Host(\`${domain}\`)`);
    labels.push(`traefik.http.routers.${name}.entrypoints=${entrypoint_http}`);
    labels.push(`traefik.http.services.${name}.loadbalancer.server.port=${port}`);
  }

  // Middleware definitions
  labels.push(...extraMiddlewareDefs);

  // Format as Docker Compose labels block
  const labelsYaml = labels.map(l => `      - "${l}"`).join('\n');
  const networksYaml = `      - default\n      - ${network}`;

  const composeSnippet = `    labels:\n${labelsYaml}\n    networks:\n${networksYaml}`;

  // Format for docker run
  const dockerRunFlags = labels.map(l => `-l "${l}"`).join(' \\\n  ');

  const networkSection = `\nnetworks:\n  default:\n    driver: bridge\n  ${network}:\n    external: true`;

  return {
    labels,
    compose_snippet: composeSnippet,
    network_section: networkSection,
    docker_run_flags: dockerRunFlags,
    notes,
    summary: `${labels.length} labels generated for service '${name}' → https://${domain} (port ${port})`,
  };
}

export function listMiddlewarePresets() {
  return Object.entries(PRESET_MIDDLEWARES).map(([key, fn]) => {
    const sample = fn('example');
    return {
      name: key,
      description: sample.note,
      labels_count: sample.labels.length,
    };
  });
}
