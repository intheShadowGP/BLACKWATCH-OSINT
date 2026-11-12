import { Component, lazy, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter, Route, Routes, Link } from 'react-router-dom';
import { I18nProvider, translate, type Lang } from '@/i18n';
import { AppProvider } from './context';
import { AppLayout } from '@/layouts/AppLayout';

// Every page is code-split and loaded on demand.
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Investigations = lazy(() => import('@/modules/investigation-manager/InvestigationsPage'));
const InvestigationDetail = lazy(() => import('@/modules/investigation-manager/InvestigationDetail'));
const SearchLauncher = lazy(() => import('@/modules/automation-engine/SearchLauncher'));
const Automation = lazy(() => import('@/modules/automation-engine/AutomationPage'));
const Username = lazy(() => import('@/modules/username-intelligence/UsernamePage'));
const Domain = lazy(() => import('@/modules/domain-ip-intelligence/DomainPage'));
const Email = lazy(() => import('@/modules/email-intelligence/EmailPage'));
const Socmint = lazy(() => import('@/modules/socmint/SocmintPage'));
const Dorks = lazy(() => import('@/modules/search-intelligence/DorksPage'));
const Geoint = lazy(() => import('@/modules/geoint/GeointPage'));
const ImagePage = lazy(() => import('@/modules/image-metadata/ImagePage'));
const Graph = lazy(() => import('@/modules/link-analysis/GraphPage'));
const Timeline = lazy(() => import('@/modules/timeline/TimelinePage'));
const Reports = lazy(() => import('@/modules/report-generator/ReportsPage'));
const Sources = lazy(() => import('@/pages/SourcesPage'));
const Settings = lazy(() => import('@/pages/SettingsPage'));

function NotFound() {
  const lang = (document.documentElement.lang as Lang) || 'en';
  return (
    <div className="py-20 text-center">
      <p className="text-lg">{translate(lang, 'error.notFound')}</p>
      <Link to="/" className="text-bw-gold hover:underline">
        {translate(lang, 'nav.dashboard')}
      </Link>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      const lang = (document.documentElement.lang as Lang) || 'en';
      return (
        <div role="alert" className="mx-auto max-w-xl py-20 text-center">
          <h1 className="text-xl font-semibold text-bw-red-bright">{translate(lang, 'error.crashTitle')}</h1>
          <p className="mt-2 text-sm text-bw-muted">{translate(lang, 'error.crashBody')}</p>
          <pre className="mt-4 overflow-auto rounded border border-bw-border bg-bw-panel p-3 text-left text-xs text-bw-muted">{this.state.error.message.slice(0, 500)}</pre>
          <button type="button" className="mt-4 rounded border border-bw-border px-3 py-1.5 text-sm" onClick={() => this.setState({ error: null })}>
            {translate(lang, 'error.retry')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <I18nProvider>
      <ErrorBoundary>
        <AppProvider>
          <HashRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="investigations" element={<Investigations />} />
                <Route path="investigations/:id" element={<InvestigationDetail />} />
                <Route path="search" element={<SearchLauncher />} />
                <Route path="automation" element={<Automation />} />
                <Route path="username" element={<Username />} />
                <Route path="domain" element={<Domain />} />
                <Route path="email" element={<Email />} />
                <Route path="socmint" element={<Socmint />} />
                <Route path="dorks" element={<Dorks />} />
                <Route path="geoint" element={<Geoint />} />
                <Route path="image" element={<ImagePage />} />
                <Route path="graph" element={<Graph />} />
                <Route path="timeline" element={<Timeline />} />
                <Route path="reports" element={<Reports />} />
                <Route path="sources" element={<Sources />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </HashRouter>
        </AppProvider>
      </ErrorBoundary>
    </I18nProvider>
  );
}
