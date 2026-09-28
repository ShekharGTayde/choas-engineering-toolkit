const express = require('express');
const client = require('prom-client');

const app = express();
const port = process.env.PORT || 3000;
const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3000';

/**
 * RESILIENCE FIX (Phase 10 — Validation Loop)
 *
 * BASELINE PROBLEM (documented in VALIDATION.md):
 *   payment-service called notification-service synchronously and BLOCKED on it.
 *   When notification-service was stopped (EXP-008, EXP-009, EXP-018 etc.), ALL
 *   three services cascaded: 70–90% error rate, 1490–1635ms avg response time.
 *   The notification step is non-critical — a payment can succeed even without a
 *   notification being delivered immediately.
 *
 * FIX APPLIED:
 *   1. Graceful degradation — notification call failure no longer fails the payment.
 *      Payment returns SUCCESS regardless; notification status is surfaced in the
 *      response body for observability but does not drive HTTP status code.
 *   2. Fire-and-forget with bounded timeout — notification is still attempted with
 *      a tight 1500ms timeout so slow notifications don't hurt payment latency.
 *   3. Circuit-breaker (rolling window) — after CIRCUIT_OPEN_THRESHOLD consecutive
 *      notification failures, the circuit opens and calls are skipped entirely for
 *      CIRCUIT_RESET_INTERVAL_MS. This prevents cascading connection pool exhaustion
 *      while the notification service recovers.
 *
 * EXPECTED IMPROVEMENT:
 *   - notification-service stop fault → error rate: ~80% → <5%
 *   - notification-service stop fault → cascading: YES (3 services) → NO (1 service)
 *   - payment avg response time unaffected (notification is fire-and-forget)
 */

// ── Circuit breaker state ────────────────────────────────────────────────────
const CIRCUIT_OPEN_THRESHOLD = 3;      // consecutive failures to open circuit
const CIRCUIT_RESET_INTERVAL_MS = 10_000; // how long circuit stays open (ms)
let notificationFailureStreak = 0;
let circuitOpenUntil = 0; // epoch ms; 0 = closed

function isCircuitOpen() {
  return Date.now() < circuitOpenUntil;
}

function recordNotificationSuccess() {
  notificationFailureStreak = 0;
}

function recordNotificationFailure() {
  notificationFailureStreak += 1;
  if (notificationFailureStreak >= CIRCUIT_OPEN_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_RESET_INTERVAL_MS;
    console.warn(`[circuit-breaker] notification circuit OPEN until ${new Date(circuitOpenUntil).toISOString()}`);
  }
}

const dependencyTimeoutMilliseconds = 1500; // tight timeout — notification is non-critical
let latencyMilliseconds = 0;

// ── Prometheus metrics ───────────────────────────────────────────────────────
const register = new client.Registry();
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});
const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP requests with an error status',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});
const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});
const serviceAvailable = new client.Gauge({
  name: 'service_available',
  help: 'Whether the service is available (1 for available)',
  labelNames: ['service'],
  registers: [register]
});
// New metric: track notification circuit breaker state for observability
const notificationCircuitOpen = new client.Gauge({
  name: 'notification_circuit_open',
  help: '1 if the notification-service circuit breaker is currently open',
  registers: [register]
});

serviceAvailable.set({ service: 'payment-service' }, 1);
notificationCircuitOpen.set(0);

app.use(express.json());
app.use((request, response, next) => {
  if (latencyMilliseconds > 0 && !['/health', '/', '/metrics', '/chaos/latency'].includes(request.path)) {
    return setTimeout(next, latencyMilliseconds);
  }
  return next();
});
app.use((request, response, next) => {
  const startedAt = process.hrtime.bigint();
  response.on('finish', () => {
    const route = request.route?.path || request.path;
    const labels = {
      method: request.method,
      route,
      status_code: String(response.statusCode)
    };
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
    if (response.statusCode >= 400) {
      httpErrorsTotal.inc(labels);
    }
  });
  next();
});

app.get('/health', (request, response) => {
  response.json({ status: 'UP' });
});

app.get('/', (request, response) => {
  response.json({
    service: 'payment-service',
    status: 'UP',
    resilienceMode: 'graceful-degradation+circuit-breaker',
    notificationCircuitOpen: isCircuitOpen()
  });
});

app.get('/metrics', async (request, response) => {
  // Update circuit breaker gauge before scrape
  notificationCircuitOpen.set(isCircuitOpen() ? 1 : 0);
  response.set('Content-Type', register.contentType);
  response.end(await register.metrics());
});

app.post('/chaos/latency', (request, response) => {
  const requestedLatency = Number(request.body.latencyMilliseconds);
  latencyMilliseconds = requestedLatency;
  response.json({ service: 'payment-service', latencyMilliseconds });
});

app.delete('/chaos/latency', (request, response) => {
  latencyMilliseconds = 0;
  response.json({ service: 'payment-service', latencyMilliseconds: 0 });
});

/**
 * POST /payments
 *
 * FIXED: notification is now fire-and-forget with graceful degradation.
 * Payment always returns 201 SUCCESS. Notification status is included in the
 * response body under `notificationStatus` for observability.
 */
app.post('/payments', async (request, response) => {
  const payment = request.body;
  let notificationStatus = 'SKIPPED_CIRCUIT_OPEN';

  // ── Fire-and-forget notification (non-blocking, graceful degradation) ──────
  if (!isCircuitOpen()) {
    // Schedule the notification without awaiting it
    fetch(`${notificationServiceUrl}/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: payment.orderId,
        message: `Payment completed for ${payment.orderId}`
      }),
      signal: AbortSignal.timeout(dependencyTimeoutMilliseconds)
    })
      .then((res) => {
        if (res.ok) {
          recordNotificationSuccess();
        } else {
          recordNotificationFailure();
          console.warn(`[notification] non-ok response ${res.status} for order ${payment.orderId}`);
        }
      })
      .catch((err) => {
        recordNotificationFailure();
        console.warn(`[notification] fire-and-forget failed for order ${payment.orderId}: ${err.message}`);
      });

    notificationStatus = 'DISPATCHED';
  } else {
    // Circuit is open — log but do not block payment
    console.warn(`[circuit-breaker] notification skipped (circuit open) for order ${payment.orderId}`);
    notificationStatus = 'SKIPPED_CIRCUIT_OPEN';
  }

  // Payment always succeeds regardless of notification outcome
  return response.status(201).json({
    service: 'payment-service',
    status: 'SUCCESS',
    payment,
    notificationStatus,
    notificationCircuitOpen: isCircuitOpen()
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`payment-service listening on port ${port} [graceful-degradation+circuit-breaker mode]`);
});
