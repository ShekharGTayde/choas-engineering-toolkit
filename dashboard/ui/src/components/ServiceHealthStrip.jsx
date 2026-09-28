import styles from './ServiceHealthStrip.module.css';

export default function ServiceHealthStrip({ services = [], loading = false }) {
  if (loading) {
    return (
      <div className={styles.stripLoading}>
        <div className={styles.skeletonBlock}></div>
        <div className={styles.skeletonBlock}></div>
        <div className={styles.skeletonBlock}></div>
      </div>
    );
  }

  const allUp = services.length > 0 && services.every((s) => s.status === 'UP');

  return (
    <section className={styles.stripContainer} aria-label="Target service health telemetry">
      <div className={styles.stripHeader}>
        <div className={styles.tag}>[MODULE // CLUSTER-MONITOR]</div>
        <div className={styles.headerTitle}>
          <span className={`${styles.statusDot} ${allUp ? styles.dotUp : styles.dotDegraded}`} />
          <span className={styles.titleText}>LIVE SERVICE NODES & HEALTH PROBES</span>
        </div>
        <div className={styles.metaBadge}>
          {allUp ? 'ALL 3 NODES OPERATIONAL' : 'DEGRADATION DETECTED'}
        </div>
      </div>

      <div className={styles.grid}>
        {services.length === 0 ? (
          <div className={styles.emptyState}>
            <span>NO TARGET SERVICES DISCOVERED. CHECK HEALTH CONFIGURATION.</span>
          </div>
        ) : (
          services.map((svc, index) => {
            const isUp = svc.status === 'UP';
            return (
              <div
                key={svc.name}
                className={`${styles.card} ${isUp ? styles.cardUp : styles.cardDown}`}
              >
                <span className={`${styles.crosshair} ${styles.tl}`}>+</span>
                <span className={`${styles.crosshair} ${styles.tr}`}>+</span>

                <div className={styles.cardTop}>
                  <span className={styles.nodeCode}>NODE 0{index + 1}</span>
                  <span className={styles.protocol}>HTTP / 1.1</span>
                </div>

                <div className={styles.cardMain}>
                  <div className={styles.serviceName}>{svc.name.toUpperCase()} SERVICE</div>
                  <div className={styles.serviceRole}>
                    {svc.name.toLowerCase() === 'payment'
                      ? 'Transactional Engine & Circuit Breaker'
                      : svc.name.toLowerCase() === 'order'
                      ? 'Ingress Gateway & State Orchestrator'
                      : 'Async Notification Fallback (Fire & Forget)'}
                  </div>
                </div>

                <div className={styles.cardBottom}>
                  <div className={styles.statusIndicator}>
                    <span className={`${styles.livePulse} ${isUp ? styles.pulseGreen : styles.pulseRed}`} />
                    <span className={styles.statusWord}>{isUp ? 'OPERATIONAL' : 'OFFLINE // DEGRADED'}</span>
                  </div>
                  <span className={styles.latencyTag}>{isUp ? '< 45ms' : 'ERR / TIMEOUT'}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
