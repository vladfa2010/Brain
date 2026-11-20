type P = { size?: number; stroke?: number }

const base = (size = 16, stroke = 1.5) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const Check = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M20 6 9 17l-5-5" /></svg>
)
export const Plus = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M12 5v14M5 12h14" /></svg>
)
export const Clock = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
export const ArrowRight = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)
export const ArrowUpRight = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M7 17 17 7M8 7h9v9" /></svg>
)
export const Close = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M18 6 6 18M6 6l12 12" /></svg>
)
export const Sparkle = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3Z" /></svg>
)
export const More = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
)
export const Link = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></svg>
)
export const Refresh = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
)
export const Book = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" /></svg>
)
export const Layer = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></svg>
)
export const Sun = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
)
export const Inbox = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13l3.5 7v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7l3.5-7Z" /></svg>
)
export const Board = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="10" rx="1" /><rect x="17" y="4" width="4" height="13" rx="1" /></svg>
)
export const Search = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>
)
export const Trash = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>
)
export const Split = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M4 6h10M4 12h16M4 18h7" /></svg>
)
export const ArrowLeft = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
)
export const Menu = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
)
export const LogOut = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
)
export const Moon = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="M20.5 14.3A8.2 8.2 0 0 1 9.7 3.5 8.5 8.5 0 1 0 20.5 14.3Z" /></svg>
)
export const ChevronDown = ({ size, stroke }: P) => (
  <svg {...base(size, stroke)}><path d="m6 9 6 6 6-6" /></svg>
)
