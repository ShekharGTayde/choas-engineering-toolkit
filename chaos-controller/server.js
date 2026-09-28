const express = require('express');
const Docker = require('dockerode');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// ── JWT auth (shared secret with dashboard) ──────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'chaosguard_jwt_secret_dev_key_2026';

function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Express middleware — rejects requests that do not carry a valid JWT whose
 * role is exactly 'Operator'.  Used as the SECOND safety check on fault
 * injection (after the source check below).
 */
function requireOperator(request, response, next) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }
  const user = verifyJwt(authHeader.slice(7).trim());
  if (!user) {
    return response.status(401).json({ error: 'Invalid or expired token.' });
  }
  if (user.role !== 'Operator') {
    return response.status(403).json({ error: 'Operator role required to run experiments.' });
  }
  request.user = user; // attach for downstream use (userId logging)
  return next();
}

const app = express();
const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });
const port = process.env.PORT || 4000;
const maxDurationSeconds = 3600;
const dataDirectory = path.join(__dirname, 'data');
const experimentsFile = path.join(dataDirectory, 'experiments.json');
const dependencyTimeoutMilliseconds = 2000;
const impactProbeCount = 10;
let experiments = [];
let experimentInProgress = false;

// ── Service registry ─────────────────────────────────────────────────────────
// Each entry carries a 'source' tag.  The source-check safety guard (Phase 5)
// rejects any experiment request whose resolved source is not 'docker-compose'.
// When Phase 3's discovery service is built it will populate this registry
// dynamically; until then all known targets are internal docker-compose services.
const services = {
  'payment-service':     { container: 'payment-service-container',     source: 'docker-compose' },
  'order-service':       { container: 'order-service-container',       source: 'docker-compose' },
  'notification-service':{ container: 'notification-service-container', source: 'docker-compose' }
};
const serviceUrls = {
  'payment-service': 'http://payment-service:3000',
  'order-service': 'http://order-service:3000',
  'notification-service': 'http://notification-service:3000'
};
const failureTypes = new Set(['stop', 'restart', 'latency']);
const supportedLatencyMilliseconds = new Set([500, 1000, 2000, 5000]);

app.use(express.json());

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function loadExperiments() {
  try {
    const fileContents = await fs.readFile(experimentsFile, 'utf8');
    const savedExperiments = JSON.parse(fileContents);
    experiments = Array.isArray(savedExperiments) ? savedExperiments : [];
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    await saveExperiments();
  }
}

async function saveExperiments() {
  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.writeFile(experimentsFile, `${JSON.stringify(experiments, null, 2)}\n`);
}

async function collectOrderProbe() {
  const startedAt = Date.now();

  try {
    const orderResponse = await fetch('http://order-service:3000/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: `experiment-${crypto.randomUUID()}`, amount: 1 }),
      signal: AbortSignal.timeout(dependencyTimeoutMilliseconds)
    });
    const responseTime = Date.now() - startedAt;
    return {
      successful: orderResponse.ok,
      responseTime
    };
  } catch (error) {
    return {
      successful: false,
      responseTime: Date.now() - startedAt
    };
  }
}

function addAffectedServices(experiment) {
  const affectedServices = new Set([experiment.targetService]);

  if (experiment.failedRequests > 0 && experiment.targetService === 'payment-service') {
    affectedServices.add('order-service');
  }

  if (experiment.failedRequests > 0 && experiment.targetService === 'notification-service') {
    affectedServices.add('payment-service');
    affectedServices.add('order-service');
  }

  experiment.affectedServices = [...affectedServices];
  experiment.cascadingFailure = experiment.affectedServices.length > 1;
}

function createExperimentRecord(targetService, failureType, durationSeconds, latencyMilliseconds, userId) {
  const nowIso = new Date().toISOString();
  return {
    experimentId: `EXP-${String(experiments.length + 1).padStart(3, '0')}`,
    experimentStartTime: nowIso,
    experiment_start: nowIso,
    failureStartTime: null,
    fault_injected: null,
    recoveryTime: null,
    fault_removed: null,
    targetService,
    target: targetService,
    targetSource: services[targetService] ? services[targetService].source : 'docker-compose',
    failureType,
    injectedLatencyMilliseconds: failureType === 'latency' ? Number(latencyMilliseconds) : 0,
    configuredFailureDuration: durationSeconds,
    actualRecoveryDuration: null,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    errorRate: 0,
    averageResponseTime: 0,
    peakResponseTime: 0,
    affectedServices: [targetService],
    cascadingFailure: false,
    experimentResult: 'RUNNING',
    experimentExecutionStatus: null,
    userId: userId || null,
    triggeredBy: userId || null
  };
}

function applyImpactMetrics(experiment, probes) {
  const responseTimes = probes.map((probe) => probe.responseTime);
  experiment.totalRequests = probes.length;
  experiment.successfulRequests = probes.filter((probe) => probe.successful).length;
  experiment.failedRequests = experiment.totalRequests - experiment.successfulRequests;
  experiment.errorRate = experiment.totalRequests === 0
    ? 0
    : Number(((experiment.failedRequests / experiment.totalRequests) * 100).toFixed(2));
  experiment.averageResponseTime = responseTimes.length === 0
    ? 0
    : Number((responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length).toFixed(2));
  experiment.peakResponseTime = responseTimes.length === 0 ? 0 : Math.max(...responseTimes);
  addAffectedServices(experiment);
}

// ── Docker Discovery Service ────────────────────────────────────────────────
async function discoverDockerTargets() {
  const discovered = [];
  let discoveryWarning = null;
  try {
    const filters = JSON.stringify({ label: ['chaosguard.target=true'] });
    const containers = await docker.listContainers({ all: true, filters });
    if (Array.isArray(containers)) {
      for (const info of containers) {
        const labels = info.Labels || {};
        const serviceName = labels['chaosguard.name'] || info.Names?.[0]?.replace(/^\//, '').replace(/-container$/, '') || info.Id.slice(0, 12);
        const containerName = info.Names?.[0]?.replace(/^\//, '') || serviceName;
        const port = labels['chaosguard.port'] ? Number(labels['chaosguard.port']) : 3000;
        const state = (info.State || '').toLowerCase();
        const status = (state === 'running' || info.Status?.toLowerCase().includes('up')) ? 'UP' : 'DOWN';

        services[serviceName] = {
          container: containerName,
          source: 'docker-compose',
          port,
          containerId: info.Id
        };
        serviceUrls[serviceName] = `http://${serviceName}:${port}`;

        discovered.push({
          id: `target_${serviceName}`,
          name: serviceName,
          container: containerName,
          containerId: info.Id,
          source: 'docker-compose',
          monitorOnly: false,
          status,
          state: info.State || status,
          port,
          url: `http://${serviceName}:${port}/health`,
          discoveredAt: new Date().toISOString()
        });
      }
    }
  } catch (err) {
    discoveryWarning = `Docker discovery unavailable: ${err.message}`;
    console.warn(discoveryWarning);
  }

  // Ensure default targets are present even if Docker socket list fails or has no labels
  for (const [name, config] of Object.entries(services)) {
    if (!discovered.some(d => d.name === name)) {
      discovered.push({
        id: `target_${name}`,
        name,
        container: config.container,
        source: 'docker-compose',
        monitorOnly: false,
        status: discoveryWarning ? 'UNKNOWN' : 'UP',
        port: 3000,
        url: serviceUrls[name] ? `${serviceUrls[name]}/health` : `http://${name}:3000/health`,
        discoveredAt: new Date().toISOString()
      });
    }
  }

  return { targets: discovered, warning: discoveryWarning };
}

// ── Endpoints ────────────────────────────────────────────────────────────────
// /health remains unauthenticated for docker engine & orchestrator healthchecks
app.get('/health', (request, response) => {
  response.json({ status: 'UP' });
});

// Docker Discovery Service endpoint
app.get('/containers/json', requireOperator, async (request, response) => {
  try {
    const rawFilters = request.query.filters;
    const filterOptions = { all: true };
    if (rawFilters) {
      filterOptions.filters = typeof rawFilters === 'string' ? rawFilters : JSON.stringify(rawFilters);
    } else {
      filterOptions.filters = JSON.stringify({ label: ['chaosguard.target=true'] });
    }
    const containers = await docker.listContainers(filterOptions);
    return response.json(containers);
  } catch (err) {
    const fallback = await discoverDockerTargets();
    return response.status(503).json({
      error: `Docker container listing failed: ${err.message}`,
      fallbackTargets: fallback.targets,
      warning: fallback.warning
    });
  }
});

// Target discovery endpoints
app.post('/targets/discover', requireOperator, async (request, response) => {
  const discovery = await discoverDockerTargets();
  return response.json({
    count: discovery.targets.length,
    targets: discovery.targets,
    degraded: Boolean(discovery.warning),
    warning: discovery.warning,
    discoveredAt: new Date().toISOString()
  });
});

app.get('/targets', requireOperator, async (request, response) => {
  const discovery = await discoverDockerTargets();
  response.set('X-ChaosGuard-Discovery', discovery.warning ? 'fallback' : 'docker');
  return response.json(discovery.targets);
});

// All other endpoints are gated behind Operator-role JWT
app.get('/', requireOperator, (request, response) => {
  response.json({
    service: 'chaos-controller',
    status: 'UP',
    supportedFailureTypes: [...failureTypes],
    targetServices: Object.keys(services),
    supportedLatencyMilliseconds: [...supportedLatencyMilliseconds]
  });
});

app.get('/experiments', requireOperator, (request, response) => {
  response.json(experiments);
});

app.get('/experiments/:id', requireOperator, (request, response) => {
  const experiment = experiments.find((savedExperiment) => savedExperiment.experimentId === request.params.id);

  if (!experiment) {
    return response.status(404).json({ error: 'Experiment not found' });
  }

  return response.json(experiment);
});

app.post('/experiments', async (request, response) => {
  const { failureType, durationSeconds, latencyMilliseconds } = request.body || {};
  const targetService = request.body.target || request.body.targetService;
  const requestedSource = request.body.source;

  // ── Safety Guard 1 (FIRST): Source check before role check ─────────────────
  // Order matters: source check first, then role check, so rejected-source
  // responses don't leak whether the caller had permission.
  const serviceEntry = services[targetService];
  const resolvedSource = serviceEntry ? serviceEntry.source : null;

  if (!targetService || !serviceEntry || resolvedSource !== 'docker-compose' ||
      (requestedSource && requestedSource !== resolvedSource)) {
    return response.status(403).json({
      error: `Safety guard violation: target '${targetService || 'unknown'}' is not an authorized docker-compose target. Fault injection is strictly prohibited on non-docker-compose targets.`
    });
  }

  // ── Safety Guard 2 (SECOND): Operator-role guard ───────────────────────────
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }
  const user = verifyJwt(authHeader.slice(7).trim());
  if (!user) {
    return response.status(401).json({ error: 'Invalid or expired token.' });
  }
  if (user.role !== 'Operator') {
    return response.status(403).json({ error: 'Operator role required to run experiments.' });
  }
  request.user = user;

  const duration = Number(durationSeconds);

  if (!failureTypes.has(failureType)) {
    return response.status(400).json({ error: 'failureType must be stop, restart, or latency' });
  }

  if (failureType === 'latency' && !supportedLatencyMilliseconds.has(Number(latencyMilliseconds))) {
    return response.status(400).json({ error: 'latencyMilliseconds must be 500, 1000, 2000, or 5000 for latency experiments' });
  }

  if (!Number.isInteger(duration) || duration < 1 || duration > maxDurationSeconds) {
    return response.status(400).json({ error: `durationSeconds must be a whole number from 1 to ${maxDurationSeconds}` });
  }

  if (experimentInProgress) {
    return response.status(409).json({ error: 'Another experiment is already in progress' });
  }

  const experiment = createExperimentRecord(targetService, failureType, duration, latencyMilliseconds, request.user.id);
  experiments.push(experiment);
  experimentInProgress = true;

  try {
    const container = docker.getContainer(services[targetService].container);
    const containerInfo = await container.inspect();
    const isRunning = containerInfo?.State?.Running === true;
    if ((failureType === 'stop' || failureType === 'restart') && !isRunning) {
      throw Object.assign(
        new Error(`Container '${services[targetService].container}' is already stopped; experiment was not injected.`),
        { code: 'CONTAINER_NOT_RUNNING', statusCode: 409 }
      );
    }
    if (failureType === 'latency' && !isRunning) {
      throw Object.assign(
        new Error(`Container '${services[targetService].container}' is not running; latency injection was not applied.`),
        { code: 'CONTAINER_NOT_RUNNING', statusCode: 409 }
      );
    }
    const probes = [await collectOrderProbe()];
    let latencyEnabled = false;
    const faultInjectedTime = new Date().toISOString();
    experiment.failureStartTime = faultInjectedTime;
    experiment.fault_injected = faultInjectedTime;

    if (failureType === 'stop') {
      await container.stop();
      const probeInterval = (duration * 1000) / (impactProbeCount - 2);
      const duringFailureProbes = Array.from({ length: impactProbeCount - 2 }, async (_, index) => {
        await wait(probeInterval * (index + 1));
        return collectOrderProbe();
      });
      await wait(duration * 1000);
      await container.start();
      probes.push(...await Promise.all(duringFailureProbes), await collectOrderProbe());
    } else if (failureType === 'restart') {
      await container.restart();
      await wait(duration * 1000);
      probes.push(...await Promise.all(
        Array.from({ length: impactProbeCount - 1 }, () => collectOrderProbe())
      ));
    } else {
      await fetch(`${serviceUrls[targetService]}/chaos/latency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latencyMilliseconds }),
        signal: AbortSignal.timeout(dependencyTimeoutMilliseconds)
      });
      latencyEnabled = true;
      const latencyProbes = Array.from({ length: impactProbeCount - 1 }, async (_, index) => {
        await wait((duration * 1000 * (index + 1)) / impactProbeCount);
        return collectOrderProbe();
      });
      await wait(duration * 1000);
      await fetch(`${serviceUrls[targetService]}/chaos/latency`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(dependencyTimeoutMilliseconds)
      });
      latencyEnabled = false;
      probes.push(...await Promise.all(latencyProbes), await collectOrderProbe());
    }

    const faultRemovedTime = new Date().toISOString();
    experiment.recoveryTime = faultRemovedTime;
    experiment.fault_removed = faultRemovedTime;
    experiment.actualRecoveryDuration = Number(
      ((Date.parse(experiment.recoveryTime) - Date.parse(experiment.failureStartTime)) / 1000).toFixed(2)
    );
    applyImpactMetrics(experiment, probes);
    experiment.experimentResult = 'SUCCESS';
    experiment.experimentExecutionStatus = 'COMPLETED';
    await saveExperiments();
    return response.status(201).json(experiment);
  } catch (error) {
    const failureRecoveryTime = new Date().toISOString();
    experiment.recoveryTime = failureRecoveryTime;
    experiment.fault_removed = failureRecoveryTime;
    experiment.actualRecoveryDuration = Number(
      ((Date.parse(experiment.recoveryTime) - Date.parse(experiment.failureStartTime || experiment.experimentStartTime)) / 1000).toFixed(2)
    );
    experiment.experimentResult = 'FAILED';
    experiment.experimentExecutionStatus = 'FAILED';
    experiment.error = error.message;
    await saveExperiments();
    return response.status(error.statusCode || 500).json(experiment);
  } finally {
    if (failureType === 'latency') {
      try {
        await fetch(`${serviceUrls[targetService]}/chaos/latency`, {
          method: 'DELETE',
          signal: AbortSignal.timeout(dependencyTimeoutMilliseconds)
        });
      } catch (cleanupError) {
        console.error(`Latency cleanup failed for ${targetService}:`, cleanupError.message);
      }
    }
    experimentInProgress = false;
  }
});

loadExperiments()
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`chaos-controller listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Unable to load experiment data:', error);
    process.exitCode = 1;
  });
