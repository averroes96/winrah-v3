// ============================================================================
// WINRAH - Official Brand Identity & Logo Component
// Iconic shoe silhouette integrated with warehouse locator beacon ("وين راه؟")
// ============================================================================

import React from 'react';
import { useI18n } from '../i18n';

interface LogoProps {
  size?: number;
  showText?: boolean;
  showTagline?: boolean;
  variant?: 'horizontal' | 'vertical' | 'mark-only';
  onClick?: () => void;
  className?: string;
}

export const LogoMark: React.FC<{ size?: number; className?: string }> = ({ size = 36, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ flexShrink: 0, transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
    >
      <defs>
        {/* Background Slate Gradient */}
        <linearGradient id="winrah-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="50%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#0B1120" />
        </linearGradient>

        {/* Primary Vibrant Amber Gradient */}
        <linearGradient id="winrah-amber-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCD34D" />
          <stop offset="40%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>

        {/* Sneaker Accent Gradient */}
        <linearGradient id="winrah-accent-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#FEF3C7" />
        </linearGradient>

        {/* Radar Beacon Glow */}
        <filter id="winrah-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#F59E0B" floodOpacity="0.45" />
        </filter>
        <filter id="winrah-pin-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#10B981" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Rounded Squircle Container */}
      <rect
        x="5"
        y="5"
        width="110"
        height="110"
        rx="28"
        fill="url(#winrah-bg-grad)"
        stroke="#334155"
        strokeWidth="2"
      />

      {/* High-tech Subtle Warehouse Mesh Guidelines */}
      <path
        d="M26 42 H94 M26 62 H94 M26 82 H94"
        stroke="#334155"
        strokeWidth="1.2"
        strokeDasharray="3 3"
        opacity="0.55"
      />
      <path
        d="M38 26 V94 M60 26 V94 M82 26 V94"
        stroke="#334155"
        strokeWidth="1.2"
        strokeDasharray="3 3"
        opacity="0.35"
      />

      {/* Warehouse Shelf Base Beam */}
      <rect x="24" y="74" width="72" height="5" rx="2.5" fill="#475569" opacity="0.9" />

      {/* Stylized Modern Sneaker Shoe Silhouette */}
      <path
        d="M31 71 C33 63 38 59 45 59 H55 C60 55 66 50 76 50 C83 50 87 54 89 60 L91 67 C91 69.5 89 71 86 71 Z"
        fill="url(#winrah-amber-grad)"
        filter="url(#winrah-glow)"
      />

      {/* Dynamic Sneaker Swoosh / Speed Accent Stripe */}
      <path
        d="M48 65 C58 64 68 59 78 54 C74 57 65 64 54 67 Z"
        fill="#FFFFFF"
        opacity="0.85"
      />

      {/* Shoe Sole / Tread Contour */}
      <path
        d="M28 72 C28 70 30 69 32 69 H86 C88.5 69 90 70 90 72 L88.5 76 C88.5 77.2 87.2 78 85 78 H33 C31 78 29.5 77.2 29 75.5 Z"
        fill="url(#winrah-accent-grad)"
      />

      {/* Tread Grooves */}
      <path
        d="M38 72 V77 M48 72 V77 M58 72 V77 M68 72 V77 M78 72 V77"
        stroke="#0F172A"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.4"
      />

      {/* Radar Target Beacon ("وين راه؟" Locator Pin) */}
      <g transform="translate(60, 21)" filter="url(#winrah-pin-glow)">
        {/* Pulsing signal ring */}
        <circle cx="0" cy="11" r="14" stroke="#F59E0B" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
        
        {/* Location Pin Shape */}
        <path
          d="M0 0 C-6.2 0 -11 4.8 -11 11 C-11 18.5 0 29 0 29 C0 29 11 18.5 11 11 C11 4.8 6.2 0 0 0 Z"
          fill="url(#winrah-amber-grad)"
        />
        
        {/* Pin Center Core */}
        <circle cx="0" cy="11" r="4.2" fill="#0F172A" />
        <circle cx="0" cy="11" r="2.2" fill="#10B981" />
      </g>
    </svg>
  );
};

export const Logo: React.FC<LogoProps> = ({
  size = 38,
  showText = true,
  showTagline = true,
  variant = 'horizontal',
  onClick,
  className = '',
}) => {
  const { language } = useI18n();

  return (
    <div
      onClick={onClick}
      className={`winrah-brand-identity ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.65rem',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        textDecoration: 'none',
      }}
    >
      {/* Visual Logo Mark */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
        }}
      >
        <LogoMark size={size} />
      </div>

      {/* Brand Wordmark & Localized Tagline */}
      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', lineHeight: 1.1 }}>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 900,
                fontSize: size > 40 ? '1.4rem' : '1.18rem',
                letterSpacing: '-0.035em',
                color: 'var(--text-primary)',
              }}
            >
              WINRAH
            </span>
            <span
              style={{
                background: 'var(--accent)',
                color: '#FFFFFF',
                fontSize: '0.62rem',
                fontWeight: 800,
                padding: '0.12rem 0.38rem',
                borderRadius: 'var(--radius-sm)',
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              {language === 'ar' ? 'وين راه؟' : 'STOCK'}
            </span>
          </div>

          {showTagline && (
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginTop: '1px',
                letterSpacing: '-0.01em',
              }}
            >
              {language === 'ar' ? 'مستودع الأحذية الذكي' : 'Localisation Entrepôt'}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default Logo;
