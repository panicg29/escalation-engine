"use client";

import { usePathname } from "next/navigation";

export function ConditionalPlaygroundNav({ children }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/sentinel")) {
    return null;
  }
  return children;
}
