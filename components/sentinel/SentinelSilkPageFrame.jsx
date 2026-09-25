"use client";

import { SentinelShell } from "@/components/sentinel/SentinelShell";
import {
  SILK_HEADER_CLASS,
  SILK_SUBTITLE_CLASS,
  SILK_TITLE_CLASS,
} from "@/lib/sentinel/silkPageStyles";

export function SentinelSilkPageFrame({
  title,
  subtitle,
  showWorkspace = true,
  children,
}) {
  return (
    <div className="sentinel-silk-page relative min-h-screen">
      <SentinelShell
        bareBackground
        title={title}
        subtitle={subtitle}
        titleClassName={SILK_TITLE_CLASS}
        subtitleClassName={SILK_SUBTITLE_CLASS}
        headerClassName={SILK_HEADER_CLASS}
        showWorkspace={showWorkspace}
      >
        {children}
      </SentinelShell>
    </div>
  );
}
