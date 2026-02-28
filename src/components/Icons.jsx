import React from "react";

const baseProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const IconWrapper = ({ children, className }) => (
  <svg {...baseProps} className={`h-5 w-5 text-inherit ${className || ""}`} aria-hidden="true">
    {children}
  </svg>
);

export const ScheduleIcon = (props) => (
  <IconWrapper className={props.className}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="8" y1="4" x2="8" y2="2" />
    <line x1="16" y1="4" x2="16" y2="2" />
  </IconWrapper>
);

export const EmployeesIcon = (props) => (
  <IconWrapper className={props.className}>
    <circle cx="9" cy="10" r="3" />
    <circle cx="17" cy="10" r="3" />
    <path d="M4 18c1.5-2 3.5-3 5-3s3.5 1 5 3" />
  </IconWrapper>
);

export const PendingIcon = (props) => (
  <IconWrapper className={props.className}>
    <path d="M7 3h10l1 2v2l-1 2h-2l-1 2 1 2h2l1 2v2l-1 2H7l-1-2v-2l1-2h2l1-2-1-2H7L6 7V5l1-2z" />
    <line x1="7" y1="8" x2="17" y2="8" />
    <line x1="7" y1="16" x2="17" y2="16" />
  </IconWrapper>
);

export const TasksIcon = (props) => (
  <IconWrapper className={props.className}>
    <rect x="5" y="4" width="14" height="16" rx="3" />
    <path d="M9 8h6" />
    <path d="M9 12h6" />
    <path d="M9 16h3" />
    <path d="M8 20h8" />
  </IconWrapper>
);

export const MessagesIcon = (props) => (
  <IconWrapper className={props.className}>
    <path d="M4 5h16v10H8l-4 4V5z" />
    <line x1="7" y1="9" x2="17" y2="9" />
    <line x1="7" y1="13" x2="13" y2="13" />
  </IconWrapper>
);

export const FeedIcon = (props) => (
  <IconWrapper className={props.className}>
    <rect x="4" y="5" width="16" height="14" rx="3" />
    <line x1="7" y1="8" x2="17" y2="8" />
    <line x1="7" y1="11" x2="12" y2="11" />
    <line x1="7" y1="14" x2="15" y2="14" />
  </IconWrapper>
);

export const SwapsIcon = (props) => (
  <IconWrapper className={props.className}>
    <path d="M7 5L3 9l4 4" />
    <path d="M17 5l4 4-4 4" />
    <path d="M3 9h18" />
    <path d="M3 15h18" />
  </IconWrapper>
);

export const LockIcon = (props) => (
  <IconWrapper className={props.className}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </IconWrapper>
);

export const SettingsIcon = (props) => (
  <IconWrapper className={props.className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M4 12h2" />
    <path d="M18 12h2" />
    <path d="M12 4v2" />
    <path d="M12 18v2" />
    <path d="M5.64 5.64l1.42 1.42" />
    <path d="M17.95 17.95l1.42 1.42" />
    <path d="M5.64 18.36l1.42-1.42" />
    <path d="M17.95 6.05l1.42-1.42" />
  </IconWrapper>
);

export const ProfileIcon = (props) => (
  <IconWrapper className={props.className}>
    <circle cx="12" cy="9" r="3" />
    <path d="M5 20c0-3 3-5 7-5s7 2 7 5" />
  </IconWrapper>
);

export const InfoIcon = (props) => (
  <IconWrapper className={props.className}>
    <circle cx="12" cy="12" r="8" />
    <line x1="12" y1="9" x2="12" y2="9.01" />
    <path d="M12 13v3" />
  </IconWrapper>
);
