import { useEffect, useMemo, useState } from 'react';
import styles from './LoadTestingPage.module.css';

const SERVICES = {
  'Order Service': { targetUrl: 'http://localhost:3001', endpoint: '/health' },
  'Payment Service': { targetUrl: 'http://localhost:3000', endpoint: '/health' },
  'Notification Service': { targetUrl: 'http://localhost:3002', endpoint: '/health' },
};
const terminal = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const initial = { serviceName: 'Order Service', targetUrl: SERVICES['Order Service'].targetUrl, endpoint: '/health', httpMethod: 'GET', environment: 'Local', requestHeaders: {}, requestBody: '', startUsers: 10, maxUsers: 100, rampUpSeconds: 30, durationSeconds: 60, maxErrorRatePct: 5, maxP95LatencyMs: 1000, timeoutSeconds: 10, maxRequests: 10000, confirmation: false };
const numberFields = ['startUsers', 'maxUsers', 'rampUpSeconds', 'durationSeconds', 'maxErrorRatePct', 'maxP95LatencyMs', 'timeoutSeconds', 'maxRequests'];
const fmt = (value, digits = 0) => Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: digits });

function Metric({ label, value, unit = '' }) { return <div className={styles.metric}><span>{label}</span><strong>{value ?? 'Not available'}{value !== undefined && value !== null ? unit : ''}</strong></div>; }
function Status({ value }) { return <span className={`${styles.status} ${styles[(value || 'queued').toLowerCase()]}`}>{value || 'QUEUED'}</span>; }

export default function LoadTestingPage({ addToast }) {
  const [form, setForm] = useState(initial);
  const [tests, setTests] = useState([]);
  const [active, setActive] = useState(null);
  const [validation, setValidation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('overview');

  const loadTests = async () => { const response = await fetch('/api/load-tests', { cache: 'no-store' }); if (response.ok) setTests((await response.json()).tests || []); };
  useEffect(() => { loadTests().catch(() => {}); }, []);
  useEffect(() => {
    if (!active || terminal.has(active.status)) return undefined;
    const timer = setInterval(async () => { const response = await fetch(`/api/load-tests/${active.testId}`, { cache: 'no-store' }); if (response.ok) { const next = await response.json(); setActive(next); if (terminal.has(next.status)) { setTests((old) => [next, ...old.filter((item) => item.testId !== next.testId)]); addToast(`Load test ${next.status.toLowerCase()}`, next.status === 'COMPLETED' ? 'success' : 'info'); } } }, 2000);
    return () => clearInterval(timer);
  }, [active, addToast]);

  const setField = (name, value) => setForm((old) => ({ ...old, [name]: numberFields.includes(name) ? Number(value) : value }));
  const selectService = (name) => setForm((old) => ({ ...old, serviceName: name, ...SERVICES[name] }));
  const requestHeaders = useMemo(() => { try { return form.requestHeadersText ? JSON.parse(form.requestHeadersText) : {}; } catch { return null; } }, [form.requestHeadersText]);

  const validate = async () => {
    setBusy(true); setValidation(null);
    try {
      const payload = { ...form, healthUrl: `${form.targetUrl.replace(/\/$/, '')}/health`, requestHeaders: requestHeaders || {}, requestBody: form.requestBody || null, confirmation: true };
      const response = await fetch('/api/load-tests/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json(); setValidation(result); addToast(result.reachable ? 'Endpoint reachable' : 'Endpoint validation failed', result.reachable ? 'success' : 'error');
    } catch (error) { setValidation({ reachable: false, error: error.message }); } finally { setBusy(false); }
  };
  const start = async (event) => {
    event.preventDefault();
    if (!form.confirmation) return;
    if (!requestHeaders) { addToast('Request headers must be valid JSON', 'error'); return; }
    setBusy(true);
    try {
      const payload = { ...form, healthUrl: `${form.targetUrl.replace(/\/$/, '')}/health`, requestHeaders, requestBody: form.requestBody || null };
      const response = await fetch('/api/load-tests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json(); if (!response.ok) throw new Error(result.detail || result.error || 'Unable to start test');
      setActive(result); setView('running'); addToast(`Started ${result.testId}`, 'success');
    } catch (error) { addToast(error.message, 'error'); } finally { setBusy(false); }
  };
  const stop = async () => { if (!active) return; const response = await fetch(`/api/load-tests/${active.testId}/stop`, { method: 'POST' }); if (response.ok) setActive(await response.json()); else addToast('Unable to stop test', 'error'); };

  const stages = active?.rampLevels || [];
  const overview = !active || view === 'overview';
  return <section className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Controlled test environment</p><h1>Pre-Deployment API Testing</h1><p>Test your microservices before production. Find API capacity limits, performance degradation, and failure points before deployment.</p></div><div className={styles.switcher}>{['overview', 'new', 'running', 'history'].map((item) => <button key={item} className={view === item ? styles.selected : ''} onClick={() => setView(item)}>{item === 'new' ? 'New API Load Test' : item === 'running' ? 'Running Tests' : item === 'history' ? 'Test History' : 'Overview'}</button>)}</div></header>
    {overview && <><div className={styles.cards}><Metric label="Services Tested" value={new Set(tests.map((item) => item.serviceName)).size} /><Metric label="Tests Completed" value={tests.filter((item) => item.status === 'COMPLETED').length} /><Metric label="Average Safe Capacity" value={fmt(tests.reduce((sum, item) => sum + (item.safeCapacity || 0), 0) / Math.max(1, tests.filter((item) => item.safeCapacity).length))} unit=" users" /><Metric label="Tests With Degradation" value={tests.filter((item) => item.degradationPoint).length} /><Metric label="Tests With Failures" value={tests.filter((item) => item.verdict === 'FAIL').length} /></div><TestTable tests={tests} onSelect={(test) => { setActive(test); setView('running'); }} /></>}
    {view === 'new' && <form className={styles.form} onSubmit={start}><h2>New Pre-Deployment API Test</h2><div className={styles.formGrid}><label>Service<select value={form.serviceName} onChange={(event) => selectService(event.target.value)}>{Object.keys(SERVICES).map((name) => <option key={name}>{name}</option>)}</select></label><label>Environment<select value={form.environment} onChange={(event) => setField('environment', event.target.value)}><option>Local</option><option>Development</option><option>Staging</option></select></label><label>Server URL<input value={form.targetUrl} onChange={(event) => setField('targetUrl', event.target.value)} required /></label><label>API Endpoint<input value={form.endpoint} onChange={(event) => setField('endpoint', event.target.value)} required /></label><label>HTTP Method<select value={form.httpMethod} onChange={(event) => setField('httpMethod', event.target.value)}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => <option key={method}>{method}</option>)}</select></label><label>Request Headers <span className={styles.hint}>JSON</span><textarea value={form.requestHeadersText || ''} onChange={(event) => setField('requestHeadersText', event.target.value)} placeholder={'{"Content-Type":"application/json"}'} /></label>{!['GET', 'DELETE'].includes(form.httpMethod) && <label>Request Body<textarea value={form.requestBody} onChange={(event) => setField('requestBody', event.target.value)} placeholder={'{"productId":101,"quantity":2}'} /></label>}</div><button type="button" className={styles.secondary} onClick={validate} disabled={busy}>Validate Endpoint</button>{validation && <div className={`${styles.validation} ${validation.reachable ? styles.good : styles.bad}`}><strong>{validation.reachable ? 'Endpoint reachable' : 'Endpoint unavailable'}</strong><span>HTTP {validation.httpStatus ?? 'N/A'} · {fmt(validation.latencyMs, 2)} ms</span>{validation.error && <span>{validation.error}</span>}</div>}<h3>Load Configuration</h3><div className={styles.formGrid}>{numberFields.map((name) => <label key={name}>{name.replace(/([A-Z])/g, ' $1')}<input type="number" min="1" value={form[name]} onChange={(event) => setField(name, event.target.value)} /></label>)}</div><label className={styles.confirm}><input type="checkbox" checked={form.confirmation} onChange={(event) => setField('confirmation', event.target.checked)} />I confirm this endpoint is a test/development/staging endpoint and I have permission to generate load against it.</label><button className={styles.primary} disabled={busy || !form.confirmation}>{busy ? 'Working...' : 'Start Load Test'}</button></form>}
    {view === 'running' && active && <Report test={active} onStop={stop} />}
    {view === 'running' && !active && <Empty text="No load test selected." />}
    {view === 'history' && <TestTable tests={tests} onSelect={(test) => { setActive(test); setView('running'); }} />}
  </section>;
}

function TestTable({ tests, onSelect }) { return <div className={styles.tableWrap}><div className={styles.tableTitle}><h2>Recent Tests</h2><span>{tests.length} saved</span></div><table><thead><tr>{['Test ID', 'Service', 'Endpoint', 'Max Users', 'Requests', 'Error Rate', 'P95', 'Safe Capacity', 'Status', 'Date'].map((head) => <th key={head}>{head}</th>)}</tr></thead><tbody>{tests.slice(0, 20).map((test) => <tr key={test.testId} onClick={() => onSelect(test)}><td>{test.testId}</td><td>{test.serviceName}</td><td>{test.httpMethod} {test.endpoint}</td><td>{fmt(test.config?.maxUsers)}</td><td>{fmt(test.result?.totalRequests)}</td><td>{fmt(test.result?.errorRate, 2)}%</td><td>{fmt(test.result?.p95LatencyMs, 2)} ms</td><td>{test.safeCapacity ? `${fmt(test.safeCapacity)} users` : 'Not reached'}</td><td><Status value={test.status} /></td><td>{test.createdAt ? new Date(test.createdAt).toLocaleString() : 'N/A'}</td></tr>)}</tbody></table>{!tests.length && <Empty text="No tests saved yet. Start with the read-only Order Service health endpoint." />}</div>; }
function Report({ test, onStop }) { const result = test.result || {}; return <div className={styles.report}><div className={styles.reportHead}><div><p className={styles.eyebrow}>{test.testId}</p><h2>{test.serviceName} · {test.httpMethod} {test.endpoint}</h2><span>{test.environment} · {test.targetUrl}</span></div><div><Status value={test.status} />{!terminal.has(test.status) && <button className={styles.danger} onClick={onStop}>Stop Test</button>}</div></div><div className={styles.cards}>{[['Concurrent Users', test.currentUsers], ['Requests', result.totalRequests || test.liveMetrics?.totalRequests], ['Successful', result.successfulRequests], ['Failed', result.failedRequests], ['Requests/sec', result.requestsPerSec || test.liveMetrics?.requestsPerSec], ['Average Latency', result.avgLatencyMs || test.liveMetrics?.avgLatencyMs, ' ms'], ['P95', result.p95LatencyMs || test.liveMetrics?.p95LatencyMs, ' ms'], ['P99', result.p99LatencyMs, ' ms'], ['Error Rate', result.errorRate || test.liveMetrics?.errorRate, '%']].map(([label, value, unit]) => <Metric key={label} label={label} value={value === undefined ? undefined : fmt(value, 2)} unit={unit} />)}</div><div className={styles.capacity}><h3>Capacity Assessment</h3><strong>{test.safeCapacity ? `${fmt(test.safeCapacity)} users safe` : 'Breaking point not reached during this test.'}</strong><span>Degradation: {test.degradationPoint ? `${fmt(test.degradationPoint)} users` : 'Not detected'} · Breaking point: {test.breakingPoint ? `${fmt(test.breakingPoint)} users` : 'Not reached'}</span></div>{(test.rampLevels || []).length > 0 && <div className={styles.stageList}><h3>Measured Load Stages</h3>{test.rampLevels.map((stage) => <div key={stage.level}><span>{stage.concurrentUsers} users</span><span>{fmt(stage.totalRequests)} requests</span><span>{fmt(stage.p95LatencyMs, 2)} ms P95</span><span>{fmt(stage.errorRate, 2)}% errors</span></div>)}</div>}{test.aiAnalysis && <div className={styles.ai}><h3>AI Analysis</h3><p>{test.aiAnalysis.summary || test.aiAnalysis.performanceSummary || 'Analysis available in the completed report.'}</p></div>}</div>; }
function Empty({ text }) { return <div className={styles.empty}>{text}</div>; }
