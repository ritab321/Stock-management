import React from 'react';
import { ShieldAlert, LogOut, Languages, Building2, CheckCircle2 } from 'lucide-react';
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-700">{t(lang, 'loading')}</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="flex min-h-screen flex-col justify-between bg-slate-50 p-6">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between py-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-bold text-slate-900">
              {t(lang, 'appName')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Languages className="h-4 w-4 text-blue-600" />
            <span>{lang === 'en' ? 'বাংলা' : 'English'}</span>
          </button>
        </div>

        <div className="mx-auto grid w-full max-w-5xl items-stretch gap-8 py-8 lg:grid-cols-12">
          <div className="flex flex-col justify-center lg:col-span-7">
            <p className="text-xs font-semibold tracking-wide text-blue-600">
              {t(lang, 'businessName')} · {t(lang, 'location')}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl [text-wrap:balance]">
              {t(lang, 'signInTitle')}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
              {t(lang, 'signInSubtitle')}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                'Central Warehouse & FIFO Batch Costing',
                'Direct Supplier-to-Shop Dispatch & Profit Tracking',
                'Paschim Medinipur Area & Credit Limit Ledgers',
                'Multi-Role Permissions & Audit Logs',
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-xs font-medium text-slate-700"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-7 lg:col-span-5">
            <h2 className="font-display text-xl font-semibold text-slate-900">
              {t(lang, 'appName')}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Firebase Authentication · Multi-User RBAC Workspace
            </p>

            {authError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={loginWithGoogle}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"
                />
              </svg>
              <span>{t(lang, 'signInButton')}</span>
            </button>

            <div className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
              <p className="font-medium text-slate-700">Role-Based Access Control</p>
              <p className="mt-1">
                Owner, Manager, Sales Staff, Accounts Staff, and Stock Manager sign in with their authorized Google email.
              </p>
            </div>
          </div>
        </div>

        <footer className="mx-auto w-full max-w-5xl border-t border-slate-200 py-4 text-xs text-slate-500">
          {t(lang, 'businessName')} · {t(lang, 'location')} · INR (₹) · IST (Asia/Kolkata)
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7">
          <div className="flex items-center gap-3 text-red-600">
            <ShieldAlert className="h-6 w-6 shrink-0" />
            <h1 className="font-display text-lg font-semibold text-slate-900">
              {t(lang, titleKey)}
            </h1>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{t(lang, bodyKey)}</p>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
            Signed in as: <span className="font-medium text-slate-900">{firebaseUser.email}</span>
          </div>
          {authError && (
            <p className="mt-3 text-xs text-red-600">{authError}</p>
          )}
          <button
            type="button"
            onClick={logout}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
