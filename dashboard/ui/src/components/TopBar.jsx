import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import styles from './TopBar.module.css';

export default function TopBar({
  onRefresh,
  onRunExperiment,
  loading,
  onOpenMobile,
  activeTab,
  systemStatus = 'HEALTHY',
}) {
  const { user, isOperator } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();

  const getPageTitle = () => {
    switch (activeTab) {
      case 'servers':
        return 'TARGET SYSTEMS & MONITORED SERVERS';
      case 'load-testing':
        return 'PRE-DEPLOYMENT LOAD VERIFICATION';
      case 'full-resilience':
        return 'FULL RESILIENCE TEST & AI REPORT';
      default:
        return 'RESILIENCE CONTROL ROOM & CHAOS HARNESS';
    }
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.mobileMenuBtn}
          onClick={onOpenMobile}
          aria-label="Open navigation sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className={styles.titleArea}>
          <div className={styles.moduleTag}>[SYS.CONSOLE // 01-RUNNER]</div>
          <h1 className={styles.pageTitle}>{getPageTitle()}</h1>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.statusPill} data-status={systemStatus.toLowerCase()}>
          <span className={styles.statusDot}></span>
          <span className={styles.statusLabel}>CLUSTER {systemStatus}</span>
        </div>

        <div className={styles.actions}>
          {/* Black Pill: Refresh action with rotating icon */}
          <button
            type="button"
            className={styles.pillBlack}
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh telemetry data"
          >
            <svg
              width="13"
              height="13"
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
            <span>{loading ? 'SYNCING…' : 'REFRESH'}</span>
          </button>

          {/* Orange Pill: Primary Action with arrow icon ↗ */}
          <button
            type="button"
            className={styles.pillOrange}
            onClick={onRunExperiment}
            disabled={!isOperator}
            title={!isOperator ? 'Operator role required to run experiments.' : 'Trigger chaos experiment'}
          >
            <span>RUN EXPERIMENT</span>
            <span className={styles.arrowIcon}>↗</span>
          </button>
        </div>
      </div>
    </header>
  );
}
