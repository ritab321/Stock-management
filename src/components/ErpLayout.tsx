import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CreditCard,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
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
import { DashboardView } from './modules/DashboardView';
import { LedgersView } from './modules/LedgersView';
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

const NAV_ITEMS: Array<{ id: NavTab; icon: React.FC<{ className?: string }> }> = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'products', icon: Package },
  { id: 'suppliers', icon: Building2 },
  { id: 'purchases', icon: ShoppingBag },
  { id: 'warehouse', icon: Warehouse },
  { id: 'shops', icon: Store },
  { id: 'sales', icon: Truck },
  { id: 'payments', icon: CreditCard },
  { id: 'returns', icon: RotateCcw },
  { id: 'ledgers', icon: BookOpen },
  { id: 'reports', icon: BarChart3 },
  { id: 'users', icon: Users },
  { id: 'settings', icon: Settings },
];

export const ErpLayout: React.FC = () => {
  const { profile, caps, lang, setLang, logout, alerts, hasDemoData, settings } = useErp();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((item) => caps.allowedTabs.includes(item.id)),
    [caps.allowedTabs]
  );

  const currentTab: NavTab = caps.allowedTabs.includes(activeTab) ? activeTab : 'dashboard';

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
      case 'payments':
        return <PaymentsView />;
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

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="font-display text-base font-bold tracking-tight text-slate-900">
            {settings?.appName || t(lang, 'appName')}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {settings?.businessName || t(lang, 'businessName')} · Singda, Dantan
          </div>
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
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="truncate">{getNavLabel(lang, item.id)}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 text-xs">
          <div className="font-semibold text-slate-900 truncate">{profile?.displayName}</div>
          <div className="text-[11px] text-blue-700">
            {lang === 'bn' ? roleInfo.labelBn : roleInfo.label}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-slate-400">{profile?.email}</div>
          <button
            type="button"
            onClick={logout}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{t(lang, 'signOut')}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
              <span className="font-display text-sm font-bold text-slate-900">
                {t(lang, 'appName')}
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded p-1 text-slate-500"
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
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium ${
                      active ? 'bg-blue-50 text-blue-700' : 'text-slate-600'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{getNavLabel(lang, item.id)}</span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-slate-200 p-4">
              <button
                type="button"
                onClick={logout}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{t(lang, 'signOut')}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="hidden sm:inline">{t(lang, 'businessName')}</span>
                <span className="hidden sm:inline text-slate-300">/</span>
                <span className="truncate font-semibold text-slate-900">
                  {getNavLabel(lang, currentTab)}
                </span>
              </div>
            </div>
          </div>

          <div className="relative flex shrink-0 items-center gap-2">
            {/* Language Switch */}
            <button
              type="button"
              onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Languages className="h-3.5 w-3.5 text-blue-600" />
              <span>{lang === 'en' ? 'বাংলা' : 'English'}</span>
            </button>

            {/* Notifications Drawer Trigger */}
            <button
              type="button"
              onClick={() => setAlertsOpen((o) => !o)}
              className="relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Bell className="h-3.5 w-3.5 text-slate-600" />
              <span className="font-mono tabular-nums">{alerts.length}</span>
            </button>

            {alertsOpen && (
              <div className="absolute right-0 top-11 z-40 w-80 rounded-xl border border-slate-200 bg-white shadow-lg sm:w-96">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-900">
                  <span>
                    {t(lang, 'notifications')} ({alerts.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setAlertsOpen(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                  {alerts.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-slate-500">
                      No active alerts right now.
                    </p>
                  ) : (
                    alerts.map((al) => (
                      <button
                        key={al.id}
                        type="button"
                        onClick={() => handleSelectTab(al.targetTab as NavTab)}
                        className="block w-full px-4 py-2.5 text-left text-xs hover:bg-slate-50"
                      >
                        <div
                          className={`font-semibold ${
                            al.severity === 'critical'
                              ? 'text-red-700'
                              : al.severity === 'warning'
                              ? 'text-amber-700'
                              : 'text-blue-700'
                          }`}
                        >
                          {al.title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">{al.description}</div>
                      </button>
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
    </div>
  );
};
