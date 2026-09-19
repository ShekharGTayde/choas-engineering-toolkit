import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import ServiceHealthStrip from './components/ServiceHealthStrip.jsx';
import SummaryCards from './components/SummaryCards.jsx';
import ExperimentTable from './components/ExperimentTable.jsx';
import ExperimentDetail from './components/ExperimentDetail.jsx';
import RunExperimentDialog from './components/RunExperimentDialog.jsx';
import ServersPage from './components/ServersPage.jsx';
import LoadTestingPage from './components/LoadTestingPage.jsx';
import Toast from './components/Toast.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import ErrorScreen from './components/ErrorScreen.jsx';
import LoginPage from './components/LoginPage.jsx';
import RegisterPage from './components/RegisterPage.jsx';

const POLL_INTERVAL_MS = 30_000;

function AuthRouter() {
  const { user, loading: authLoading } = useAuth();
  const [authView, setAuthView] = useState('login'); // 'login' | 'register'

  if (authLoading) return <LoadingScreen />;
  if (!user) {
    return authView === 'register' ? (
      <RegisterPage onNavigateToLogin={() => setAuthView('login')} />
    ) : (
      <LoginPage onNavigateToRegister={() => setAuthView('register')} />
    );
  }

  return <Dashboard />;
}

function Dashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Dashboard API returned ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      if (!silent) {
        setSelected((prev) => {
          if (prev) return json.experiments.find((e) => e.experimentId === prev.experimentId) || prev;
          return json.experiments.find((e) => e.experimentId === 'EXP-112') || json.experiments[0] || null;
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(false); }, [loadData]);

  useEffect(() => {
    const id = setInterval(() => loadData(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadData]);

  const handleRefresh = () => {
    loadData(false);
    addToast('Dashboard refreshed', 'success');
  };

  const handleExperimentComplete = () => {
    loadData(true);
    addToast('Experiment completed — data refreshed', 'success');
  };

  // Derive a simple system status from loaded service health data
  const systemStatus = (() => {
    if (!data?.services) return 'HEALTHY';
    const statuses = data.services.map((s) => (s.status || '').toUpperCase());
    if (statuses.some((s) => s === 'DOWN' || s === 'CRITICAL')) return 'CRITICAL';
    if (statuses.some((s) => s === 'DEGRADED')) return 'DEGRADED';
    return 'HEALTHY';
  })();

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorScreen message={error} onRetry={() => loadData(false)} />;

  return (
    <div className="app">
      {/* Fixed sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Main content area — pushed right by sidebar on desktop */}
      <div className="app-body">
        <TopBar
          onRefresh={handleRefresh}
          onRunExperiment={() => setRunDialogOpen(true)}
          loading={loading}
          activeTab={activeTab}
          systemStatus={systemStatus}
          onOpenMobile={() => setMobileOpen(true)}
        />

        <main className="main">
          {/* ── Dashboard tab ── */}
          {activeTab === 'dashboard' && data && (
            <>
              <ServiceHealthStrip services={data.services} />
              <SummaryCards metrics={data.metrics} />
              <div className="content-grid">
                <ExperimentTable
                  experiments={data.experiments}
                  selected={selected}
                  onSelect={(exp) => setSelected(exp)}
                  search={search}
                  onSearchChange={setSearch}
                  riskFilter={riskFilter}
                  onRiskFilterChange={setRiskFilter}
                  serviceFilter={serviceFilter}
                  onServiceFilterChange={setServiceFilter}
                />
                <ExperimentDetail experiment={selected} />
              </div>
            </>
          )}

          {/* ── Servers tab ── */}
          {activeTab === 'servers' && (
            <ServersPage addToast={addToast} />
          )}

          {/* ── Pre-Deployment Load Testing tab ── */}
          {activeTab === 'load-testing' && (
            <LoadTestingPage addToast={addToast} />
          )}

          {error && data && (
            <div className="refresh-error">
              Background refresh failed: {error}
            </div>
          )}
        </main>
      </div>

      <RunExperimentDialog
        open={runDialogOpen}
        onClose={() => setRunDialogOpen(false)}
        onComplete={handleExperimentComplete}
        addToast={addToast}
      />

      <div className="toast-area" aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} message={t.message} type={t.type} />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return <AuthRouter />;
}
