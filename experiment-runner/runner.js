const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const controllerUrl = process.env.CONTROLLER_URL || 'http://localhost:4000';
const orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://localhost:3001';
const prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const dataFile = path.join(__dirname, '..', 'data', 'experiments.json');
const csvFile = path.join(__dirname, '..', 'data', 'experiments.csv');
const requestTimeoutMilliseconds = 5000;

const services = ['payment-service', 'order-service', 'notification-service'];
const failureTypes = ['stop', 'restart'];
const supportedFailureTypes = [...failureTypes, 'latency'];
const durations = [5, 10, 20, 30, 60];
const trafficLoads = [10, 25, 50, 100];
const latencyTestScenarios = [
  { targetService: 'payment-service', failureType: 'latency', durationSeconds: 5, trafficRequests: 10, latencyMilliseconds: 500 },
  { targetService: 'order-service', failureType: 'latency', durationSeconds: 5, trafficRequests: 10, latencyMilliseconds: 1000 },
  { targetService: 'notification-service', failureType: 'latency', durationSeconds: 5, trafficRequests: 10, latencyMilliseconds: 2000 },
  { targetService: 'payment-service', failureType: 'latency', durationSeconds: 5, trafficRequests: 10, latencyMilliseconds: 5000 },
  { targetService: 'order-service', failureType: 'latency', durationSeconds: 5, trafficRequests: 10, latencyMilliseconds: 2000 }
];

function buildScenarios() {
  const generatedScenarios = [];

  for (const targetService of services) {
    for (const failureType of failureTypes) {
      for (const durationSeconds of durations) {
        for (const trafficRequests of trafficLoads) {
          generatedScenarios.push({
            targetService,
            failureType,
            durationSeconds,
            trafficRequests
          });
        }
      }
    }
  }

  for (let index = 0; index < 30; index += 1) {
    generatedScenarios.push({
      targetService: services[index % services.length],
      failureType: failureTypes[index % failureTypes.length],
      durationSeconds: durations[index % durations.length],
      trafficRequests: trafficLoads[index % trafficLoads.length]
    });
  }

  return generatedScenarios;
}

const scenarios = buildScenarios();
const testExperimentCount = 5;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getJson(url, options = {}) {
  const { timeoutMilliseconds = requestTimeoutMilliseconds, ...requestOptions } = options;
  const response = await fetch(url, {
    ...requestOptions,
    signal: AbortSignal.timeout(timeoutMilliseconds)
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${url} returned ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function verifyServicesHealthy() {
  const serviceUrls = [
    `${orderServiceUrl}/health`,
    'http://localhost:3000/health',
    'http://localhost:3002/health'
  ];

  for (const url of serviceUrls) {
    const result = await getJson(url);
    if (result.status !== 'UP') {
      throw new Error(`${url} is not healthy`);
    }
  }
}

async function queryPrometheus(query) {
  const encodedQuery = encodeURIComponent(query);
  const result = await getJson(`${prometheusUrl}/api/v1/query?query=${encodedQuery}`);
  const value = result.data.result[0]?.value?.[1];
  return value === undefined ? 0 : Number(value);
}

async function collectPrometheusSnapshot() {
  return {
    timestamp: new Date().toISOString(),
    orderRequests: await queryPrometheus('sum(http_requests_total{job="order-service"})'),
    orderErrors: await queryPrometheus('sum(http_errors_total{job="order-service"})'),
    paymentRequests: await queryPrometheus('sum(http_requests_total{job="payment-service"})'),
    paymentErrors: await queryPrometheus('sum(http_errors_total{job="payment-service"})'),
    notificationRequests: await queryPrometheus('sum(http_requests_total{job="notification-service"})'),
    notificationErrors: await queryPrometheus('sum(http_errors_total{job="notification-service"})'),
    orderAvailable: await queryPrometheus('service_available{service="order-service"}'),
    paymentAvailable: await queryPrometheus('service_available{service="payment-service"}'),
    notificationAvailable: await queryPrometheus('service_available{service="notification-service"}')
  };
}

async function generateOrderRequest() {
  const startedAt = Date.now();

  try {
    const result = await getJson(`${orderServiceUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: `runner-${crypto.randomUUID()}`,
        amount: 1
      })
    });
    return { successful: true, responseTime: Date.now() - startedAt, result };
  } catch (error) {
    return { successful: false, responseTime: Date.now() - startedAt, error: error.message };
  }
}

async function generateTraffic(scenario) {
  const requests = [];
  const trafficWindowMilliseconds = (scenario.durationSeconds + 5) * 1000;
  const spacingMilliseconds = scenario.trafficRequests > 1
    ? trafficWindowMilliseconds / (scenario.trafficRequests - 1)
    : 0;
  const trafficPromises = Array.from({ length: scenario.trafficRequests }, async (_, index) => {
    await wait(spacingMilliseconds * index);
    return generateOrderRequest();
  });

  requests.push(...await Promise.all(trafficPromises));
  return requests;
}

function calculateImpact(requests, experiment, prometheusBefore, prometheusAfter) {
  const responseTimes = requests.map((request) => request.responseTime);
  const successfulRequests = requests.filter((request) => request.successful).length;
  const failedRequests = requests.length - successfulRequests;
  const affectedServices = new Set([experiment.targetService]);

  if (failedRequests > 0 && experiment.targetService === 'payment-service') {
    affectedServices.add('order-service');
  }
  if (failedRequests > 0 && experiment.targetService === 'notification-service') {
    affectedServices.add('payment-service');
    affectedServices.add('order-service');
  }

  return {
    totalRequests: requests.length,
    successfulRequests,
    failedRequests,
    errorRate: requests.length === 0 ? 0 : Number(((failedRequests / requests.length) * 100).toFixed(2)),
    averageResponseTime: responseTimes.length === 0
      ? 0
      : Number((responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length).toFixed(2)),
    peakResponseTime: responseTimes.length === 0 ? 0 : Math.max(...responseTimes),
    affectedServices: [...affectedServices],
    cascadingFailure: affectedServices.size > 1,
    prometheusObservation: {
      before: prometheusBefore,
      after: prometheusAfter
    }
  };
}

function csvValue(value) {
  const text = Array.isArray(value) ? value.join(';') : String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

async function saveCsv(experiments) {
  const columns = [
    'experimentId', 'experimentStartTime', 'failureStartTime', 'recoveryTime',
    'targetService', 'failureType', 'configuredFailureDuration', 'actualRecoveryDuration',
    'totalRequests', 'successfulRequests', 'failedRequests', 'errorRate',
    'averageResponseTime', 'peakResponseTime', 'affectedServices', 'cascadingFailure',
    'experimentResult', 'experimentExecutionStatus', 'injectedLatencyMilliseconds'
  ];
  const lines = [columns.join(',')];
  for (const experiment of experiments) {
    lines.push(columns.map((column) => csvValue(experiment[column])).join(','));
  }
  await fs.writeFile(csvFile, `${lines.join('\n')}\n`);
}

async function loadExperiments() {
  try {
    return JSON.parse(await fs.readFile(dataFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function normalizeExperiment(experiment) {
  return {
    ...experiment,
    injectedLatencyMilliseconds: Number(experiment.injectedLatencyMilliseconds || 0),
    experimentExecutionStatus: experiment.experimentExecutionStatus
      || (experiment.experimentResult === 'SUCCESS' ? 'COMPLETED' : 'FAILED')
  };
}

function validateUniqueExperimentIds(experiments) {
  const ids = experiments.map((experiment) => experiment.experimentId);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    throw new Error('Duplicate experiment IDs detected in data/experiments.json');
  }
}

async function saveExperiment(experiment) {
  const experiments = (await loadExperiments()).map(normalizeExperiment);
  validateUniqueExperimentIds(experiments);
  const existingIndex = experiments.findIndex((item) => item.experimentId === experiment.experimentId);

  if (existingIndex >= 0) {
    experiments[existingIndex] = { ...experiments[existingIndex], ...experiment };
  } else {
    experiments.push(experiment);
  }

  await fs.writeFile(dataFile, `${JSON.stringify(experiments, null, 2)}\n`);
  await saveCsv(experiments);
  return experiments;
}

async function saveExperimentResults(results) {
  const experiments = (await loadExperiments()).map(normalizeExperiment);
  validateUniqueExperimentIds(experiments);

  for (const result of results) {
    const existingIndex = experiments.findIndex((item) => item.experimentId === result.experimentId);
    if (existingIndex < 0) {
      throw new Error(`Cannot save result for missing experiment ID: ${result.experimentId}`);
    }
    experiments[existingIndex] = { ...experiments[existingIndex], ...result };
  }

  validateUniqueExperimentIds(experiments);
  await fs.writeFile(dataFile, `${JSON.stringify(experiments, null, 2)}\n`);
  await saveCsv(experiments);
  return experiments;
}

async function runScenario(scenario, index) {
  console.log(`[${index}] experiment started: ${scenario.targetService} ${scenario.failureType} ${scenario.durationSeconds}s load=${scenario.trafficRequests}`);
  await verifyServicesHealthy();
  const prometheusBefore = await collectPrometheusSnapshot();
  const experimentsBefore = await loadExperiments();
  validateUniqueExperimentIds(experimentsBefore);
  const experimentPromise = getJson(`${controllerUrl}/experiments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scenario),
    timeoutMilliseconds: (scenario.durationSeconds + 10) * 1000
  });

  console.log(`[${index}] failure injected; generating ${scenario.trafficRequests} POST /orders requests`);
  const requests = await generateTraffic(scenario);
  const experiment = await experimentPromise;
  if (experimentsBefore.some((item) => item.experimentId === experiment.experimentId)) {
    throw new Error(`Duplicate experiment ID returned by controller: ${experiment.experimentId}`);
  }
  console.log(`[${index}] requests generated: ${requests.length}`);

  const prometheusAfter = await collectPrometheusSnapshot();
  const measured = calculateImpact(requests, experiment, prometheusBefore, prometheusAfter);
  const finalRecord = normalizeExperiment({ ...experiment, ...measured });
  await saveExperiment(finalRecord);
  console.log(`[${index}] service recovered; experiment completed: ${finalRecord.experimentId} ${finalRecord.experimentExecutionStatus}`);
  return finalRecord;
}

function printDatasetStatistics(experiments) {
  const targetDistribution = Object.fromEntries(
    services.map((service) => [service, experiments.filter((item) => item.targetService === service).length])
  );
  const failureDistribution = Object.fromEntries(
    supportedFailureTypes.map((failureType) => [failureType, experiments.filter((item) => item.failureType === failureType).length])
  );
  const executionDistribution = Object.fromEntries(
    ['COMPLETED', 'FAILED'].map((status) => [status, experiments.filter((item) => item.experimentExecutionStatus === status).length])
  );
  console.log('DATASET STATISTICS');
  console.log(JSON.stringify({
    records: experiments.length,
    targetService: targetDistribution,
    failureType: failureDistribution,
    executionStatus: executionDistribution,
    averageErrorRate: Number((experiments.reduce((total, item) => total + Number(item.errorRate || 0), 0) / experiments.length).toFixed(2)),
    cascadingFailureCount: experiments.filter((item) => item.cascadingFailure === true || item.cascadingFailure === 'true').length,
    idsAreUnique: new Set(experiments.map((item) => item.experimentId)).size === experiments.length
  }, null, 2));
}

async function main() {
  const runAll = process.env.RUN_ALL === 'true';
  const initialExperiments = (await loadExperiments()).map(normalizeExperiment);
  validateUniqueExperimentIds(initialExperiments);
  await fs.writeFile(dataFile, `${JSON.stringify(initialExperiments, null, 2)}\n`);
  await saveCsv(initialExperiments);

  const targetTotal = Number(process.env.TARGET_TOTAL || (runAll ? 150 : initialExperiments.length + testExperimentCount));
  if (!Number.isInteger(targetTotal) || targetTotal < initialExperiments.length) {
    throw new Error(`TARGET_TOTAL must be a whole number at least ${initialExperiments.length}`);
  }
  const remainingExperiments = Math.max(0, targetTotal - initialExperiments.length);
  const latencyTest = process.env.LATENCY_TEST === 'true';
  const scenariosToRun = latencyTest
    ? latencyTestScenarios
    : runAll
      ? scenarios.slice(0, Math.min(remainingExperiments, scenarios.length))
      : scenarios.slice(0, Math.min(testExperimentCount, remainingExperiments));
  console.log(`Starting ${scenariosToRun.length} experiments (${initialExperiments.length} existing; target total=${targetTotal}; ${scenarios.length} available).`);

  if (remainingExperiments > scenarios.length) {
    throw new Error(`Not enough predefined scenarios to reach target total ${targetTotal}`);
  }

  const completedResults = [];
  for (const [index, scenario] of scenariosToRun.entries()) {
    completedResults.push(await runScenario(scenario, index + 1));
    await wait(1000);
  }

  const experiments = await saveExperimentResults(completedResults);
  printDatasetStatistics(experiments);
  console.log(`Dataset verified: ${experiments.length} records saved to data/experiments.json and data/experiments.csv`);
}

main().catch((error) => {
  console.error('Experiment runner failed:', error.message);
  process.exitCode = 1;
});
