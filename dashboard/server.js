const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;

const port = Number(process.env.PORT || 8080);
const dataDirectory = process.env.DATA_DIRECTORY || '/app/data';
const chaosControllerUrl = process.env.CHAOS_CONTROLLER_URL || 'http://chaos-controller:4000';
const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://ai-service:8000';
const automationServiceUrl = process.env.AUTOMATION_SERVICE_URL || 'http://automation-service:8100';
const loadTestUrl = process.env.LOAD_TEST_URL || 'http://load-test-runner:8200';

const services = [
  { name: 'Payment', url: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3000/health' },
  { name: 'Order', url: process.env.ORDER_SERVICE_URL || 'http://order-service:3000/health' },
  { name: 'Notification', url: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3000/health' },
];

// ── SSRF protection ───────────────────────────────────────────────────────────
// Block private/loopback/metadata IP ranges and dangerous hostnames.
const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'ip6-localhost', 'ip6-loopback',
  '169.254.169.254',          // AWS/GCP/Azure metadata
  'metadata.google.internal', // GCP metadata
]);

// CIDR ranges that must be blocked
const BLOCKED_CIDRS = [
  // IPv4 loopback
  { base: 0x7f000000, mask: 0xff000000 },          // 127.0.0.0/8
  // IPv4 private
  { base: 0x0a000000, mask: 0xff000000 },          // 10.0.0.0/8
  { base: 0xac100000, mask: 0xfff00000 },          // 172.16.0.0/12
  { base: 0xc0a80000, mask: 0xffff0000 },          // 192.168.0.0/16
  // Link-local
  { base: 0xa9fe0000, mask: 0xffff0000 },          // 169.254.0.0/16
  // Unspecified / broadcast
  { base: 0x00000000, mask: 0xffffffff },          // 0.0.0.0
  { base: 0xffffffff, mask: 0xffffffff },          // 255.255.255.255
];

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isBlockedIpv4(ip) {
  const int = ipv4ToInt(ip);
  return BLOCKED_CIDRS.some(({ base, mask }) => (int & mask) === (base & mask));
}

function isBlockedIpv6(ip) {
  const norm = ip.toLowerCase().replace(/^\[|\]$/g, '');
  // Block loopback ::1, unspecified ::, link-local fe80::/10, ULA fc00::/7
  return (
    norm === '::1' ||
    norm === '::' ||
    norm.startsWith('fe80') ||
    norm.startsWith('fc') ||
    norm.startsWith('fd')
  );
}

/**
 * Returns an error string if the URL is unsafe, or null if it is allowed.
 */
function validateExternalUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'Invalid URL format.';
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'Only http:// and https:// URLs are allowed.';
  }

  const { hostname } = parsed;

  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    return 'That hostname is not allowed (blocked: localhost / metadata endpoints).';
  }

  // Pure IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    if (isBlockedIpv4(hostname)) {
      return 'Private, loopback, and reserved IP addresses are not allowed.';
    }
  }

  // IPv6 (bare or bracket-wrapped)
  if (hostname.includes(':') || hostname.startsWith('[')) {
    if (isBlockedIpv6(hostname)) {
      return 'Private or loopback IPv6 addresses are not allowed.';
    }
  }

  // Block Docker-internal default bridge (172.17.0.0/16 already caught by CIDR)
  // Block cloud metadata via hostname patterns
  if (/169\.254\.\d+\.\d+/.test(hostname)) {
    return 'Link-local addresses are not allowed.';
  }

  return null; // safe
}

// ── Registered servers store ──────────────────────────────────────────────────
// Stored in a SEPARATE writable location — the main data volume is read-only
// for the dashboard. SERVERS_FILE defaults to /app/servers/registered_servers.json
const serversFile = process.env.SERVERS_FILE || '/app/servers/registered_servers.json';

async function loadServers() {
  try {
    const raw = await fs.readFile(serversFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveServers(servers) {
  await fs.mkdir(path.dirname(serversFile), { recursive: true });
  const tmp = serversFile + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(servers, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, serversFile);
}

// ── Authentication & User store ─────────────────────────────────────────────
const usersFile = process.env.USERS_FILE || path.join(path.dirname(serversFile), 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'chaosguard_jwt_secret_dev_key_2026';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const computed = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

function createJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (signature !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function getAuthenticatedUser(request) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return verifyJwt(token);
}

function getDefaultUsers() {
  const opCreds = hashPassword('Operator123!');
  const viewCreds = hashPassword('Viewer123!');
  return [
    {
      id: 'usr_operator_001',
      name: 'Lead Operator',
      email: 'operator@chaosguard.io',
      role: 'Operator',
      salt: opCreds.salt,
      hash: opCreds.hash,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'usr_viewer_001',
      name: 'Resilience Viewer',
      email: 'viewer@chaosguard.io',
      role: 'Viewer',
      salt: viewCreds.salt,
      hash: viewCreds.hash,
      createdAt: new Date().toISOString(),
    },
  ];
}

async function loadUsers() {
  try {
    const raw = await fs.readFile(usersFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  const defaults = getDefaultUsers();
  await saveUsers(defaults).catch(() => {});
  return defaults;
}

async function saveUsers(users) {
  await fs.mkdir(path.dirname(usersFile), { recursive: true });
  const tmp = usersFile + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(users, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, usersFile);
}


// ── Health probe (used by both /verify and background monitor) ────────────────
// Uses https.request with manual IPv4 DNS resolution to bypass Node fetch/undici
// Happy Eyeballs bug on Docker Desktop WSL2 (IPv6 ENETUNREACH causes ETIMEDOUT).
async function probeServer(healthUrl) {
  const ssrfError = validateExternalUrl(healthUrl);
  if (ssrfError) {
    return { reachable: false, status: 'DOWN', httpStatus: null, latencyMs: 0, checkedAt: new Date().toISOString(), error: ssrfError, ok: false };
  }

  const started = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    const parsed = new URL(healthUrl);
    const isHttps = parsed.protocol === 'https:';
    const hostname = parsed.hostname;
    const port = parsed.port ? Number(parsed.port) : (isHttps ? 443 : 80);
    const pathQuery = (parsed.pathname || '/') + (parsed.search || '');

    // Resolve to IPv4 first — avoids undici Happy Eyeballs ENETUNREACH on WSL2
    let resolvedIp = hostname;
    try {
      const addrs = await dns.resolve4(hostname);
      if (addrs && addrs.length > 0) resolvedIp = addrs[0];
    } catch {
      // Not a hostname (bare IP) or DNS failed — use hostname as-is
    }

    // SSRF check on resolved IP (catches DNS rebinding)
    if (resolvedIp !== hostname) {
      const ipSsrfError = validateExternalUrl(`${parsed.protocol}//${resolvedIp}${parsed.pathname}`);
      if (ipSsrfError) {
        return { reachable: false, status: 'DOWN', httpStatus: null, latencyMs: Date.now() - started, checkedAt, error: `DNS resolved to blocked address: ${ipSsrfError}`, ok: false };
      }
    }

    const result = await new Promise((resolve) => {
      const lib = isHttps ? https : http;
      const req = lib.request({
        hostname: resolvedIp,
        port,
        path: pathQuery,
        method: 'GET',
        headers: {
          Host: hostname,
          'User-Agent': 'ChaosEngineeringDashboard/1.0 HealthProbe',
        },
        servername: hostname,   // SNI for TLS
        timeout: 6000,
      }, (res) => {
        res.resume(); // drain body
        const latencyMs = Date.now() - started;
        const httpStatus = res.statusCode;

        // Handle redirect — validate Location header for SSRF
        if (httpStatus >= 300 && httpStatus < 400) {
          const location = res.headers.location;
          if (location) {
            const redirError = validateExternalUrl(location);
            if (redirError) {
              resolve({ reachable: false, status: 'DOWN', httpStatus, latencyMs, checkedAt, error: `Redirect blocked: ${redirError}`, ok: false });
              return;
            }
          }
        }

        const ok = httpStatus >= 200 && httpStatus < 400;
        resolve({ reachable: ok, status: ok ? 'UP' : 'DOWN', httpStatus, latencyMs, checkedAt, error: null, ok });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ reachable: false, status: 'DOWN', httpStatus: null, latencyMs: Date.now() - started, checkedAt, error: 'Request timed out', ok: false });
      });

      req.on('error', (err) => {
        resolve({ reachable: false, status: 'DOWN', httpStatus: null, latencyMs: Date.now() - started, checkedAt, error: err.message, ok: false });
      });

      req.end();
    });

    return result;
  } catch (err) {
    return { reachable: false, status: 'DOWN', httpStatus: null, latencyMs: Date.now() - started, checkedAt, error: err.message, ok: false };
  }
}

// ── CSV helpers (unchanged) ───────────────────────────────────────────────────
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current); current = ''; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}

function csvToRecords(csv) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 1) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

async function readCsv(fileName) {
  try {
    return csvToRecords(await fs.readFile(path.join(dataDirectory, fileName), 'utf8'));
  } catch {
    return [];
  }
}

async function fetchJson(url, fallback) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
    return response.ok ? response.json() : fallback;
  } catch {
    return fallback;
  }
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function getDashboardData() {
  const [experiments, anomalies, resilience, analysisPayload, serviceHealth] = await Promise.all([
    fetchJson(`${chaosControllerUrl}/experiments`, []),
    readCsv('anomaly_results.csv'),
    readCsv('resilience_results.csv'),
    fetchJson(`${aiServiceUrl}/analysis`, { analyses: [] }),
    Promise.all(services.map(async (service) => ({
      name: service.name,
      status: (await fetchJson(service.url, { status: 'DOWN' })).status || 'DOWN',
    }))),
  ]);

  const anomalyById = new Map(anomalies.map((item) => [item.experimentId, item]));
  const resilienceById = new Map(resilience.map((item) => [item.experimentId, item]));
  const analysisById = new Map((analysisPayload.analyses || []).map((item) => [item.experimentId, item]));

  const mergedExperiments = experiments.map((experiment) => {
    const anomaly = anomalyById.get(experiment.experimentId) || {};
    const resilienceItem = resilienceById.get(experiment.experimentId) || {};
    return {
      ...experiment,
      affectedServiceCount: asNumber(anomaly.affectedServiceCount, experiment.affectedServices?.length || 1),
      cascadingFailure: anomaly.cascadingFailure === '1' || anomaly.cascadingFailure === 'true' || experiment.cascadingFailure === true,
      anomalyLabel: anomaly.anomalyLabel || resilienceItem.anomalyLabel || 'UNKNOWN',
      anomalyScore: asNumber(anomaly.anomalyScore, null),
      resilienceScore: asNumber(resilienceItem.resilienceScore, null),
      riskLevel: resilienceItem.riskLevel || 'UNKNOWN',
      analysis: analysisById.get(experiment.experimentId) || null,
    };
  });

  const riskDistribution = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].reduce((distribution, level) => {
    distribution[level] = mergedExperiments.filter((item) => item.riskLevel === level).length;
    return distribution;
  }, {});
  const anomaliesCount = mergedExperiments.filter((item) => item.anomalyLabel === 'ANOMALY').length;

  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      totalExperiments: mergedExperiments.length,
      totalAnomalies: anomaliesCount,
      anomalyPercentage: mergedExperiments.length
        ? Number(((anomaliesCount / mergedExperiments.length) * 100).toFixed(1))
        : 0,
      riskDistribution,
    },
    services: serviceHealth,
    experiments: mergedExperiments,
  };
}

// ── Input sanitisation helpers ────────────────────────────────────────────────
const ALLOWED_ENVIRONMENTS = new Set(['Development', 'Staging', 'Production']);

function sanitiseString(value, maxLength = 120) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function validateServerPayload(body) {
  const name = sanitiseString(body.name, 80);
  const environment = sanitiseString(body.environment, 20);
  const healthUrl = sanitiseString(body.healthUrl, 512);

  if (!name) return { error: 'name is required.' };
  if (!ALLOWED_ENVIRONMENTS.has(environment)) {
    return { error: `environment must be one of: ${[...ALLOWED_ENVIRONMENTS].join(', ')}.` };
  }
  const ssrfError = validateExternalUrl(healthUrl);
  if (ssrfError) return { error: ssrfError };

  return { name, environment, healthUrl };
}

// ── Static file content types ─────────────────────────────────────────────────
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

function sendJson(response, statusCode, data) {
  if (response.headersSent) return;
  response.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(typeof data === 'string' ? data : JSON.stringify(data));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body;
}

function parseBody(raw) {
  const text = raw.trim();
  if (!text) throw new SyntaxError('Request body is empty');
  return JSON.parse(text);
}

// ── HTTP server ───────────────────────────────────────────────────────────────
http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const { pathname } = requestUrl;
    const method = request.method.toUpperCase();

    // ── Health ──────────────────────────────────────────────────────────────
    if (pathname === '/health') {
      return sendJson(response, 200, { service: 'chaos-dashboard', status: 'UP' });
    }

    // ── Authentication endpoints ─────────────────────────────────────────────
    if (pathname === '/api/auth/register' && method === 'POST') {
      let body;
      try { body = parseBody(await readBody(request)); }
      catch { return sendJson(response, 400, { error: 'Invalid JSON body.' }); }

      const name = sanitiseString(body.name, 80);
      const email = sanitiseString(body.email, 120).toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';
      const role = body.role === 'Viewer' ? 'Viewer' : 'Operator';

      if (!name || name.length < 2) {
        return sendJson(response, 400, { error: 'Full name is required (at least 2 characters).' });
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJson(response, 400, { error: 'Valid email address is required.' });
      }
      if (!password || password.length < 6) {
        return sendJson(response, 400, { error: 'Password must be at least 6 characters.' });
      }

      const users = await loadUsers();
      if (users.some((u) => u.email === email)) {
        return sendJson(response, 409, { error: 'An account with this email already exists.' });
      }

      const { salt, hash } = hashPassword(password);
      const user = {
        id: `usr_${crypto.randomUUID()}`,
        name,
        email,
        role,
        salt,
        hash,
        createdAt: new Date().toISOString(),
      };

      users.push(user);
      await saveUsers(users);

      const token = createJwt({ id: user.id, name: user.name, email: user.email, role: user.role });
      return sendJson(response, 201, {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      let body;
      try { body = parseBody(await readBody(request)); }
      catch { return sendJson(response, 400, { error: 'Invalid JSON body.' }); }

      const email = sanitiseString(body.email, 120).toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';

      if (!email || !password) {
        return sendJson(response, 400, { error: 'Email and password are required.' });
      }

      const users = await loadUsers();
      const user = users.find((u) => u.email === email);
      if (!user || !verifyPassword(password, user.salt, user.hash)) {
        return sendJson(response, 401, { error: 'Invalid email or password.' });
      }

      const token = createJwt({ id: user.id, name: user.name, email: user.email, role: user.role });
      return sendJson(response, 200, {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = getAuthenticatedUser(request);
      if (!user) {
        return sendJson(response, 401, { error: 'Unauthorized or session expired.' });
      }
      return sendJson(response, 200, { user });
    }


    // ── Dashboard data ──────────────────────────────────────────────────────
    if (pathname === '/api/dashboard' && method === 'GET') {
      const data = await getDashboardData();
      return sendJson(response, 200, data);
    }

    // ── Registered servers: list ────────────────────────────────────────────
    if (pathname === '/api/servers' && method === 'GET') {
      const servers = await loadServers();
      return sendJson(response, 200, { servers });
    }

    // ── Registered servers: verify (probe only, no save) ────────────────────
    if (pathname === '/api/servers/verify' && method === 'POST') {
      let body;
      try { body = parseBody(await readBody(request)); }
      catch { return sendJson(response, 400, { error: 'Invalid JSON body.' }); }
      const healthUrl = sanitiseString(body.healthUrl, 512);
      const ssrfError = validateExternalUrl(healthUrl);
      if (ssrfError) return sendJson(response, 400, { error: ssrfError });
      const result = await probeServer(healthUrl);
      return sendJson(response, 200, result);
    }

    // ── Registered servers: create ──────────────────────────────────────────
    if (pathname === '/api/servers' && method === 'POST') {
      const reqUser = getAuthenticatedUser(request);
      if (!reqUser || reqUser.role !== 'Operator') {
        return sendJson(response, 403, { error: 'Operator role required to register servers.' });
      }
      let body;
      try { body = parseBody(await readBody(request)); }
      catch { return sendJson(response, 400, { error: 'Invalid JSON body.' }); }
      const validated = validateServerPayload(body);
      if (validated.error) return sendJson(response, 400, { error: validated.error });

      const servers = await loadServers();
      const probe = await probeServer(validated.healthUrl);

      const server = {
        id: crypto.randomUUID(),
        name: validated.name,
        environment: validated.environment,
        healthUrl: validated.healthUrl,
        registeredAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
        status: probe.ok ? 'UP' : 'DOWN',
        lastHttpStatus: probe.status,
        lastLatencyMs: probe.latencyMs,
        lastError: probe.error,
        history: [
          {
            checkedAt: new Date().toISOString(),
            status: probe.ok ? 'UP' : 'DOWN',
            httpStatus: probe.status,
            latencyMs: probe.latencyMs,
          },
        ],
      };

      servers.push(server);
      await saveServers(servers);
      return sendJson(response, 201, server);
    }

    // ── Registered servers: refresh health ─────────────────────────────────
    if (pathname.startsWith('/api/servers/') && pathname.endsWith('/check') && method === 'POST') {
      const id = pathname.split('/')[3];
      const servers = await loadServers();
      const idx = servers.findIndex((s) => s.id === id);
      if (idx === -1) return sendJson(response, 404, { error: 'Server not found.' });

      const probe = await probeServer(servers[idx].healthUrl);
      const checkedAt = new Date().toISOString();

      servers[idx] = {
        ...servers[idx],
        lastCheckedAt: checkedAt,
        status: probe.ok ? 'UP' : 'DOWN',
        lastHttpStatus: probe.status,
        lastLatencyMs: probe.latencyMs,
        lastError: probe.error,
        history: [
          { checkedAt, status: probe.ok ? 'UP' : 'DOWN', httpStatus: probe.status, latencyMs: probe.latencyMs },
          ...(servers[idx].history || []).slice(0, 49), // keep last 50
        ],
      };
      await saveServers(servers);
      return sendJson(response, 200, servers[idx]);
    }

    // ── Registered servers: delete ──────────────────────────────────────────
    if (pathname.startsWith('/api/servers/') && method === 'DELETE') {
      const reqUser = getAuthenticatedUser(request);
      if (!reqUser || reqUser.role !== 'Operator') {
        return sendJson(response, 403, { error: 'Operator role required to delete servers.' });
      }
      const id = pathname.split('/')[3];
      if (!id) return sendJson(response, 400, { error: 'Missing server id.' });
      const servers = await loadServers();
      const filtered = servers.filter((s) => s.id !== id);
      if (filtered.length === servers.length) return sendJson(response, 404, { error: 'Server not found.' });
      await saveServers(filtered);
      return sendJson(response, 200, { ok: true });
    }

    // ── Load test proxy (all /api/load-tests/* routes) ─────────────────────
    if (pathname.startsWith('/api/load-tests')) {
      // Require Operator role for any mutating operations
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const reqUser = getAuthenticatedUser(request);
        if (!reqUser || reqUser.role !== 'Operator') {
          return sendJson(response, 403, { error: 'Operator role required to manage load tests.' });
        }
      }
      try {
        const upstreamPath = pathname; // runner uses same path
        const upstreamUrl = `${loadTestUrl}${upstreamPath}${requestUrl.search || ''}`;
        const opts = { method, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) };
        if (['POST', 'PUT', 'PATCH'].includes(method)) opts.body = await readBody(request);
        const upstream = await fetch(upstreamUrl, opts);
        const text = await upstream.text();
        return sendJson(response, upstream.status, text);
      } catch {
        return sendJson(response, 503, { error: 'Load test runner is unavailable' });
      }
    }

    // ── Proxy: POST /api/run-full-experiment ────────────────────────────────
    if (pathname === '/api/run-full-experiment' && method === 'POST') {
      const reqUser = getAuthenticatedUser(request);
      if (!reqUser || reqUser.role !== 'Operator') {
        return sendJson(response, 403, { error: 'Operator role required to run experiments.' });
      }
      const body = await readBody(request);
      try {
        const upstream = await fetch(`${automationServiceUrl}/run-full-experiment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(10000),
        });
        const text = await upstream.text();
        return sendJson(response, upstream.status, text);
      } catch {
        return sendJson(response, 503, { detail: 'Automation service is unavailable' });
      }
    }

    // ── Proxy: GET /api/run-full-experiment/:id ─────────────────────────────
    if (pathname.startsWith('/api/run-full-experiment/') && method === 'GET') {
      const runId = pathname.split('/').pop();
      try {
        const upstream = await fetch(
          `${automationServiceUrl}/run-full-experiment/${encodeURIComponent(runId)}`,
          { signal: AbortSignal.timeout(5000) },
        );
        const text = await upstream.text();
        return sendJson(response, upstream.status, text);
      } catch {
        return sendJson(response, 503, { detail: 'Automation service is unavailable' });
      }
    }

    // ── Static files ────────────────────────────────────────────────────────
    const requestedFile = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    const filePath = path.resolve(__dirname, 'public', requestedFile);
    const publicRoot = path.resolve(__dirname, 'public');

    if (!filePath.startsWith(publicRoot)) {
      if (!response.headersSent) response.writeHead(403);
      return response.end();
    }

    try {
      const content = await fs.readFile(filePath);
      if (!response.headersSent) {
        response.writeHead(200, {
          'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
        });
      }
      return response.end(content);
    } catch {
      // SPA fallback — serve index.html for any unknown path so React Router works
      try {
        const index = await fs.readFile(path.join(publicRoot, 'index.html'));
        if (!response.headersSent) response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return response.end(index);
      } catch {
        if (!response.headersSent) response.writeHead(404);
        return response.end('Not found');
      }
    }
  } catch (topLevelError) {
    console.error('Unhandled request error:', topLevelError);
    if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json' });
    if (!response.writableEnded) response.end(JSON.stringify({ error: 'Internal server error' }));
  }
}).listen(port, '0.0.0.0', () => console.log(`chaos dashboard listening on ${port}`));

// ── Background server health monitor ─────────────────────────────────────────
// Polls every 30 seconds — only the backend probes, never the browser
const MONITOR_INTERVAL_MS = 30_000;

async function runMonitorCycle() {
  const servers = await loadServers();
  if (servers.length === 0) return;
  let changed = false;
  for (const server of servers) {
    try {
      const probe = await probeServer(server.healthUrl);
      const checkedAt = probe.checkedAt;
      server.lastCheckedAt = checkedAt;
      server.status = probe.status;
      server.lastHttpStatus = probe.httpStatus;
      server.lastLatencyMs = probe.latencyMs;
      server.lastError = probe.error;
      server.history = [
        { checkedAt, status: probe.status, httpStatus: probe.httpStatus, latencyMs: probe.latencyMs },
        ...(server.history || []).slice(0, 49),
      ];
      changed = true;
    } catch {
      // individual probe failure — skip, try next cycle
    }
  }
  if (changed) await saveServers(servers);
}

// Start monitor after a 10s warm-up (let WSL2 network stabilise)
setTimeout(() => {
  runMonitorCycle().catch(() => {});
  setInterval(() => runMonitorCycle().catch(() => {}), MONITOR_INTERVAL_MS);
}, 10_000);
