"use client";

import { useEffect, useState } from "react";

export function SentinelLogo({ className = "h-5 w-5", ...props }) {
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 180);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Upper eyelid */}
      <path
        d="M3 16C3 16 9 6 16 6C23 6 29 16 29 16"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Lower eyelid */}
      <path
        d="M3 16C3 16 9 26 16 26C23 26 29 16 29 16"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Iris */}
      <circle
        cx="16"
        cy="16"
        r="5"
        stroke="currentColor"
        strokeWidth={2}
        opacity={blinking ? 0 : 1}
        style={{ transition: "opacity 0.08s ease-in-out" }}
      />
      {/* Pupil */}
      <circle
        cx="16"
        cy="16"
        r="2"
        fill="currentColor"
        opacity={blinking ? 0 : 1}
        style={{ transition: "opacity 0.08s ease-in-out" }}
      />
      {/* Blink line — only visible when blinking */}
      <line
        x1="3"
        y1="16"
        x2="29"
        y2="16"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        opacity={blinking ? 1 : 0}
        style={{ transition: "opacity 0.08s ease-in-out" }}
      />
    </svg>
  );
}
