import { ThemeProvider } from "@/components/sentinel/ThemeProvider";
import { SentinelThemeRoot } from "@/components/sentinel/SentinelThemeRoot";
import { WorkspaceProvider } from "@/lib/sentinel/workspaceContext";

export const metadata = {
  title: "Escalation Engine",
  description: "AI-powered Slack alert triage and automated escalation",
};

export default function SentinelAppLayout({ children }) {
  return (
    <ThemeProvider>
      <SentinelThemeRoot>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </SentinelThemeRoot>
    </ThemeProvider>
  );
}
