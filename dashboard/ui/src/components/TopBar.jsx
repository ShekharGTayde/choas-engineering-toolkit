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
        return 'Target Systems & Monitored Servers';
      case 'load-testing':
        return 'Pre-Deployment Load Testing';
      default:
        return 'Chaos Control Room & Resilience Experiments';
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
          <h1 className={styles.pageTitle}>{getPageTitle()}</h1>
          <div className={styles.metaRow}>
            <span className={styles.statusPill} data-status={systemStatus.toLowerCase()}>
              <span className={styles.statusDot}></span>
              <span>Cluster {systemStatus}</span>
            </span>
            <span className={styles.separator}>/</span>
            <span className={styles.roleTag} data-role={user?.role}>
              {user?.role || 'Operator'}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.themeToggleBtn}
          onClick={toggleTheme}
          title={`Switch to ${isDark ? 'Daylight (Light)' : 'Night Ops (Dark)'} theme`}
        >
          {isDark ? '☀️ Light' : '🌙 Dark'}
        </button>

        <button
          type="button"
          className={styles.btnSecondary}
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh data"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={loading ? styles.spinning : undefined}
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
          <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
        </button>

        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onRunExperiment}
          disabled={!isOperator}
          title={!isOperator ? 'Viewer role is read-only. Operator role required to run experiments.' : 'Configure and trigger chaos experiment'}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Run Experiment</span>
        </button>
      </div>
    </header>
  );
}
