'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { CircleAlert, RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Generic React error boundary.
 * Catches errors in child components and renders a friendly fallback UI
 * with a "Try again" button to reset the error state.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return (
          <div data-portal-error-state="component-boundary" style={{ display: 'contents' }}>
            {this.props.fallback}
          </div>
        );
      }

      return (
        <div
          className="portal-card portal-card--flat"
          data-portal-error-state="component-boundary"
          style={{
            maxWidth: 520,
            margin: '1.5rem auto',
            padding: '1.5rem',
            textAlign: 'center',
          }}
          role="alert"
          aria-live="polite"
        >
          <div
            style={{
              width: '3rem',
              height: '3rem',
              borderRadius: '999px',
              background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.75rem',
            }}
          >
            <CircleAlert size={24} aria-hidden="true" style={{ color: 'var(--color-accent)' }} />
          </div>
          <h2
            style={{
              fontSize: '1.0625rem',
              fontWeight: 700,
              color: 'var(--color-on-surface)',
              margin: '0 0 0.5rem',
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--color-on-surface-variant)',
              lineHeight: 1.55,
              margin: '0 0 1.25rem',
            }}
          >
            This part of the page could not load. You can try again or continue
            using the rest of the dashboard.
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              className="btn btn-primary"
              onClick={this.handleReset}
              style={{ minHeight: 44 }}
            >
              <RefreshCw size={16} aria-hidden="true" style={{ marginRight: '0.25rem' }} />
              Try again
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={this.handleReload}
              style={{ minHeight: 44 }}
            >
              <RotateCcw size={16} aria-hidden="true" style={{ marginRight: '0.25rem' }} />
              Reload page
            </button>
            <a
              href="mailto:info@workforceap.org"
              className="btn btn-ghost"
              style={{ minHeight: 44 }}
            >
              Contact support
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
