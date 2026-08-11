export const FEATURES = [
  {
    id: "triage",
    title: "Real-time Triage",
    description:
      "Every inbound Slack message is classified in milliseconds using semantic urgency scoring tuned for your workspace.",
    icon: "Zap",
  },
  {
    id: "noise",
    title: "Noise Reduction",
    description:
      "Mute low-signal chatter automatically so your team focuses only on signals that matter.",
    icon: "VolumeX",
  },
  {
    id: "escalation",
    title: "Automated Escalation",
    description:
      "Critical blockers route to on-call channels and webhooks without manual triage overhead.",
    icon: "ArrowUpRight",
  },
];

export const DASHBOARD_STATS = [
  {
    id: "messages",
    label: "Messages Analyzed",
    value: "12,847",
    delta: "+18.2%",
    trend: "up",
    span: "col-span-1 md:col-span-2",
  },
  {
    id: "escalations",
    label: "Active Escalations",
    value: "23",
    delta: "3 critical",
    trend: "alert",
    span: "col-span-1",
  },
  {
    id: "noise",
    label: "Noise Reduction",
    value: "67.4%",
    delta: "+4.1% vs last week",
    trend: "up",
    span: "col-span-1",
  },
  {
    id: "latency",
    label: "Avg. Triage Latency",
    value: "842ms",
    delta: "P95 1.2s",
    trend: "neutral",
    span: "col-span-1 md:col-span-2",
  },
  {
    id: "channels",
    label: "Monitored Channels",
    value: "14",
    delta: "2 added today",
    trend: "neutral",
    span: "col-span-1",
  },
];

export const LIVE_PREVIEW_MESSAGES = [
  {
    id: "p1",
    user: "U04K9X2",
    channel: "#incidents",
    text: "Production API returning 503 — checkout is down for all regions",
    classification: "Escalate",
    timestamp: "Just now",
  },
  {
    id: "p2",
    user: "U08M1PL",
    channel: "#engineering",
    text: "Can someone review my PR for the auth middleware refactor?",
    classification: "Log",
    timestamp: "2s ago",
  },
  {
    id: "p3",
    user: "U02H7WQ",
    channel: "#general",
    text: "Happy Friday everyone — great work this sprint!",
    classification: "Mute",
    timestamp: "5s ago",
  },
  {
    id: "p4",
    user: "U06R3NV",
    channel: "#platform",
    text: "Database replica lag spiking to 45s on us-east-1",
    classification: "Escalate",
    timestamp: "8s ago",
  },
  {
    id: "p5",
    user: "U01ABCD",
    channel: "#support",
    text: "Customer asking about invoice formatting — non-urgent",
    classification: "Log",
    timestamp: "12s ago",
  },
];

export const FEED_ALERTS = [
  {
    id: "a1",
    userId: "U04K9X2M",
    channel: "#incidents",
    text: "Production API returning 503 — checkout is down for all regions",
    classification: "Escalate",
    timestamp: "2026-06-29T14:32:01Z",
    urgencyScore: 9,
  },
  {
    id: "a2",
    userId: "U08M1PLQ",
    channel: "#engineering",
    text: "Can someone review my PR for the auth middleware refactor?",
    classification: "Log",
    timestamp: "2026-06-29T14:31:44Z",
    urgencyScore: 5,
  },
  {
    id: "a3",
    userId: "U02H7WQZ",
    channel: "#general",
    text: "Happy Friday everyone — great work this sprint!",
    classification: "Mute",
    timestamp: "2026-06-29T14:31:12Z",
    urgencyScore: 1,
  },
  {
    id: "a4",
    userId: "U06R3NVT",
    channel: "#platform",
    text: "Database replica lag spiking to 45s on us-east-1",
    classification: "Escalate",
    timestamp: "2026-06-29T14:30:58Z",
    urgencyScore: 8,
  },
  {
    id: "a5",
    userId: "U01ABCDE",
    channel: "#support",
    text: "Customer asking about invoice formatting — non-urgent ticket",
    classification: "Log",
    timestamp: "2026-06-29T14:30:22Z",
    urgencyScore: 4,
  },
  {
    id: "a6",
    userId: "U09XY12Z",
    channel: "#devops",
    text: "Staging deploy completed successfully, all checks green",
    classification: "Mute",
    timestamp: "2026-06-29T14:29:55Z",
    urgencyScore: 2,
  },
  {
    id: "a7",
    userId: "U03FF88K",
    channel: "#incidents",
    text: "VIP client Acme Corp threatening churn over SLA breach",
    classification: "Escalate",
    timestamp: "2026-06-29T14:29:30Z",
    urgencyScore: 10,
  },
  {
    id: "a8",
    userId: "U07LMN4P",
    channel: "#product",
    text: "Minor UI glitch on settings page — low priority backlog item",
    classification: "Log",
    timestamp: "2026-06-29T14:28:47Z",
    urgencyScore: 4,
  },
];

export const NAV_ITEMS = [
  { href: "/sentinel/dashboard", label: "Command", icon: "LayoutDashboard" },
  { href: "/sentinel/feed", label: "Live Feed", icon: "Radio" },
  { href: "/sentinel/feedback", label: "Feedback", icon: "MessageSquare" },
  { href: "/sentinel/workspaces", label: "Workspaces", icon: "Building2" },
  { href: "/sentinel/pipeline", label: "Pipeline", icon: "GitBranch" },
  { href: "/sentinel/rules", label: "Rules Studio", icon: "SlidersHorizontal" },
];

export const CLASSIFICATION_STYLES = {
  Escalate: {
    border: "border-rose-500/50 dark:border-rose-500/60",
    glow: "shadow-[0_0_24px_-4px_rgba(244,63,94,0.2)] dark:shadow-[0_0_24px_-4px_rgba(244,63,94,0.35)]",
    badge: "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-500/30",
    accent: "text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  Log: {
    border: "border-amber-500/40",
    glow: "shadow-[0_0_20px_-6px_rgba(245,158,11,0.15)] dark:shadow-[0_0_20px_-6px_rgba(245,158,11,0.25)]",
    badge: "bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/30",
    accent: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  Mute: {
    border: "border-zinc-400/35 dark:border-zinc-700/80",
    glow: "",
    badge: "bg-zinc-400/20 text-zinc-600 ring-zinc-400/30 dark:bg-zinc-800/80 dark:text-zinc-500 dark:ring-zinc-700/50",
    accent: "text-zinc-500 dark:text-zinc-400",
    dot: "bg-zinc-400 dark:bg-zinc-600",
  },
};
