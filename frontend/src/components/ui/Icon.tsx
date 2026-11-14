const paths = {
  location: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  home: 'm3 10 9-7 9 7 M5 9v12h14V9 M9 21v-8h6v8',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  close: 'm6 6 12 12 M18 6 6 18',
  image: 'M3 3h18v18H3Z M3 17l6-6 4 4 3-3 5 5 M17 7h.01',
  science: 'M9 3h6 M10 3v6L4 19c-.6 1 .1 2 1.3 2h13.4c1.2 0 1.9-1 1.3-2L14 9V3 M7 14h10',
  arrowRight: 'M4 12h16 m-6-6 6 6-6 6',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  reset: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  layers: 'm12 3 9 5-9 5-9-5 9-5Z M3 13l9 5 9-5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 11v6 M12 7.5h.01',
  north: 'm12 3 6 15-6-4-6 4 6-15Z',
  sliders: 'M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M20 18h0 M16 4v4 M10 10v4 M18 16v4',
  chevronLeft: 'm15 6-6 6 6 6',
  warning: 'M12 4 2.5 20h19L12 4Z M12 10v4.5 M12 17.5h.01',
}

export function Icon({ name, className = '' }: { name: keyof typeof paths; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  )
}
