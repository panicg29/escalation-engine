"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Save,
  Users,
  Clock,
  MessageSquare,
  Sliders,
  UserX,
  Bot,
  Hash,
  RotateCcw,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import { SentinelSilkPageFrame } from "@/components/sentinel/SentinelSilkPageFrame";
import { WorkspaceGate } from "@/components/sentinel/WorkspaceSwitcher";
import { AnimatedSlider } from "@/components/sentinel/ui/AnimatedSlider";
import { ToggleSwitch } from "@/components/sentinel/ui/ToggleSwitch";
import { FormField } from "@/components/sentinel/ui/FormField";
import { springSnappy } from "@/lib/sentinel/motion";
import { useWorkspace } from "@/lib/sentinel/workspaceContext";
import { SpotlightCard } from "@/components/react-bits/SpotlightCard";
import { PillBadge } from "@/components/react-bits/PillBadge";
import { ShinyButton } from "@/components/react-bits/ShinyButton";
import { WorkspaceUserPicker } from "@/components/sentinel/WorkspaceUserPicker";
import { WorkspaceChannelPicker } from "@/components/sentinel/WorkspaceChannelPicker";
import { SilkSectionHeader } from "@/components/sentinel/SilkSectionHeader";
import { SILK_GLASS_BAR } from "@/lib/sentinel/silkPageStyles";

const SENSITIVITY_OPTIONS = [
  { value: "low", label: "Low", description: "Fewer escalations" },
  { value: "balanced", label: "Balanced", description: "Recommended" },
  { value: "strict", label: "Strict", description: "More escalations" },
];

function SectionHeader(props) {
  return <SilkSectionHeader {...props} />;
}

function SensitivitySelector({ value, onChange }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[1.0625rem] font-extrabold text-[var(--silk-text-strong)]">AI sensitivity level</p>
        <p className="mt-1.5 text-sm font-bold leading-relaxed text-[var(--silk-text-muted)] lg:text-[0.9375rem]">
          How aggressively messages are flagged for escalation
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {SENSITIVITY_OPTIONS.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className="relative rounded-lg px-3 py-3 text-left transition-colors"
            >
              {active && (
                <motion.span
                  layoutId="rules-sensitivity"
                  className="sentinel-tab-active absolute inset-0 rounded-lg ring-1 ring-violet-500/30"
                  transition={springSnappy}
                />
              )}
              <span className={`relative block text-[0.9375rem] font-extrabold ${active ? "text-[var(--silk-text-strong)]" : "text-[var(--silk-text-body)]"}`}>
                {option.label}
              </span>
              <span className="relative mt-1 block text-xs font-bold leading-snug text-[var(--silk-text-muted)] lg:text-[0.8125rem]">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RulesPageFrame({ children }) {
  return (
    <SentinelSilkPageFrame
      title="Rules & Configuration"
      subtitle="Configure escalation rules and AI sensitivity"
    >
      {children}
    </SentinelSilkPageFrame>
  );
}

export default function RulesPage() {
  const { activeTeamId } = useWorkspace();
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const loadRules = useCallback(async () => {
    if (!activeTeamId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/rules?teamId=${activeTeamId}`);
      const data = await response.json();

      if (data.success) {
        setRules(data.rules);
        setHasChanges(false);
      } else {
        throw new Error(data.error || "Failed to load rules");
      }
    } catch (error) {
      console.error("Error loading rules:", error);
      setSaveStatus("error");
    } finally {
      setLoading(false);
    }
  }, [activeTeamId]);

  const saveRules = useCallback(async () => {
    if (!activeTeamId || !rules) return;

    try {
      setSaving(true);
      setSaveStatus(null);

      const response = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: activeTeamId,
          updatedBy: "User",
          ...rules,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setRules(data.rules);
        setHasChanges(false);
        setSaveStatus("success");
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        throw new Error(data.error || "Failed to save rules");
      }
    } catch (error) {
      console.error("Error saving rules:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 5000);
    } finally {
      setSaving(false);
    }
  }, [activeTeamId, rules]);

  const updateRules = useCallback((updates) => {
    setRules((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  }, []);

  const resetToDefaults = useCallback(() => {
    if (confirm("Are you sure you want to reset all rules to default values?")) {
      setRules({
        escalationTimeoutSeconds: 15,
        escalationPhone: "",
        vipUsers: [],
        mutedUsers: [],
        muteBots: true,
        monitoredChannels: [],
        ignoredChannels: [],
        aiSensitivity: "balanced",
        escalateThreshold: 8,
        logThreshold: 4,
        hourlyEscalationLimit: 12,
        cooldownMinutes: 30,
        autoEscalate: true,
        afterHoursBoost: true,
        digestMode: false,
        customRules: "",
      });
      setHasChanges(true);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  if (loading) {
    return (
      <RulesPageFrame>
        <WorkspaceGate>
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
              <p className="sentinel-text-secondary text-base">Loading configuration…</p>
            </div>
          </div>
        </WorkspaceGate>
      </RulesPageFrame>
    );
  }

  if (!rules) {
    return (
      <RulesPageFrame>
        <WorkspaceGate>
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-rose-500" />
              <p className="sentinel-text-secondary text-base">Failed to load configuration</p>
              <button
                type="button"
                onClick={loadRules}
                className="sentinel-btn-ghost mt-4 rounded-lg px-4 py-2.5 text-sm font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        </WorkspaceGate>
      </RulesPageFrame>
    );
  }

  return (
    <RulesPageFrame>
      <WorkspaceGate>
        <div className={`${SILK_GLASS_BAR} mb-6`}>
          <div className="flex min-h-[28px] items-center gap-2">
            {saveStatus === "success" && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400"
              >
                <Check className="h-4 w-4" />
                Saved
              </motion.span>
            )}
            {saveStatus === "error" && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1.5 text-sm font-medium text-rose-600 dark:text-rose-400"
              >
                <X className="h-4 w-4" />
                Save failed
              </motion.span>
            )}
            {hasChanges && !saving && saveStatus !== "success" && (
              <PillBadge variant="warning" size="sm" animated={false} showDot={false}>
                Unsaved changes
              </PillBadge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ShinyButton variant="outline" size="sm" onClick={resetToDefaults}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </ShinyButton>
            <ShinyButton
              variant="primary"
              size="sm"
              onClick={saveRules}
              disabled={!hasChanges || saving}
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save changes"}
            </ShinyButton>
          </div>
        </div>

        <div className="grid auto-rows-fr gap-4 lg:grid-cols-2 lg:gap-5">
          <SpotlightCard glass spotlightIntensity={0.35}>
            <SectionHeader
              icon={Clock}
              title="Escalation & Timing"
              description="When and how alerts escalate to phone calls"
              iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            />
            <div className="space-y-4">
              <AnimatedSlider
                label="Escalation timeout"
                description="Seconds to wait before triggering a phone call"
                value={rules.escalationTimeoutSeconds}
                onChange={(value) => updateRules({ escalationTimeoutSeconds: value })}
                min={15}
                max={900}
                step={15}
                unit="s"
              />
              <div className="max-w-xs">
                <FormField
                  label="Escalation phone number"
                  value={rules.escalationPhone}
                  onChange={(e) => updateRules({ escalationPhone: e.target.value })}
                  placeholder="+1234567890"
                />
              </div>
            </div>
          </SpotlightCard>

          <SpotlightCard glass spotlightIntensity={0.35}>
            <SectionHeader
              icon={Sliders}
              title="AI Sensitivity"
              description="Tune classification thresholds"
              iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            />
            <div className="space-y-4">
              <SensitivitySelector
                value={rules.aiSensitivity}
                onChange={(value) => updateRules({ aiSensitivity: value })}
              />
              <AnimatedSlider
                label="Escalate threshold"
                description="Minimum score required for escalation"
                value={rules.escalateThreshold}
                onChange={(value) => updateRules({ escalateThreshold: value })}
                min={6}
                max={10}
              />
              <AnimatedSlider
                label="Log threshold"
                description="Minimum score for logging — below this is muted"
                value={rules.logThreshold}
                onChange={(value) => updateRules({ logThreshold: value })}
                min={1}
                max={7}
              />
            </div>
          </SpotlightCard>

          <SpotlightCard glass spotlightIntensity={0.35}>
            <SectionHeader
              icon={Users}
              title="People & Roles"
              description="VIP users and muted accounts"
              iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            />
            <div className="space-y-5">
              <WorkspaceUserPicker
                teamId={activeTeamId}
                label="VIP users"
                description="Instant escalation — bypasses AI triage"
                icon={Users}
                selectedIds={rules.vipUsers}
                excludeIds={rules.mutedUsers}
                excludeBots
                badgeVariant="primary"
                onChange={(ids) =>
                  updateRules({
                    vipUsers: ids,
                    mutedUsers: rules.mutedUsers.filter((id) => !ids.includes(id)),
                  })
                }
              />
              <WorkspaceUserPicker
                teamId={activeTeamId}
                label="Muted users"
                description="Messages are logged silently with no notification"
                icon={UserX}
                selectedIds={rules.mutedUsers}
                excludeIds={rules.vipUsers}
                badgeVariant="warning"
                onChange={(ids) =>
                  updateRules({
                    mutedUsers: ids,
                    vipUsers: rules.vipUsers.filter((id) => !ids.includes(id)),
                  })
                }
              />
              <ToggleSwitch
                label="Auto-mute bot messages"
                description="Ignore messages from bot accounts"
                checked={rules.muteBots}
                onChange={(checked) => updateRules({ muteBots: checked })}
              />
            </div>
          </SpotlightCard>

          <SpotlightCard glass spotlightIntensity={0.35}>
            <SectionHeader
              icon={MessageSquare}
              title="Channel Scope"
              description="Which channels are monitored"
              iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
            />
            <div className="space-y-5">
              <WorkspaceChannelPicker
                teamId={activeTeamId}
                label="Monitored channels"
                description="Empty means all channels"
                icon={Hash}
                selectedIds={rules.monitoredChannels}
                excludeIds={rules.ignoredChannels}
                badgeVariant="info"
                emptyLabel="No channels selected — all channels are monitored."
                onChange={(ids) =>
                  updateRules({
                    monitoredChannels: ids,
                    ignoredChannels: rules.ignoredChannels.filter((id) => !ids.includes(id)),
                  })
                }
              />
              <WorkspaceChannelPicker
                teamId={activeTeamId}
                label="Ignored channels"
                description="Never processed"
                icon={Hash}
                selectedIds={rules.ignoredChannels}
                excludeIds={rules.monitoredChannels}
                badgeVariant="warning"
                onChange={(ids) =>
                  updateRules({
                    ignoredChannels: ids,
                    monitoredChannels: rules.monitoredChannels.filter((id) => !ids.includes(id)),
                  })
                }
              />
            </div>
          </SpotlightCard>

          <SpotlightCard glass spotlightIntensity={0.35} className="lg:col-span-2">
            <SectionHeader
              icon={Bot}
              title="Behavior & Rate Limiting"
              description="Prevent notification fatigue"
              iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            />
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
              <div className="space-y-4">
                <AnimatedSlider
                  label="Hourly escalation limit"
                  description="Max escalations per hour before throttling"
                  value={rules.hourlyEscalationLimit}
                  onChange={(value) => updateRules({ hourlyEscalationLimit: value })}
                  min={1}
                  max={50}
                  unit="/hr"
                />
                <AnimatedSlider
                  label="Cooldown period"
                  description="Minutes between repeat escalations from same user"
                  value={rules.cooldownMinutes}
                  onChange={(value) => updateRules({ cooldownMinutes: value })}
                  min={5}
                  max={120}
                  unit="m"
                />
              </div>
              <div className="space-y-3">
                <ToggleSwitch
                  label="Auto-escalate critical messages"
                  description="Route Escalate decisions to phone calls"
                  checked={rules.autoEscalate}
                  onChange={(checked) => updateRules({ autoEscalate: checked })}
                />
                <ToggleSwitch
                  label="After-hours sensitivity boost"
                  description="Increase urgency scores at night and weekends"
                  checked={rules.afterHoursBoost}
                  onChange={(checked) => updateRules({ afterHoursBoost: checked })}
                />
                <ToggleSwitch
                  label="Digest mode"
                  description="Batch non-critical items into hourly summaries"
                  checked={rules.digestMode}
                  onChange={(checked) => updateRules({ digestMode: checked })}
                />
              </div>
            </div>
          </SpotlightCard>

          <SpotlightCard glass spotlightIntensity={0.35} className="lg:col-span-2">
            <SectionHeader
              icon={AlertTriangle}
              title="Custom rule overrides"
              description="Natural language rules appended to the AI triage prompt"
              iconClass="bg-rose-500/10 text-rose-600 dark:text-rose-400"
            />
            <textarea
              value={rules.customRules}
              onChange={(e) => updateRules({ customRules: e.target.value })}
              placeholder="Example: VIP client mentions always escalate regardless of score. Production outages in #incidents are critical priority."
              rows={4}
              className="sentinel-input w-full resize-none rounded-lg px-4 py-3 text-base leading-relaxed"
            />
          </SpotlightCard>
        </div>
      </WorkspaceGate>
    </RulesPageFrame>
  );
}
