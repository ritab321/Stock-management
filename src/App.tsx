import React from 'react';
import { ErpProvider } from './context/ErpContext';
import { AuthGate } from './components/AuthGate';
import { ErpLayout } from './components/ErpLayout';

class ErpErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-6">
            <h1 className="font-display text-lg font-semibold text-red-700">
              Application Error
            </h1>
            <p className="mt-2 break-words font-mono text-xs text-slate-600">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErpErrorBoundary>
      <ErpProvider>
        <AuthGate>
          <ErpLayout />
        </AuthGate>
      </ErpProvider>
    </ErpErrorBoundary>
  );
}
