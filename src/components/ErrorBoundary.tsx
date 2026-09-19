// ============================================================================
// WINRAH - Error Boundary Component
// Prevents White Screen of Death (WSOD) across all platforms & devices
// ============================================================================

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Captured unhandled exception in ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            background: 'var(--bg-page, #F8F9FB)',
            color: 'var(--text-primary, #1E293B)',
            fontFamily: 'var(--font-sans, sans-serif)',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '440px',
              width: '100%',
              padding: '1.75rem',
              textAlign: 'center',
              background: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem auto',
              }}
            >
              <AlertCircle size={24} />
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.5rem', color: '#1E293B' }}>
              Problème temporaire d'affichage
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#64748B', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Une erreur inattendue a été évitée. Vos données locales dans l'entrepôt sont en parfaite sécurité.
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="btn btn-primary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <RotateCcw size={16} />
              <span>Recharger l'application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
