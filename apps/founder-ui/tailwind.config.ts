import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          canvas:   'var(--paper-canvas)',
          surface:  'var(--paper-surface)',
          elevated: 'var(--paper-elevated)',
          pure:     'var(--paper-pure)',
          inset:    'var(--bg-inset)',
        },
        ink: {
          1: 'var(--ink-1)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
        },
        silver: {
          1: 'var(--silver-1)',
          2: 'var(--silver-2)',
          3: 'var(--silver-3)',
          4: 'var(--silver-4)',
        },
        wood: {
          1: 'var(--wood-1)',
          2: 'var(--wood-2)',
          3: 'var(--wood-3)',
          4: 'var(--wood-4)',
        },
        green: {
          DEFAULT: 'var(--green)',
          hover:   'var(--green-hover)',
          press:   'var(--green-press)',
          tint:    'var(--green-tint)',
          tint2:   'var(--green-tint-2)',
        },
        amber:  { DEFAULT: 'var(--amber)', tint: 'var(--amber-tint)' },
        red:    { DEFAULT: 'var(--red)',   tint: 'var(--red-tint)' },
        blue:   { DEFAULT: 'var(--blue)',  tint: 'var(--blue-tint)' },
        pastel: {
          lav:    'var(--p-lav)',
          peach:  'var(--p-peach)',
          mint:   'var(--p-mint)',
          sky:    'var(--p-sky)',
          butter: 'var(--p-butter)',
          rose:   'var(--p-rose)',
          sand:   'var(--p-sand)',
        },
      },
      fontFamily: {
        serif: ['Source Serif 4', 'Gowun Batang', 'Nanum Myeongjo', 'Georgia', 'serif'],
        sans:  ['IBM Plex Sans', 'SUIT Variable', 'Pretendard Variable', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'Apple SD Gothic Neo', 'sans-serif'],
        mono:  ['IBM Plex Mono', 'Pretendard Variable', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        sm: '2px',
        md: '6px',
        lg: '10px',
        xl: '14px',
      },
      boxShadow: {
        hairline: '0 0 0 1px var(--silver-2)',
        soft:     '0 1px 2px rgba(26, 22, 18, 0.04), 0 6px 16px -8px rgba(26, 22, 18, 0.10)',
        lifted:   '0 4px 12px rgba(26, 22, 18, 0.06), 0 20px 48px -12px rgba(26, 22, 18, 0.18)',
      },
    },
  },
  plugins: [],
}
export default config
