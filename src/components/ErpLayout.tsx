import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileSpreadsheet,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Phone,
  RotateCcw,
  Settings,
  ShoppingBag,
  Store,
  Truck,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { getNavLabel, t } from '../lib/i18n';
import { ROLE_CAPABILITIES } from '../lib/permissions';
import type { NavTab } from '../types/erp';
import { BillBookView } from './modules/BillBookView';
import { DashboardView } from './modules/DashboardView';
import { LedgersView } from './modules/LedgersView';
import { OutstandingView } from './modules/OutstandingView';
import { PaymentsView } from './modules/PaymentsView';
import { ProductsView } from './modules/ProductsView';
import { PurchasesView } from './modules/PurchasesView';
import { ReportsView } from './modules/ReportsView';
import { ReturnsView } from './modules/ReturnsView';
import { SalesView } from './modules/SalesView';
import { SettingsView } from './modules/SettingsView';
import { ShopsView } from './modules/ShopsView';
import { SuppliersView } from './modules/SuppliersView';
import { UsersView } from './modules/UsersView';
import { WarehouseView } from './modules/WarehouseView';

interface NavConfig {
  id: NavTab;
  icon: React.FC<{ className?: string }>;
  activeClass: string;
  iconActiveClass: string;
  accentHex: string;
}

const NAV_ITEMS: NavConfig[] = [
  { id: 'dashboard', icon: LayoutDashboard, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-sky-400', accentHex: '#2563EB' },
  { id: 'products', icon: Package, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-teal-400', accentHex: '#0F766E' },
  { id: 'warehouse', icon: Warehouse, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-emerald-400', accentHex: '#059669' },
  { id: 'purchases', icon: ShoppingBag, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-indigo-400', accentHex: '#4F46E5' },
  { id: 'suppliers', icon: Building2, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-violet-400', accentHex: '#7C3AED' },
  { id: 'shops', icon: Store, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-cyan-400', accentHex: '#0891B2' },
  { id: 'sales', icon: Truck, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-blue-400', accentHex: '#2563EB' },
  { id: 'billbook', icon: FileSpreadsheet, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-indigo-300', accentHex: '#5B21B6' },
  { id: 'payments', icon: CreditCard, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-emerald-400', accentHex: '#059669' },
  { id: 'outstanding', icon: AlertCircle, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-amber-400', accentHex: '#D97706' },
  { id: 'returns', icon: RotateCcw, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-rose-400', accentHex: '#DC2626' },
  { id: 'ledgers', icon: BookOpen, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-sky-300', accentHex: '#0F172A' },
  { id: 'reports', icon: BarChart3, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-pink-400', accentHex: '#DB2777' },
  { id: 'users', icon: Users, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-sky-300', accentHex: '#0F172A' },
  { id: 'settings', icon: Settings, activeClass: 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]', iconActiveClass: 'text-slate-300', accentHex: '#475569' },
];

export const ErpLayout: React.FC = () => {
  const { profile, caps, lang, setLang, logout, alerts, hasDemoData, settings } = useErp();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertsTab, setAlertsTab] = useState<'active' | 'history'>('active');
  const [reviewedIds, setReviewedIds] = useState<string[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('pdp_reviewed_alerts') : null;
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((item) => caps.allowedTabs.includes(item.id)),
    [caps.allowedTabs]
  );

  const currentTab: NavTab = caps.allowedTabs.includes(activeTab) ? activeTab : 'dashboard';
  const activeNavConfig = NAV_ITEMS.find((n) => n.id === currentTab) || NAV_ITEMS[0];

  const activeAlerts = useMemo(
    () => alerts.filter((a) => !reviewedIds.includes(a.id)),
    [alerts, reviewedIds]
  );
  const historyAlerts = useMemo(
    () => alerts.filter((a) => reviewedIds.includes(a.id)),
    [alerts, reviewedIds]
  );

  const markAlertReviewed = (id: string) => {
    const next = Array.from(new Set([...reviewedIds, id]));
    setReviewedIds(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('pdp_reviewed_alerts', JSON.stringify(next.slice(-120)));
    }
  };

  const markAllReviewed = () => {
    const next = Array.from(new Set([...reviewedIds, ...alerts.map((a) => a.id)]));
    setReviewedIds(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('pdp_reviewed_alerts', JSON.stringify(next.slice(-120)));
    }
  };

  const handleSelectTab = (tab: NavTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setAlertsOpen(false);
  };

  const renderContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardView onNavigate={handleSelectTab} />;
      case 'products':
        return <ProductsView />;
      case 'suppliers':
        return <SuppliersView />;
      case 'purchases':
        return <PurchasesView />;
      case 'warehouse':
        return <WarehouseView />;
      case 'shops':
        return <ShopsView />;
      case 'sales':
        return <SalesView />;
      case 'billbook':
        return <BillBookView />;
      case 'payments':
        return <PaymentsView />;
      case 'outstanding':
        return <OutstandingView onNavigate={handleSelectTab} />;
      case 'returns':
        return <ReturnsView />;
      case 'ledgers':
        return <LedgersView />;
      case 'reports':
        return <ReportsView />;
      case 'users':
        return <UsersView />;
      case 'settings':
        return <SettingsView />;
    }
  };

  const roleInfo = ROLE_CAPABILITIES[profile?.role || 'sales'];

  // 4 quick tabs for compact mobile bar (< 15% viewport height)
  const mobileQuickTabs = useMemo(() => {
    const preferred: NavTab[] = ['dashboard', 'billbook', 'sales', 'outstanding'];
    const filtered = preferred.filter((id) => caps.allowedTabs.includes(id));
    if (filtered.length < 4) {
      for (const item of visibleNav) {
        if (!filtered.includes(item.id) && filtered.length < 4) {
          filtered.push(item.id);
        }
      }
    }
    return filtered.map((id) => NAV_ITEMS.find((n) => n.id === id)!).filter(Boolean);
  }, [caps.allowedTabs, visibleNav]);

  return (
    <div className="flex min-h-screen bg-[#F5F7FB] text-slate-900">
      {/* Collapsible Executive Obsidian-Navy Sidebar */}
      <aside
        className={`no-print hidden shrink-0 flex-col border-r border-slate-800/80 bg-gradient-to-b from-[#0B1221] via-[#0E182D] to-[#0B1221] text-slate-200 transition-all duration-150 lg:flex ${
          sidebarCollapsed ? 'w-[74px]' : 'w-64'
        }`}
      >
        {/* Brand Block */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-4">
          {!sidebarCollapsed ? (
            <div className="flex min-w-0 items-center gap-2.5">
              {settings?.logoUrl ? (
                <img
                  src={settings.logoUrl}
                  alt={settings.businessName || 'Logo'}
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 shrink-0 rounded-lg border border-white/15 bg-white object-contain p-0.5"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#2563EB] to-[#4F46E5] font-display text-xs font-bold text-white shadow-sm">
                  P
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate font-display text-sm font-bold tracking-tight text-white">
                  {settings?.appName || t(lang, 'appName')}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-slate-400">
                  {settings?.businessName || t(lang, 'businessName')}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#2563EB] to-[#4F46E5] font-display text-xs font-bold text-white">
              P
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="ml-1 rounded-md p-1 text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label="Toggle sidebar"
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                title={getNavLabel(lang, item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                  active
                    ? `${item.activeClass} font-semibold`
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${active ? item.iconActiveClass : 'text-slate-500'}`}
                />
                {!sidebarCollapsed && (
                  <span className="truncate whitespace-nowrap">{getNavLabel(lang, item.id)}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Staff Account Footer */}
        <div className="border-t border-white/[0.08] p-3 text-xs">
          {!sidebarCollapsed && (
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.04] p-2.5">
              <div className="truncate font-semibold text-white">{profile?.displayName}</div>
              <div className="text-[11px] font-medium text-sky-400">
                {lang === 'bn' ? roleInfo.labelBn : roleInfo.label}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-slate-400">{profile?.email}</div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                <Phone className="h-3 w-3 text-slate-500" />
                <span className="font-mono tabular-nums">{settings?.phone || '95933 53980'}</span>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={logout}
            title={t(lang, 'signOut')}
            className="mt-2.5 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.10] hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!sidebarCollapsed && <span>{t(lang, 'signOut')}</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#0B1221]/60 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 flex w-72 flex-col bg-[#0B1221] text-slate-200 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3.5 text-white">
              <div>
                <div className="font-display text-sm font-bold">
                  {settings?.appName || t(lang, 'appName')}
                </div>
                <div className="text-[11px] text-slate-400">
                  {settings?.businessName || t(lang, 'businessName')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTab(item.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium ${
                      active ? `${item.activeClass} font-semibold` : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? item.iconActiveClass : 'text-slate-500'}`} />
                    <span>{getNavLabel(lang, item.id)}</span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-white/[0.08] p-4 text-xs">
              <div className="font-semibold text-white">{profile?.displayName}</div>
              <div className="text-[11px] text-sky-400">
                {lang === 'bn' ? roleInfo.labelBn : roleInfo.label}
              </div>
              <button
                type="button"
                onClick={logout}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{t(lang, 'signOut')}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        {/* Frosted Porcelain Top Bar */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-4 py-2.5 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <span className="hidden font-medium text-slate-500 sm:inline whitespace-nowrap">
                {settings?.businessName || t(lang, 'businessName')}
              </span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <span
                className="truncate font-display text-sm font-bold whitespace-nowrap"
                style={{ color: activeNavConfig.accentHex }}
              >
                {getNavLabel(lang, currentTab)}
              </span>
            </div>
          </div>

          <div className="relative flex shrink-0 items-center gap-2">
            {/* Language Switch */}
            <button
              type="button"
              onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Languages className="h-3.5 w-3.5 text-[#2563EB]" />
              <span>{lang === 'en' ? 'বাংলা' : 'English'}</span>
            </button>

            {/* Notifications Drawer Trigger */}
            <button
              type="button"
              onClick={() => setAlertsOpen((o) => !o)}
              className="relative inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Bell className={`h-3.5 w-3.5 ${activeAlerts.length > 0 ? 'text-amber-600' : 'text-slate-600'}`} />
              <span className="font-mono tabular-nums">{activeAlerts.length}</span>
            </button>

            {alertsOpen && (
              <div className="absolute right-0 top-11 z-40 w-80 rounded-xl border border-slate-200 bg-white shadow-lg sm:w-96">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 text-xs font-semibold text-[#172554]">
                  <span>
                    {t(lang, 'notifications')} ({activeAlerts.length})
                  </span>
                  <div className="flex items-center gap-2">
                    {activeAlerts.length > 0 && (
                      <button
                        type="button"
                        onClick={markAllReviewed}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2563EB] hover:underline"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        <span>Mark all read</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAlertsOpen(false)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Alert Tabs */}
                <div className="flex border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setAlertsTab('active')}
                    className={`rounded-md px-2.5 py-1 transition-colors ${
                      alertsTab === 'active' ? 'bg-white text-[#172554] shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Active ({activeAlerts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlertsTab('history')}
                    className={`rounded-md px-2.5 py-1 transition-colors ${
                      alertsTab === 'history' ? 'bg-white text-[#172554] shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    History ({historyAlerts.length})
                  </button>
                </div>

                <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                  {(alertsTab === 'active' ? activeAlerts : historyAlerts).length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-slate-500">
                      {alertsTab === 'active' ? 'No active alerts right now.' : 'No reviewed alerts in history.'}
                    </p>
                  ) : (
                    (alertsTab === 'active' ? activeAlerts : historyAlerts).map((al) => (
                      <div key={al.id} className="flex items-start justify-between gap-2 px-4 py-2.5 hover:bg-slate-50">
                        <button
                          type="button"
                          onClick={() => handleSelectTab(al.targetTab as NavTab)}
                          className="min-w-0 flex-1 text-left text-xs"
                        >
                          <div
                            className={`font-semibold ${
                              al.severity === 'critical'
                                ? 'text-[#DC2626]'
                                : al.severity === 'warning'
                                ? 'text-[#EA580C]'
                                : 'text-[#2563EB]'
                            }`}
                          >
                            {al.title}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">{al.description}</div>
                        </button>
                        {alertsTab === 'active' && (
                          <button
                            type="button"
                            onClick={() => markAlertReviewed(al.id)}
                            title="Mark reviewed"
                            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-[#16A34A]"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Demo Mode Banner */}
        {hasDemoData && (
          <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6">
            <span>{t(lang, 'demo_banner')}</span>
            {caps.canManageDemoData && (
              <button
                type="button"
                onClick={() => handleSelectTab('settings')}
                className="font-semibold text-amber-900 underline hover:text-amber-700"
              >
                Manage Demo Data
              </button>
            )}
          </div>
        )}

        {/* Active Module Viewport */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6">
          {renderContent()}
        </main>
      </div>

      {/* Compact Mobile Bottom Quick Navigation (<= 56px, well under 15% mobile height) */}
      <nav className="no-print fixed bottom-0 left-0 right-0 z-30 flex h-14 items-center justify-around border-t border-slate-200 bg-white px-2 lg:hidden">
        {mobileQuickTabs.map((item) => {
          const Icon = item.icon;
          const active = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectTab(item.id)}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-semibold"
              style={{ color: active ? item.accentHex : '#64748b' }}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="max-w-[72px] truncate">{getNavLabel(lang, item.id)}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-semibold text-slate-600"
        >
          <Menu className="h-4 w-4 shrink-0" />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
};
