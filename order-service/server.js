const express = require('express');
const client = require('prom-client');

const app = express();
const port = process.env.PORT || 3000;
const paymentServiceUrl = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3000';
const dependencyTimeoutMilliseconds = 3000;
let latencyMilliseconds = 0;
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

serviceAvailable.set({ service: 'order-service' }, 1);

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
    service: 'order-service',
    status: 'UP'
  });
});

app.get('/metrics', async (request, response) => {
  response.set('Content-Type', register.contentType);
  response.end(await register.metrics());
});

app.post('/chaos/latency', (request, response) => {
  const requestedLatency = Number(request.body.latencyMilliseconds);
  latencyMilliseconds = requestedLatency;
  response.json({ service: 'order-service', latencyMilliseconds });
});

app.delete('/chaos/latency', (request, response) => {
  latencyMilliseconds = 0;
  response.json({ service: 'order-service', latencyMilliseconds: 0 });
});

app.post('/orders', async (request, response) => {
  const order = request.body;

  try {
    const paymentResponse = await fetch(`${paymentServiceUrl}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.orderId || `order-${Date.now()}`,
        amount: order.amount || 0
      }),
      signal: AbortSignal.timeout(dependencyTimeoutMilliseconds)
    });
    const paymentResult = await paymentResponse.json();

    if (!paymentResponse.ok) {
      return response.status(502).json({
        service: 'order-service',
        status: 'FAILED',
        failure: 'payment-service',
        paymentResponse: paymentResult
      });
    }

    return response.status(201).json({
      service: 'order-service',
      status: 'CREATED',
      order,
      paymentResponse: paymentResult
    });
  } catch (error) {
    return response.status(503).json({
      service: 'order-service',
      status: 'FAILED',
      failure: 'payment-service unavailable or timed out',
      error: error.message
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`order-service listening on port ${port}`);
});
