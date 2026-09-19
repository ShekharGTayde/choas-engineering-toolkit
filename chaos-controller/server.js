const express = require('express');
const Docker = require('dockerode');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

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

const services = {
  'payment-service': 'payment-service-container',
  'order-service': 'order-service-container',
  'notification-service': 'notification-service-container'
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

function createExperimentRecord(targetService, failureType, durationSeconds, latencyMilliseconds) {
  return {
    experimentId: `EXP-${String(experiments.length + 1).padStart(3, '0')}`,
    experimentStartTime: new Date().toISOString(),
    failureStartTime: null,
    recoveryTime: null,
    targetService,
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
    experimentExecutionStatus: null
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

app.get('/health', (request, response) => {
  response.json({ status: 'UP' });
});

app.get('/', (request, response) => {
  response.json({
    service: 'chaos-controller',
    status: 'UP',
    supportedFailureTypes: [...failureTypes],
    targetServices: Object.keys(services)
    ,supportedLatencyMilliseconds: [...supportedLatencyMilliseconds]
  });
});

app.get('/experiments', (request, response) => {
  response.json(experiments);
});

app.get('/experiments/:id', (request, response) => {
  const experiment = experiments.find((savedExperiment) => savedExperiment.experimentId === request.params.id);

  if (!experiment) {
    return response.status(404).json({ error: 'Experiment not found' });
  }

  return response.json(experiment);
});

app.post('/experiments', async (request, response) => {
  const { targetService, failureType, durationSeconds, latencyMilliseconds } = request.body;
  const duration = Number(durationSeconds);

  if (!Object.hasOwn(services, targetService)) {
    return response.status(400).json({ error: 'targetService must be payment-service, order-service, or notification-service' });
  }

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

  const experiment = createExperimentRecord(targetService, failureType, duration, latencyMilliseconds);
  experiments.push(experiment);
  experimentInProgress = true;

  try {
    const container = docker.getContainer(services[targetService]);
    const probes = [await collectOrderProbe()];
    let latencyEnabled = false;
    experiment.failureStartTime = new Date().toISOString();

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

    experiment.recoveryTime = new Date().toISOString();
    experiment.actualRecoveryDuration = Number(
      ((Date.parse(experiment.recoveryTime) - Date.parse(experiment.failureStartTime)) / 1000).toFixed(2)
    );
    applyImpactMetrics(experiment, probes);
    experiment.experimentResult = 'SUCCESS';
    experiment.experimentExecutionStatus = 'COMPLETED';
    await saveExperiments();
    return response.status(201).json(experiment);
  } catch (error) {
    experiment.recoveryTime = new Date().toISOString();
    experiment.actualRecoveryDuration = Number(
      ((Date.parse(experiment.recoveryTime) - Date.parse(experiment.failureStartTime || experiment.experimentStartTime)) / 1000).toFixed(2)
    );
    experiment.experimentResult = 'FAILED';
    experiment.experimentExecutionStatus = 'FAILED';
    experiment.error = error.message;
    await saveExperiments();
    return response.status(500).json(experiment);
  } finally {
    if (failureType === 'latency') {
      await fetch(`${serviceUrls[targetService]}/chaos/latency`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(dependencyTimeoutMilliseconds)
      }).catch(() => {});
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
