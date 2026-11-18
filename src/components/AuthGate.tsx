import React from 'react';
import { ShieldAlert, LogOut, Languages, Building2, CheckCircle2, Phone, MapPin } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { t } from '../lib/i18n';

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    firebaseUser,
    authLoading,
    authError,
    accessDeniedReason,
    profile,
    lang,
    setLang,
    loginWithGoogle,
    logout,
  } = useErp();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FB] p-6">
        <div className="w-full max-w-sm rounded-xl border border-slate-200/90 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" />
          <p className="text-sm font-medium text-slate-700">{t(lang, 'loading')}</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="flex min-h-screen flex-col justify-between bg-[#F5F7FB]">
        {/* Top Frosted Header Strip */}
        <header className="border-b border-slate-200/80 bg-white/90 px-6 py-3.5 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6">
            <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0B1221] text-white shadow-xs">
                <Building2 className="h-5 w-5 text-sky-400" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight text-[#0B1221]">
                {t(lang, 'appName')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
              className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Languages className="h-4 w-4 text-[#2563EB]" />
              <span>{lang === 'en' ? 'বাংলা' : 'English'}</span>
            </button>
          </div>
        </header>

        {/* Main Split Workspace Login */}
        <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-6 py-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-[#0B1221] via-[#121F3B] to-[#1A2F5A] p-8 text-white shadow-lg">
              <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/15 blur-3xl" />
              <div className="relative">
                <div className="text-xs font-medium text-sky-300">
                  {t(lang, 'businessName')} · Wholesale Distribution ERP
                </div>
                <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl [text-wrap:balance]">
                  {t(lang, 'signInTitle')}
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
                  {t(lang, 'signInSubtitle')}
                </p>

                <div className="mt-6 flex flex-wrap gap-5 border-t border-white/10 pt-5 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-sky-400" />
                    <span>{t(lang, 'location')}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                    <Phone className="h-3.5 w-3.5 text-emerald-400" />
                    <span>+91 {t(lang, 'phone')}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                { title: 'Warehouse & FIFO Batches', desc: 'Track rack stock, low-stock alerts, and batch rates.' },
                { title: 'Digital Bill Book', desc: 'A4, A5, 80mm & 58mm thermal bills with WhatsApp share.' },
                { title: 'Direct Supplier Dispatch', desc: 'Route factory deliveries directly to Paschim Medinipur shops.' },
                { title: 'Multi-Role Accounting', desc: 'Customer ledgers, supplier payables, and full audit trail.' },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-3 rounded-xl border border-slate-200/85 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <div className="text-xs font-semibold text-[#0B1221]">{item.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-sm lg:col-span-5">
            <h2 className="font-display text-xl font-bold text-[#0B1221]">
              {t(lang, 'appName')}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Firebase Authentication · Authorized Staff Portal
            </p>

            {authError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={loginWithGoogle}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-[#0B1221] px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#172554] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"
                />
              </svg>
              <span>{t(lang, 'signInButton')}</span>
            </button>

            <div className="mt-6 divide-y divide-slate-100 border-t border-slate-100 pt-4 text-xs text-slate-600">
              <div className="pb-3">
                <div className="font-semibold text-[#0B1221]">Role-Based Access Control</div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Owner, Manager, Sales Staff, Accounts Staff, and Stock Manager sign in with their authorized Google account.
                </p>
              </div>
              <div className="pt-3 text-[11px] text-slate-500">
                Need access? Contact <span className="font-semibold text-slate-800">Pramanik Digital Point</span> ({t(lang, 'phone')}).
              </div>
            </div>
          </div>
        </div>

        <footer className="border-t border-slate-200/80 bg-white px-6 py-4 text-xs text-slate-500">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <span>
              {t(lang, 'businessName')} · {t(lang, 'location')} · Ph: {t(lang, 'phone')}
            </span>
            <span>Currency: INR (₹) · DD-MM-YYYY · Asia/Kolkata</span>
          </div>
        </footer>
      </div>
    );
  }

  if (!profile) {
    const titleKey =
      accessDeniedReason === 'deactivated' ? 'deactivatedTitle' : 'unauthorizedTitle';
    const bodyKey =
      accessDeniedReason === 'deactivated' ? 'deactivatedBody' : 'unauthorizedBody';

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FB] p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-7 shadow-sm">
          <div className="flex items-center gap-3 text-[#DC2626]">
            <ShieldAlert className="h-6 w-6 shrink-0" />
            <h1 className="font-display text-lg font-bold text-[#0B1221]">
              {t(lang, titleKey)}
            </h1>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{t(lang, bodyKey)}</p>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
            Signed in as: <span className="font-semibold text-slate-900">{firebaseUser.email}</span>
          </div>
          {authError && <p className="mt-3 text-xs text-[#DC2626]">{authError}</p>}
          <button
            type="button"
            onClick={logout}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            <span>{t(lang, 'signOut')}</span>
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
