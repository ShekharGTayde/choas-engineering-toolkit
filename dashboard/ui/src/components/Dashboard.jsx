import { useMemo } from 'react';
import ServiceHealthStrip from './ServiceHealthStrip.jsx';
import SummaryCards from './SummaryCards.jsx';
import LiveMetricsChart from './LiveMetricsChart.jsx';
import ExperimentTable from './ExperimentTable.jsx';
import ExperimentDetail from './ExperimentDetail.jsx';
import styles from './Dashboard.module.css';

export default function Dashboard({
  data,
  loading = false,
  error = null,
  selected = null,
  onSelect,
  search = '',
  onSearchChange,
  riskFilter = '',
  onRiskFilterChange,
  serviceFilter = '',
  onServiceFilterChange,
  onRunExperiment,
  onRefresh,
  onNavigateTab,
  user,
}) {
  const metrics = data?.metrics;
  const services = data?.services || [];
  const experiments = data?.experiments || [];

  const getInitials = (name) => {
    if (!name) return 'OP';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };

  const allOperational = services.length > 0 && services.every((s) => s.status === 'UP');

  return (
    <div className={styles.dashboard}>
      {/* ── HERO / MASTHEAD (Editorial Blueprint Header) ───────────────────── */}
      <header className={styles.heroSection}>
        <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
        <span className={`${styles.crosshair} ${styles.tr}`}>+</span>

        <div className={styles.heroGrid}>
          <div className={styles.heroLeft}>
            <div className={styles.heroTagRow}>
              
              <span className={styles.heroCoord}>COORD: 51.5074° N, 0.1278° W</span>
             
            </div>

            <h1 className={styles.heroTitle}>BREAK IT</h1>
            <h1 className={styles.heroTitle}>BEFORE</h1>
            <h1 className={styles.heroTitle}>PRODUCTION DOES</h1>
            <h2 className={styles.heroSubtitle}>RESILIENCE ENGINEERING TOOLKIT</h2>

            <p className={styles.heroDescription}>
              Autonomous chaos orchestration, isolation forest anomaly detection, and
              cascading failure mitigation for distributed microservice topologies.
            </p>
          </div>

          {/* Floating Frosted Glass Identity Card */}
          <div className={styles.heroGlassCard}>
            <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
            <span className={`${styles.crosshair} ${styles.tr}`}>+</span>
            <span className={`${styles.crosshair} ${styles.bl}`}>+</span>
            <span className={`${styles.crosshair} ${styles.br}`}>+</span>

            <div className={styles.glassCardHeader}>
              <div className={styles.operatorBadge}>
                <div className={styles.operatorAvatar}>
                  {getInitials(user?.name)}
                </div>
                <div className={styles.operatorMeta}>
                  <span className={styles.operatorName}>{user?.name || 'Operator Console'}</span>
                  <span className={styles.operatorRole}>
                    {user?.role ? `${user.role.toUpperCase()} LEVEL ACCESS` : 'CHAOS CONTROLLER'}
                  </span>
                </div>
              </div>
              <span className={styles.tagOrange}>ISOLATION FOREST ML</span>
            </div>

            <div className={styles.glassCardBody}>
              <div className={styles.metricItem}>
                <span className={styles.metricKey}>CLUSTER HEALTH</span>
                <span className={styles.metricVal} style={{ color: allOperational ? 'var(--status-healthy)' : 'var(--status-critical)' }}>
                  {allOperational ? '100% OPERATIONAL' : 'DEGRADATION ACTIVE'}
                </span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricKey}>TARGET NODES</span>
                <span className={styles.metricVal}>
                  {services.length} MONITORED
                </span>
              </div>
            </div>

            <div className={styles.glassCardFooter}>
              <div className={styles.barcodeBox}>
                <div className={styles.barcodeLines}>
                  <span className={styles.barThick}></span>
                  <span className={styles.barThin}></span>
                  <span className={styles.barThin}></span>
                  <span className={styles.barThick}></span>
                  <span className={styles.barThin}></span>
                  <span className={styles.barThick}></span>
                  <span className={styles.barThin}></span>
                  <span className={styles.barThin}></span>
                  <span className={styles.barThick}></span>
                </div>
                <span className={styles.barcodeCode}>EXP-SUITE // 2026-V8</span>
              </div>

              <button
                type="button"
                className={styles.pillBtnBlack}
                onClick={onRunExperiment}
              >
                <span>RUN EXPERIMENT</span>
                <span className={styles.arrowIcon}>↗</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── 01 OVERVIEW (Paper Band) ───────────────────────────────────────── */}
      <section className={styles.bandPaper} aria-labelledby="section-01-title">
        <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
        <span className={`${styles.crosshair} ${styles.tr}`}>+</span>

        <div className={styles.inner}>
          <div className={styles.sectionHeader}>
            <div className={styles.markerNumber}>01</div>
            <div className={styles.sectionHeaderContent}>
              <div className={styles.sectionTag}>[MODULE 01 // OVERVIEW]</div>
              <h2 id="section-01-title" className={styles.sectionTitle}>
                SYSTEM TOPOLOGY &amp; RESILIENCE HEALTH
              </h2>
              <p className={styles.sectionSubtitle}>
                Continuous observation of target services, fault injection logs, and resilience spread indicators.
              </p>
            </div>
          </div>

          {/* Service Health Nodes */}
          <ServiceHealthStrip services={services} loading={loading && !data} />

          {/* Summary Stat Cards in Frosted Glass */}
          <SummaryCards metrics={metrics} loading={loading && !data} />
        </div>
      </section>

      {/* ── 02 ANALYTICS (Deep-Blue Band) ──────────────────────────────────── */}
      <section className={styles.bandDeepBlue} aria-labelledby="section-02-title">
        <span className={`${styles.crosshair} ${styles.crosshairLight} ${styles.tl}`}>+</span>
        <span className={`${styles.crosshair} ${styles.crosshairLight} ${styles.tr}`}>+</span>

        <div className={styles.inner}>
          <div className={`${styles.sectionHeader} ${styles.sectionHeaderLight}`}>
            <div className={`${styles.markerNumber} ${styles.markerNumberLight}`}>02</div>
            <div className={styles.sectionHeaderContent}>
              <div className={`${styles.sectionTag} ${styles.sectionTagLight}`}>
                [MODULE 02 // ANALYTICS &amp; TOPOLOGY]
              </div>
              <h2 id="section-02-title" className={`${styles.sectionTitle} ${styles.sectionTitleLight}`}>
                L'ARCHITETTURA &amp; TELEMETRY DYNAMICS
              </h2>
              <p className={`${styles.sectionSubtitle} ${styles.sectionSubtitleLight}`}>
                High-resolution response curve and failure propagation window with isolated circuit breakers.
              </p>
            </div>
          </div>

          {/* Blueprint Architecture Wireframe Node Cards */}
          <div className={styles.wireframeGrid}>
            <div className={styles.wireframeCard}>
              <span className={`${styles.crosshair} ${styles.crosshairLight} ${styles.tl}`}>+</span>
              <span className={`${styles.crosshair} ${styles.crosshairLight} ${styles.tr}`}>+</span>
              <div className={styles.cardRefTag}>SYS.NODE // 01 · INGRESS</div>
              <h3 className={styles.wireframeTitle}>ORDER SERVICE</h3>
              <ul className={styles.wireframeBullets}>
                <li className={styles.bulletItem}>
                  <span className={styles.bulletDot}></span> HTTP / REST GATEWAY
                </li>
                <li className={styles.bulletItem}>
                  <span className={styles.bulletDot}></span> DISPATCH LOAD BALANCER
                </li>
                <li className={styles.bulletItem}>
                  <span className={styles.bulletDot}></span> STATE ORCHESTRATOR
                </li>
              </ul>
              <div className={styles.wireframeFooter}>
                <span className={styles.wireframeStatus}>STATUS // MONITORED</span>
                <span className={styles.circuitPill}>HEALTHY</span>
              </div>
            </div>

            <div className={styles.wireframeCard} style={{ borderColor: '#FF6A2B' }}>
              <span className={`${styles.crosshair} ${styles.crosshairLight} ${styles.tl}`}>+</span>
              <span className={`${styles.crosshair} ${styles.crosshairLight} ${styles.tr}`}>+</span>
              <div className={styles.cardRefTag} style={{ color: '#FF6A2B' }}>SYS.NODE // 02 · CORE DINAMICO</div>
              <h3 className={styles.wireframeTitle}>PAYMENT SERVICE</h3>
              <ul className={styles.wireframeBullets}>
                <li className={styles.bulletItem}>
                  <span className={styles.bulletDot}></span> TRANSACTIONAL CORE
                </li>
                <li className={styles.bulletItem}>
                  <span className={styles.bulletDot}></span> ROLLING CIRCUIT BREAKER
                </li>
                <li className={styles.bulletItem}>
                  <span className={styles.bulletDot}></span> TIMEOUT: 500MS ISOLATION
                </li>
              </ul>
              <div className={styles.wireframeFooter}>
                <span className={styles.wireframeStatus}>CIRCUIT // ARMED</span>
                <span className={styles.circuitPill} style={{ background: 'rgba(255, 106, 43, 0.2)', color: '#FF6A2B', borderColor: 'rgba(255, 106, 43, 0.4)' }}>
                  DEGRADATION SHIELD
                </span>
              </div>
            </div>

            <div className={styles.wireframeCard}>
              <span className={`${styles.crosshair} ${styles.crosshairLight} ${styles.tl}`}>+</span>
              <span className={`${styles.crosshair} ${styles.crosshairLight} ${styles.tr}`}>+</span>
              <div className={styles.cardRefTag}>SYS.NODE // 03 · ASYNC SINK</div>
              <h3 className={styles.wireframeTitle}>NOTIFICATION SERVICE</h3>
              <ul className={styles.wireframeBullets}>
                <li className={styles.bulletItem}>
                  <span className={styles.bulletDot}></span> EMAIL / SMS DISPATCH
                </li>
                <li className={styles.bulletItem}>
                  <span className={styles.bulletDot}></span> FIRE &amp; FORGET FALLBACK
                </li>
                <li className={styles.bulletItem}>
                  <span className={styles.bulletDot}></span> NON-BLOCKING PIPELINE
                </li>
              </ul>
              <div className={styles.wireframeFooter}>
                <span className={styles.wireframeStatus}>MODE // ASYNC</span>
                <span className={styles.circuitPill}>DECOUPLED</span>
              </div>
            </div>
          </div>

          {/* Oscilloscope Chart in Blue & Orange */}
          <LiveMetricsChart experiment={selected} />
        </div>
      </section>

      {/* ── 03 ACTIVITY (Paper Band) ───────────────────────────────────────── */}
      <section className={styles.bandPaper} aria-labelledby="section-03-title">
        <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
        <span className={`${styles.crosshair} ${styles.tr}`}>+</span>

        <div className={styles.inner}>
          <div className={styles.sectionHeader}>
            <div className={styles.markerNumber}>03</div>
            <div className={styles.sectionHeaderContent}>
              <div className={styles.sectionTag}>[MODULE 03 // ACTIVITY &amp; AUDIT]</div>
              <h2 id="section-03-title" className={styles.sectionTitle}>
                HISTORICAL FAULT SUITE &amp; DIAGNOSTIC INSPECTOR
              </h2>
              <p className={styles.sectionSubtitle}>
                Hairline experiment archive with Isolation Forest anomaly classification and 3-state AI diagnosis.
              </p>
            </div>
          </div>

          <div className={styles.activityGrid}>
            <ExperimentTable
              experiments={experiments}
              selected={selected}
              onSelect={onSelect}
              search={search}
              onSearchChange={onSearchChange}
              riskFilter={riskFilter}
              onRiskFilterChange={onRiskFilterChange}
              serviceFilter={serviceFilter}
              onServiceFilterChange={onServiceFilterChange}
              loading={loading && !data}
            />

            <ExperimentDetail experiment={selected} />
          </div>
        </div>
      </section>

      {/* ── 04 ACTIONS (Deep-Blue Band) ────────────────────────────────────── */}
      <section className={styles.bandDeepBlue} aria-labelledby="section-04-title">
        <span className={`${styles.crosshair} ${styles.crosshairLight} ${styles.tl}`}>+</span>
        <span className={`${styles.crosshair} ${styles.crosshairLight} ${styles.tr}`}>+</span>

        <div className={styles.inner}>
          <div className={`${styles.sectionHeader} ${styles.sectionHeaderLight}`}>
            <div className={`${styles.markerNumber} ${styles.markerNumberLight}`}>04</div>
            <div className={styles.sectionHeaderContent}>
              <div className={`${styles.sectionTag} ${styles.sectionTagLight}`}>
                [MODULE 04 // CONTROLLER ACTIONS]
              </div>
              <h2 id="section-04-title" className={`${styles.sectionTitle} ${styles.sectionTitleLight}`}>
                CONTROLLER DECK &amp; RESILIENCE RUNNERS
              </h2>
              <p className={`${styles.sectionSubtitle} ${styles.sectionSubtitleLight}`}>
                Deploy targeted chaos tests, manage monitored servers, and evaluate pre-deployment autoscale limits.
              </p>
            </div>
          </div>

          <div className={styles.actionsGrid}>
            <div className={styles.actionCard}>
              <div className={styles.actionTop}>
                <span className={styles.actionRefTag}>[ACT.01 // FAULT-RUN]</span>
                <h3 className={styles.actionTitle}>CHAOS INJECTION RUNNER</h3>
                <p className={styles.actionDesc}>
                  Inject latency (50-2000ms), HTTP 500 error rates, service stops, or CPU stress cycles into target nodes.
                </p>
              </div>
              <div className={styles.actionBottom}>
                <button
                  type="button"
                  className={styles.pillBtnOrange}
                  onClick={onRunExperiment}
                >
                  <span>RUN EXPERIMENT</span>
                  <span className={styles.arrowIcon}>↗</span>
                </button>
              </div>
            </div>

            <div className={styles.actionCard}>
              <div className={styles.actionTop}>
                <span className={styles.actionRefTag}>[ACT.02 // TARGET-TOPOLOGY]</span>
                <h3 className={styles.actionTitle}>TARGET SERVERS &amp; PROBES</h3>
                <p className={styles.actionDesc}>
                  Configure internal clusters and external SSRF-validated endpoints with custom ping frequencies.
                </p>
              </div>
              <div className={styles.actionBottom}>
                <button
                  type="button"
                  className={styles.pillBtnBlack}
                  onClick={() => onNavigateTab && onNavigateTab('servers')}
                >
                  <span>TARGET SERVERS</span>
                  <span className={styles.arrowIcon}>↗</span>
                </button>
              </div>
            </div>

            <div className={styles.actionCard}>
              <div className={styles.actionTop}>
                <span className={styles.actionRefTag}>[ACT.03 // PRE-DEPLOYMENT]</span>
                <h3 className={styles.actionTitle}>LOAD TESTING SUITE</h3>
                <p className={styles.actionDesc}>
                  Execute synthetic concurrency ramps up to 500 req/s to determine breaking thresholds prior to production.
                </p>
              </div>
              <div className={styles.actionBottom}>
                <button
                  type="button"
                  className={styles.pillBtnBlack}
                  onClick={() => onNavigateTab && onNavigateTab('load-testing')}
                >
                  <span>LOAD TESTING</span>
                  <span className={styles.arrowIcon}>↗</span>
                </button>
              </div>
            </div>

            <div className={styles.actionCard}>
              <div className={styles.actionTop}>
                <span className={styles.actionRefTag}>[ACT.04 // PHASE-10-LOOP]</span>
                <h3 className={styles.actionTitle}>RESILIENCE VALIDATION</h3>
                <p className={styles.actionDesc}>
                  Validate graceful degradation and circuit breaker effectiveness across baseline and post-fix runs.
                </p>
              </div>
              <div className={styles.actionBottom}>
                <button
                  type="button"
                  className={styles.pillBtnGhost}
                  onClick={onRefresh}
                >
                  <span>VALIDATION MATRIX</span>
                  <span className={styles.arrowIcon}>↗</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Floating Pill Dock Bar (Bottom Overlay matching reference) ──────── */}
      <aside className={styles.floatingDock} aria-label="Quick action dock">
        <div className={styles.dockStatus}>
          <span className={styles.dockDot}></span>
          <span>CLUSTER ONLINE // {services.length} TARGETS</span>
        </div>

        <div className={styles.dockDivider}></div>

        <button
          type="button"
          className={styles.pillBtnOrange}
          onClick={onRunExperiment}
          aria-label="Launch chaos experiment"
        >
          <span>RUN EXPERIMENT</span>
          <span className={styles.arrowIcon}>↗</span>
        </button>

        <button
          type="button"
          className={styles.dockRefreshBtn}
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh telemetry"
          title="Refresh dashboard telemetry"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={loading ? styles.spinning : undefined}
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
          </svg>
        </button>
      </aside>
    </div>
  );
}
