'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };

type State = { hasError: boolean };

/**
 * Onboarding / tour UI runs inside PortalEntryClient; if it throws, this keeps
 * the rest of the dashboard route from activating `dashboard/error.tsx`.
 */
export default class PortalEntryErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PortalEntryErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div data-portal-error-state="portal-entry" className="portal-card portal-card--flat" style={{ maxWidth: 900, margin: '1rem auto', padding: '1.25rem' }} role="status">
          <p style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>Part of this page could not load</p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
            Onboarding or the guided tour hit an error. You can still use the rest of the member portal — try refreshing,
            or continue from the menu.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
