const paths = {
  location: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  home: 'm3 10 9-7 9 7 M5 9v12h14V9 M9 21v-8h6v8',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  close: 'm6 6 12 12 M18 6 6 18',
  image: 'M3 3h18v18H3Z M3 17l6-6 4 4 3-3 5 5 M17 7h.01',
  science: 'M9 3h6 M10 3v6L4 19c-.6 1 .1 2 1.3 2h13.4c1.2 0 1.9-1 1.3-2L14 9V3 M7 14h10',
  arrowRight: 'M4 12h16 m-6-6 6 6-6 6',
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
