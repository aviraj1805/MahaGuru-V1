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
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        'on-brand': token('on-brand'),
        'on-danger': token('on-danger'),
        highlight: { from: token('highlight-from'), via: token('highlight-via'), to: token('highlight-to') },
        hero: {
          ground: token('hero-ground'),
          ink: token('hero-ink'),
          muted: token('hero-muted'),
          subtle: token('hero-subtle'),
          accent: token('hero-accent'),
          'glow-blue': token('hero-glow-blue'),
          'glow-indigo': token('hero-glow-indigo'),
          'glow-cyan': token('hero-glow-cyan'),
          'highlight-from': token('hero-highlight-from'),
          'highlight-via': token('hero-highlight-via'),
          'highlight-to': token('hero-highlight-to'),
        },
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
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        drift: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '33%': { transform: 'translate(6%,-8%) scale(1.08)' },
          '66%': { transform: 'translate(-6%,6%) scale(0.95)' },
        },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        caret: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        pulse3: 'pulse3 1.2s infinite ease-in-out',
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'float 8s ease-in-out infinite',
        drift: 'drift 18s ease-in-out infinite',
        'drift-slow': 'drift 26s ease-in-out infinite reverse',
        marquee: 'marquee 40s linear infinite',
        caret: 'caret 1s step-end infinite',
      },
    },
  },
  plugins: [typography],
};
