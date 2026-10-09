import typography from '@tailwindcss/typography';

const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        sunken: token('sunken'),
        ink: token('ink'),
        muted: token('muted'),
        line: token('line'),
        brand: { DEFAULT: token('brand'), soft: token('brand-soft'), ink: token('brand-ink') },
        reflect: { DEFAULT: token('reflect'), soft: token('reflect-soft'), ink: token('reflect-ink') },
        learn: { DEFAULT: token('learn'), soft: token('learn-soft'), ink: token('learn-ink') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        warn: { DEFAULT: token('warn'), soft: token('warn-soft') },
        ok: { DEFAULT: token('ok'), soft: token('ok-soft') },
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem', '3xl': '1.5rem' },
      boxShadow: {
        soft: '0 1px 2px rgb(16 24 40 / 0.04), 0 4px 16px -4px rgb(16 24 40 / 0.08)',
        lift: '0 2px 4px rgb(16 24 40 / 0.04), 0 12px 32px -8px rgb(16 24 40 / 0.14)',
      },
      keyframes: {
        'fade-up': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        pulse3: { '0%,80%,100%': { opacity: 0.25 }, '40%': { opacity: 1 } },
      },
      animation: { 'fade-up': 'fade-up .35s ease-out both', pulse3: 'pulse3 1.2s infinite ease-in-out' },
    },
  },
  plugins: [typography],
};
