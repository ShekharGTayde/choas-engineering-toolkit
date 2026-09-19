import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import styles from './Sidebar.module.css';

export default function Sidebar({ activeTab, onTabChange, mobileOpen, onCloseMobile }) {
  const { user, logout, isOperator } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();

  const navItems = [
    {
      id: 'dashboard',
      label: 'Control Room',
      description: 'Experiments & metrics',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      ),
    },
    {
      id: 'servers',
      label: 'Target Servers',
      description: 'Internal & external URLs',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
          <line x1="6" y1="6" x2="6.01" y2="6" />
          <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
      ),
    },
    {
      id: 'load-testing',
      label: 'Load Testing',
      description: 'Pre-deployment validation',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 20V10" />
          <path d="M12 20V4" />
          <path d="M6 20v-6" />
        </svg>
      ),
    },
  ];

  const handleNavClick = (id) => {
    onTabChange(id);
    if (onCloseMobile) onCloseMobile();
  };

  const getInitials = (name) => {
    if (!name) return 'OP';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };

  return (
    <>
      {mobileOpen && <div className={styles.backdrop} onClick={onCloseMobile} />}

      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.topSection}>
          <div className={styles.brandRow}>
            <div className={styles.logoMark}>
              <span className={styles.pulseDot}></span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div className={styles.brandText}>
              <span className={styles.brandTitle}>ChaosGuard</span>
              <span className={styles.brandSub}>Console v1.0</span>
            </div>
            {mobileOpen && (
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onCloseMobile}
                aria-label="Close sidebar"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <nav className={styles.navigation}>
          <div className={styles.navGroupTitle}>System Operations</div>
          <ul className={styles.navList}>
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                    onClick={() => handleNavClick(item.id)}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    <div className={styles.navText}>
                      <span className={styles.navLabel}>{item.label}</span>
                      <span className={styles.navDesc}>{item.description}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={styles.bottomSection}>
          <div className={styles.themeToggleRow}>
            <span className={styles.themeLabel}>Theme: {isDark ? 'Night Ops' : 'Daylight'}</span>
            <button
              type="button"
              className={styles.themeBtn}
              onClick={toggleTheme}
              title={`Switch to ${isDark ? 'Daylight (Light)' : 'Night Ops (Dark)'} theme`}
            >
              {isDark ? '☀️ Daylight' : '🌙 Night Ops'}
            </button>
          </div>

          <div className={styles.userCard}>
            <div className={styles.userAvatar}>
              {getInitials(user?.name)}
            </div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user?.name || 'Authorized User'}</span>
              <span className={styles.userRoleBadge} data-role={user?.role}>
                {user?.role || 'Operator'}
              </span>
            </div>
            <button
              type="button"
              className={styles.logoutBtn}
              onClick={logout}
              title="Sign out of console"
              aria-label="Sign out"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
