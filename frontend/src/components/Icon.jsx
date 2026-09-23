// 16×16 line icons drawn in the style of GitHub's UI. They inherit the
// surrounding text colour.

const PATHS = {
  book: (
    <path d="M8 3.5C7 2.6 5.5 2 3.5 2H2v10h1.5c2 0 3.5.6 4.5 1.5M8 3.5C9 2.6 10.5 2 12.5 2H14v10h-1.5c-2 0-3.5.6-4.5 1.5M8 3.5v10" />
  ),
  repo: <path d="M4.5 2H13v10H4.5A1.5 1.5 0 0 0 3 13.5v-10A1.5 1.5 0 0 1 4.5 2zM3 13.5A1.5 1.5 0 0 0 4.5 15H6m4 0h3v-3" />,
  lock: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </>
  ),
  star: <path d="M8 1.8l1.9 4 4.3.5-3.2 2.9.9 4.3L8 11.3l-3.9 2.2.9-4.3-3.2-2.9 4.3-.5z" />,
  commit: (
    <>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M1 8h4.5M10.5 8H15" />
    </>
  ),
  pullRequest: (
    <>
      <circle cx="4" cy="3.5" r="1.5" />
      <circle cx="4" cy="12.5" r="1.5" />
      <circle cx="12" cy="12.5" r="1.5" />
      <path d="M4 5v6M12 11V6a2 2 0 0 0-2-2H7M8.5 2.5L7 4l1.5 1.5" />
    </>
  ),
  issueOpened: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" stroke="none" />
    </>
  ),
  issueClosed: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.5 8.2l1.7 1.6 3.3-3.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.5V8l2.5 1.5" />
    </>
  ),
  link: <path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />,
  pencil: <path d="M11 2.5L13.5 5 6 12.5 3 13l.5-3z" />,
  trash: <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9.1a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L12 4" />,
  gear: (
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </>
  ),
  signOut: <path d="M6 14H3.5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1H6M10.5 11l3-3-3-3M13.5 8H6" />,
  calendar: (
    <>
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5 1.5v3M11 1.5v3" />
    </>
  ),
  bell: <path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11zM6.5 14a1.5 1.5 0 0 0 3 0" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </>
  ),
  download: <path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 13.5h11" />,
  flame: (
    <path d="M8 14.5a4.5 4.5 0 0 0 4.5-4.5c0-3-2.5-4-3-7-1.5 1-2.5 3-2.5 4.5C6.2 7 5.5 6 5.5 5 4 6.3 3.5 8 3.5 10A4.5 4.5 0 0 0 8 14.5z" />
  ),
  chevronLeft: <path d="M10 3.5L5.5 8l4.5 4.5" />,
  chevronRight: <path d="M6 3.5L10.5 8 6 12.5" />,
  chevronDown: <path d="M3.5 6L8 10.5 12.5 6" />,
  arrowLeft: <path d="M13 8H3M7 4L3 8l4 4" />,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  mail: (
    <>
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
      <path d="M2 4.5L8 9l6-4.5" />
    </>
  ),
  plus: <path d="M8 3v10M3 8h10" />,
  check: <path d="M3 8.5L6.5 12 13 4.5" />,
  external: <path d="M9.5 2.5h4v4M13.5 2.5L7.5 8.5M12 9.5V13a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5V4.5a.5.5 0 0 1 .5-.5H6.5" />,
  graph: <path d="M2 14h12M4 11V8M7 11V4M10 11V6M13 11V9" />,
};

export default function Icon({ name, size = 16, className = "", label }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PATHS[name]}
    </svg>
  );
}
