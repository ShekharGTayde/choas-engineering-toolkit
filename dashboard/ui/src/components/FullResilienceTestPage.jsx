import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './FullResilienceTestPage.module.css';

const initial = {
  targetService: 'payment-service',
  failureType: 'latency',
  durationSeconds: 10,
  latencyMilliseconds: 500,
  startUsers: 10,
  maxUsers: 100,
  loadDurationSeconds: 30,
};

const services = [
  ['payment-service', 'Payment Service'],
  ['order-service', 'Order Service'],
  ['notification-service', 'Notification Service'],
];

function authHeaders(token, json = false) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function value(record, ...keys) {
  for (const key of keys) {
    if (record?.[key] !== undefined && record?.[key] !== null) return record[key];
  }
  return '—';
}

export default function FullResilienceTestPage({ addToast }) {
  const { token, isOperator } = useAuth();
  const [form, setForm] = useState(initial);
  const [run, setRun] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!run || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) return undefined;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/run-full-resilience-test/${run.runId}`, {
        headers: authHeaders(token),
        cache: 'no-store',
      });
      if (response.ok) setRun(await response.json());
    }, 1200);
    return () => clearInterval(timer);
  }, [run, token]);

  const setField = (name, value) => setForm((old) => ({
    ...old,
    [name]: ['durationSeconds', 'latencyMilliseconds', 'startUsers', 'maxUsers', 'loadDurationSeconds'].includes(name)
      ? Number(value)
      : value,
  }));

  const start = async (event) => {
    event.preventDefault();
    if (!isOperator) {
      addToast('Operator role required to run resilience tests.', 'error');
      return;
    }
    setBusy(true);
    setReport(null);
    try {
      const response = await fetch('/api/run-full-resilience-test', {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({ ...form, trafficRequests: form.maxUsers }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || 'Unable to start resilience test');
      setRun(data);
      addToast('Full resilience test started', 'success');
    } catch (error) {
      addToast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const loadReport = async () => {
    if (!run?.runId) return;
    const response = await fetch(`/api/run-full-resilience-test/${run.runId}/report`, {
      headers: authHeaders(token),
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || 'Unable to load report');
    setReport(data);
  };

  const downloadPdf = () => {
    if (!report) return;
    window.print();
  };

  const metrics = report?.metrics || report?.experiment || {};
  const analysis = report?.aiAnalysis || report?.analysis || {};

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>End-to-end resilience verification</p>
          <h1>Full Resilience Test</h1>
          <p>Generate traffic, inject a controlled fault, measure recovery, and produce one AI-backed resilience report.</p>
        </div>
        {report && <button type="button" className={styles.printButton} onClick={downloadPdf}>Download PDF</button>}
      </header>

      {!run && (
        <form className={styles.form} onSubmit={start}>
          <label>Target service
            <select value={form.targetService} onChange={(event) => setField('targetService', event.target.value)}>
              {services.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label>Fault type
            <select value={form.failureType} onChange={(event) => setField('failureType', event.target.value)}>
              <option value="latency">Latency</option><option value="stop">Stop</option><option value="restart">Restart</option>
            </select>
          </label>
          {form.failureType === 'latency' && <label>Injected latency (ms)
            <select value={form.latencyMilliseconds} onChange={(event) => setField('latencyMilliseconds', event.target.value)}>
              {[500, 1000, 2000, 5000].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>}
          <label>Fault duration (seconds)<input type="number" min="1" max="60" value={form.durationSeconds} onChange={(event) => setField('durationSeconds', event.target.value)} /></label>
          <label>Starting users<input type="number" min="1" value={form.startUsers} onChange={(event) => setField('startUsers', event.target.value)} /></label>
          <label>Maximum users<input type="number" min="1" value={form.maxUsers} onChange={(event) => setField('maxUsers', event.target.value)} /></label>
          <label>Load duration (seconds)<input type="number" min="10" max="600" value={form.loadDurationSeconds} onChange={(event) => setField('loadDurationSeconds', event.target.value)} /></label>
          <button type="submit" disabled={busy || !isOperator}>{busy ? 'Starting…' : 'Run Full Resilience Test'}</button>
        </form>
      )}

      {run && !report && (
        <div className={styles.statusPanel}>
          <p className={styles.eyebrow}>Resilience pipeline</p>
          <h2>{run.status || 'QUEUED'}</h2>
          <p>{run.currentStage || run.failedStage || 'Traffic, fault injection, observability, recovery, and analysis are being coordinated.'}</p>
          {run.error && <div className={styles.error}>{run.error}</div>}
          {run.status === 'COMPLETED' && <button type="button" onClick={() => loadReport().catch((error) => addToast(error.message, 'error'))}>Open report</button>}
        </div>
      )}

      {report && (
        <article className={styles.report}>
          <div className={styles.reportTitle}><span>CHAOSGUARD // RESILIENCE REPORT</span><strong>{value(report, 'runId', 'experimentId')}</strong></div>
          <div className={styles.grid}>
            {[
              ['Target', value(report, 'targetService')],
              ['Fault', value(report, 'failureType')],
              ['Total requests', value(metrics, 'totalRequests')],
              ['Error rate', `${value(metrics, 'errorRate')}%`],
              ['P95 latency', `${value(metrics, 'p95LatencyMs', 'p95Latency')} ms`],
              ['Recovery time', `${value(metrics, 'actualRecoveryDuration', 'recoveryTime')} s`],
              ['Anomaly', value(report, 'anomalyLabel')],
              ['Risk', value(report, 'riskLevel')],
            ].map(([label, content]) => <div className={styles.metric} key={label}><span>{label}</span><strong>{content}</strong></div>)}
          </div>
          <h3>AI assessment</h3>
          <p>{value(analysis, 'failureSummary')}</p>
          <p>{value(analysis, 'resilienceAssessment')}</p>
          <h3>Recommendations</h3>
          <ul>{(analysis.recommendations || []).map((item, index) => <li key={`${item.action}-${index}`}><strong>{item.priority}:</strong> {item.action} — {item.reason}</li>)}</ul>
        </article>
      )}
    </section>
  );
}
