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
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
      borderRadius: { lg: '0.5rem', xl: '0.625rem', '2xl': '0.75rem', '3xl': '1rem' },
      boxShadow: {
        soft: '0 1px 2px rgb(15 23 42 / 0.04)',
        lift: '0 1px 2px rgb(15 23 42 / 0.05), 0 8px 24px -12px rgb(15 23 42 / 0.18)',
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
