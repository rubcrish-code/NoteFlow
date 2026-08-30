import type { SVGProps } from "react";

export type IconName =
  | "alignCenter"
  | "alignLeft"
  | "alignRight"
  | "archive"
  | "attach"
  | "back"
  | "bold"
  | "bulb"
  | "callout"
  | "caret"
  | "chat"
  | "check"
  | "clear"
  | "code"
  | "codeBlock"
  | "color"
  | "copy"
  | "date"
  | "divider"
  | "doc"
  | "dots"
  | "folder"
  | "focus"
  | "forward"
  | "formula"
  | "gear"
  | "highlight"
  | "image"
  | "italic"
  | "link"
  | "logo"
  | "mention"
  | "noteLink"
  | "ol"
  | "person"
  | "pin"
  | "plus"
  | "quote"
  | "redo"
  | "search"
  | "send"
  | "strike"
  | "sub"
  | "sup"
  | "table"
  | "tag"
  | "task"
  | "toggle"
  | "ul"
  | "underline"
  | "undo"
  | "x";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, ...props }: IconProps) {
  switch (name) {
    case "alignCenter":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
          <path d="M4 6h16M7 12h10M5 18h14" strokeLinecap="round" />
        </svg>
      );
    case "alignLeft":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
          <path d="M4 6h16M4 12h10M4 18h13" strokeLinecap="round" />
        </svg>
      );
    case "alignRight":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
          <path d="M4 6h16M10 12h10M7 18h13" strokeLinecap="round" />
        </svg>
      );
    case "archive":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M4 9h16" />
        </svg>
      );
    case "attach":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "back":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "bold":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" {...props}>
          <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" strokeLinejoin="round" />
        </svg>
      );
    case "bulb":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.2 1 2.5h6c0-1.3.3-1.8 1-2.5A6 6 0 0 0 12 3z" strokeLinejoin="round" />
        </svg>
      );
    case "callout":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M11 12h1v4h1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "caret":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "chat":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" />
          <path d="M9 11h.01M12 11h.01M15 11h.01" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M8.5 12l2.5 2.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "clear":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M7 7l10 10M7 17L17 7" strokeLinecap="round" />
          <path d="M4 20h7" strokeLinecap="round" />
        </svg>
      );
    case "code":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
          <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "codeBlock":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M9 9l-2 3 2 3M15 9l2 3-2 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "color":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M5 19h14M8 15l4-10 4 10M9.2 12h5.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "copy":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M5 15V7a2 2 0 0 1 2-2h8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "date":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
      );
    case "divider":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
          <path d="M4 12h16" strokeLinecap="round" />
        </svg>
      );
    case "doc":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
          <path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" strokeLinejoin="round" />
          <path d="M14 4v5h5" strokeLinejoin="round" />
        </svg>
      );
    case "dots":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      );
    case "folder":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" strokeLinejoin="round" />
        </svg>
      );
    case "focus":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
        </svg>
      );
    case "forward":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "formula":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M6 19c0 0 1 1 2 1s2-1 2-3l1.5-9c.3-2 1-3 2.5-3s2 1 2 1M7 10h7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "gear":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" {...props}>
          <path d="M10.84 5.10 L9.93 3.04 L14.07 3.04 L13.16 5.10 L16.06 6.30 L16.88 4.20 L19.80 7.12 L17.70 7.94 L18.90 10.84 L20.96 9.93 L20.96 14.07 L18.90 13.16 L17.70 16.06 L19.80 16.88 L16.88 19.80 L16.06 17.70 L13.16 18.90 L14.07 20.96 L9.93 20.96 L10.84 18.90 L7.94 17.70 L7.12 19.80 L4.20 16.88 L6.30 16.06 L5.10 13.16 L3.04 14.07 L3.04 9.93 L5.10 10.84 L6.30 7.94 L4.20 7.12 L7.12 4.20 L7.94 6.30 Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "highlight":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M4 20h16M5 16l3 1 9-9-4-4-9 9z" strokeLinejoin="round" />
        </svg>
      );
    case "image":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="M21 16l-5-5L5 19" strokeLinejoin="round" />
        </svg>
      );
    case "italic":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
          <path d="M10 5h7M7 19h7M14 5l-4 14" strokeLinecap="round" />
        </svg>
      );
    case "link":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M10 14a4 4 0 0 0 6 0l2-2a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-2 2a4 4 0 0 0 6 6l1-1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "logo":
      return (
        <svg viewBox="0 0 24 24" fill="none" {...props}>
          <path d="M4 17 L9 8 L13 14 L20 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "mention":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <circle cx="12" cy="12" r="4" />
          <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" strokeLinecap="round" />
        </svg>
      );
    case "noteLink":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M8 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h2M16 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-2" strokeLinecap="round" />
        </svg>
      );
    case "ol":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
          <path d="M10 6h11M10 12h11M10 18h11M4 5l1.5-.5V9M4 9h2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 15h2.2c.5 0 .8.7.4 1.1L4 19h2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "person":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
        </svg>
      );
    case "pin":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
          <path d="M9 4h6l-1 6 3 3v2h-4v5l-1 1-1-1v-5H6v-2l3-3z" />
        </svg>
      );
    case "plus":
      return (
        <svg viewBox="0 0 24 24" fill="none" {...props}>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case "quote":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M7 7c-2 0-3 1.5-3 3.5S5 14 7 14c0 2-1 3-3 3M17 7c-2 0-3 1.5-3 3.5S15 14 17 14c0 2-1 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "redo":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" strokeLinecap="round" />
        </svg>
      );
    case "send":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
          <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "strike":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
          <path d="M5 12h14M8 7a4 3 0 0 1 8 0M8 16a4 3 0 0 0 8 0" strokeLinecap="round" />
        </svg>
      );
    case "sub":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
          <path d="M5 6l8 10M13 6L5 16M17 16a2 2 0 1 1 3 1.5L17 20h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "sup":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
          <path d="M5 7l8 10M13 7L5 17M17 9a2 2 0 1 1 3 1.5L17 13h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "table":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
        </svg>
      );
    case "tag":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
          <path d="M20 13l-7 7-10-10V3h7z" strokeLinejoin="round" />
          <circle cx="7.5" cy="7.5" r="1.5" />
        </svg>
      );
    case "task":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M3 6l2 2 3-3M3 13l2 2 3-3M11 7h10M11 14h10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "toggle":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "ul":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
          <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" />
        </svg>
      );
    case "underline":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
          <path d="M7 5v6a5 5 0 0 0 10 0V5M5 21h14" strokeLinecap="round" />
        </svg>
      );
    case "undo":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      );
  }
}
