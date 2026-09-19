import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './RunExperimentDialog.module.css';

const PIPELINE_STEPS = [
  { key: 'QUEUED',             label: 'Queued',             icon: '⏳' },
  { key: 'RUNNING',            label: 'Starting experiment', icon: '🚀' },
  { key: 'FAULT_INJECTED',     label: 'Fault injected',      icon: '⚡' },
  { key: 'COLLECTING_METRICS', label: 'Collecting metrics',  icon: '📊' },
  { key: 'ANALYZING',          label: 'ML analysis',         icon: '🧠' },
  { key: 'AI_ANALYSIS',        label: 'AI analysis',         icon: '🤖' },
  { key: 'COMPLETED',          label: 'Completed',           icon: '✅' },
];

function PipelineStatus({ currentStatus }) {
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.key === currentStatus);
  return (
    <div className={styles.pipeline}>
      {PIPELINE_STEPS.map((step, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        const isFailed = currentStatus === 'FAILED' && i === currentIdx;
        return (
          <div
            key={step.key}
            className={`${styles.step} ${isDone ? styles.done : ''} ${isActive ? styles.active : ''} ${isFailed ? styles.failed : ''}`}
          >
            <span className={styles.stepIcon}>{step.icon}</span>
            <span className={styles.stepLabel}>{step.label}</span>
            {isDone && <span className={styles.checkmark}>✓</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function RunExperimentDialog({ open, onClose, onComplete, addToast }) {
  const { token, isOperator } = useAuth();
  const [targetService, setTargetService] = useState('payment-service');
  const [failureType, setFailureType] = useState('latency');
  const [durationSeconds, setDurationSeconds] = useState(10);
  const [latencyMs, setLatencyMs] = useState(500);
  const [running, setRunning] = useState(false);
  const [runStatus, setRunStatus] = useState(null);
  const dialogRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => {
      if (!running) onClose();
    };
    el.addEventListener('close', handler);
    return () => el.removeEventListener('close', handler);
  }, [running, onClose]);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const handleClose = () => {
    if (running) return;
    cleanup();
    setRunStatus(null);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isOperator) {
      addToast('Viewer role cannot trigger experiments. Operator role required.', 'error');
      return;
    }

    setRunning(true);
    setRunStatus({ status: 'QUEUED' });

    const payload = { targetService, failureType, durationSeconds: Number(durationSeconds) };
    if (failureType === 'latency') payload.latencyMilliseconds = Number(latencyMs);

    try {
      const res = await fetch('/api/run-full-experiment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const run = await res.json();
      if (!res.ok) throw new Error(run.detail || 'Failed to start experiment');

      setRunStatus(run);

      timerRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/run-full-experiment/${run.runId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const status = await pollRes.json();
          setRunStatus(status);

          if (status.status === 'COMPLETED') {
            cleanup();
            setRunning(false);
            addToast(`${status.experimentId || 'Experiment'} completed successfully`, 'success');
            onComplete();
            setTimeout(() => {
              setRunStatus(null);
              onClose();
            }, 1800);
          } else if (status.status === 'FAILED') {
            cleanup();
            setRunning(false);
            addToast(`Experiment failed at ${status.failedStage}: ${status.error}`, 'error');
          }
        } catch {
          // polling error — keep trying
        }
      }, 1200);
    } catch (err) {
      addToast(err.message, 'error');
      setRunning(false);
      setRunStatus(null);
    }
  };

  const serviceLabel = {
    'payment-service': 'Payment Service',
    'order-service': 'Order Service',
    'notification-service': 'Notification Service',
  }[targetService] || targetService;

  return (
    <dialog ref={dialogRef} className={styles.dialog}>
      <div className={styles.header}>
        <div className={styles.iconWrap}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <div>
          <span className={styles.eyebrow}>Controlled Fault Injection</span>
          <h2 className={styles.title}>
            {runStatus ? 'Experiment Execution in Progress' : 'Configure Chaos Experiment'}
          </h2>
        </div>
      </div>

      {runStatus ? (
        <div className={styles.body}>
          <PipelineStatus currentStatus={runStatus.status} />
          {runStatus.status === 'FAILED' && (
            <div className={styles.errorBox}>
              <strong>Failed at {runStatus.failedStage}</strong>
              <p>{runStatus.error}</p>
            </div>
          )}
          {runStatus.status === 'COMPLETED' && (
            <div className={styles.successBox}>
              Experiment {runStatus.experimentId} completed. Dashboard updating…
            </div>
          )}
          {runStatus.status === 'FAILED' && (
            <div className={styles.actions}>
              <button type="button" className={styles.btnGhost} onClick={handleClose}>
                Close
              </button>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="run-target">Target service</label>
              <select
                id="run-target"
                className={styles.select}
                value={targetService}
                onChange={(e) => setTargetService(e.target.value)}
              >
                <option value="payment-service">payment-service</option>
                <option value="order-service">order-service</option>
                <option value="notification-service">notification-service</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="run-failure">Failure type</label>
              <select
                id="run-failure"
                className={styles.select}
                value={failureType}
                onChange={(e) => setFailureType(e.target.value)}
              >
                <option value="latency">latency — inject artificial delay</option>
                <option value="restart">restart — graceful container restart</option>
                <option value="stop">stop — hard container stop</option>
              </select>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="run-duration">Duration</label>
                <div className={styles.inputWrap}>
                  <input
                    id="run-duration"
                    className={styles.input}
                    type="number"
                    min={1}
                    max={60}
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(e.target.value)}
                    required
                  />
                  <span className={styles.inputSuffix}>sec</span>
                </div>
              </div>

              {failureType === 'latency' && (
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="run-latency">Latency</label>
                  <div className={styles.inputWrap}>
                    <select
                      id="run-latency"
                      className={styles.select}
                      value={latencyMs}
                      onChange={(e) => setLatencyMs(Number(e.target.value))}
                    >
                      <option value={500}>500 ms</option>
                      <option value={1000}>1,000 ms</option>
                      <option value={2000}>2,000 ms</option>
                      <option value={5000}>5,000 ms</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.confirmBox}>
              <p>
                Will inject a <strong className={styles.highlight}>{failureType}</strong> failure into{' '}
                <strong className={styles.highlight}>{serviceLabel}</strong> for{' '}
                <strong className={styles.highlight}>{durationSeconds}s</strong>
                {failureType === 'latency' && ` with +${latencyMs}ms delay`}.
              </p>
              <p className={styles.confirmNote}>
                Automated traffic will be generated during fault window to measure degradation and recovery.
              </p>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.btnGhost} onClick={handleClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={!isOperator}
              title={!isOperator ? 'Operator role required' : undefined}
            >
              Start Experiment
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
