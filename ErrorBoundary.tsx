import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl max-w-2xl w-full space-y-8">
            <div className="w-24 h-24 bg-red-100 rounded-full mx-auto flex items-center justify-center text-red-600 shadow-inner">
              <AlertCircle size={48} />
            </div>
            <div className="text-center">
              <h1 className="text-4xl font-black text-slate-900 mb-4">Something went wrong</h1>
              <p className="text-slate-500 font-medium text-lg">
                We encountered an unexpected error. Please try refreshing the page.
              </p>
            </div>
            {this.state.error && (
              <div className="bg-slate-50 p-6 rounded-2xl overflow-auto max-h-64 border border-slate-100">
                <p className="text-red-600 font-mono text-sm break-words">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-lg hover:bg-slate-800 transition-colors"
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
