"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Save, Webhook } from "lucide-react";
import { SentinelShell } from "@/components/sentinel/SentinelShell";
import { AnimatedSlider } from "@/components/sentinel/ui/AnimatedSlider";
import { FormField, FormTextarea } from "@/components/sentinel/ui/FormField";
import { ToggleSwitch } from "@/components/sentinel/ui/ToggleSwitch";
import { fadeUp, springSnappy } from "@/lib/sentinel/motion";

export default function SentinelRulesPage() {
  const [escalateThreshold, setEscalateThreshold] = useState(8);
  const [logThreshold, setLogThreshold] = useState(4);
  const [sensitivity, setSensitivity] = useState(6);
  const [fatigueLimit, setFatigueLimit] = useState(12);
  const [cooldownMinutes, setCooldownMinutes] = useState(30);

  const [autoEscalate, setAutoEscalate] = useState(true);
  const [afterHoursBoost, setAfterHoursBoost] = useState(true);
  const [muteBots, setMuteBots] = useState(true);
  const [digestMode, setDigestMode] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState(
    "https://hooks.example.com/escalations/acme-prod"
  );
  const [escalationChannel, setEscalationChannel] = useState("#incidents");
  const [logChannel, setLogChannel] = useState("#engineering-log");
  const [customRules, setCustomRules] = useState(
    "VIP client mentions always escalate regardless of score threshold."
  );

  return (
    <SentinelShell
      title="Rules & Configuration Studio"
      subtitle="Tune thresholds, fatigue boundaries, and escalation targets"
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <motion.section
          {...fadeUp}
          transition={springSnappy}
          className="space-y-4"
        >
          <h2 className="sentinel-text-muted text-sm font-semibold uppercase tracking-wider">
            Threshold Metrics
          </h2>

          <AnimatedSlider
            label="Escalate Threshold"
            description="Messages scoring at or above this value trigger immediate escalation."
            value={escalateThreshold}
            onChange={setEscalateThreshold}
            min={6}
            max={10}
          />

          <AnimatedSlider
            label="Log Threshold"
            description="Minimum score for actionable logging — below this, messages are muted."
            value={logThreshold}
            onChange={setLogThreshold}
            min={1}
            max={7}
          />

          <AnimatedSlider
            label="Global Sensitivity"
            description="Adjust how aggressively the engine interprets urgency signals."
            value={sensitivity}
            onChange={setSensitivity}
            min={1}
            max={10}
          />
        </motion.section>

        <motion.section
          {...fadeUp}
          transition={{ ...springSnappy, delay: 0.06 }}
          className="space-y-4"
        >
          <h2 className="sentinel-text-muted text-sm font-semibold uppercase tracking-wider">
            Notification Fatigue
          </h2>

          <AnimatedSlider
            label="Hourly Escalation Cap"
            description="Maximum escalation notifications per hour before throttling."
            value={fatigueLimit}
            onChange={setFatigueLimit}
            min={1}
            max={50}
            unit="/hr"
          />

          <AnimatedSlider
            label="Cooldown Window"
            description="Minimum minutes between repeat escalations from the same user."
            value={cooldownMinutes}
            onChange={setCooldownMinutes}
            min={5}
            max={120}
            unit="m"
          />

          <ToggleSwitch
            label="Digest Mode"
            description="Batch non-critical Log items into a single hourly digest."
            checked={digestMode}
            onChange={setDigestMode}
          />
        </motion.section>

        <motion.section
          {...fadeUp}
          transition={{ ...springSnappy, delay: 0.1 }}
          className="space-y-4 lg:col-span-2"
        >
          <h2 className="sentinel-text-muted text-sm font-semibold uppercase tracking-wider">
            Behavior Toggles
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleSwitch
              label="Auto-Escalate Critical"
              description="Route Escalate decisions to webhooks and on-call channels instantly."
              checked={autoEscalate}
              onChange={setAutoEscalate}
            />
            <ToggleSwitch
              label="After-Hours Boost"
              description="Increase urgency scores during off-hours and weekends."
              checked={afterHoursBoost}
              onChange={setAfterHoursBoost}
            />
            <ToggleSwitch
              label="Ignore Bot Messages"
              description="Prevent infinite loops from bot-generated content."
              checked={muteBots}
              onChange={setMuteBots}
            />
          </div>
        </motion.section>

        <motion.section
          {...fadeUp}
          transition={{ ...springSnappy, delay: 0.14 }}
          className="space-y-4 lg:col-span-2"
        >
          <h2 className="sentinel-text-muted flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
            <Webhook className="h-4 w-4 text-violet-400" />
            Escalation Targets
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Webhook URL"
              description="POST destination for Escalate decisions"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.example.com/..."
            />
            <FormField
              label="Escalation Channel"
              description="Slack channel for critical alerts"
              value={escalationChannel}
              onChange={(e) => setEscalationChannel(e.target.value)}
              placeholder="#incidents"
            />
            <FormField
              label="Log Channel"
              description="Destination for actionable Log items"
              value={logChannel}
              onChange={(e) => setLogChannel(e.target.value)}
              placeholder="#engineering-log"
            />
          </div>

          <FormTextarea
            label="Custom Rule Overrides"
            description="Natural-language rules appended to the triage prompt"
            value={customRules}
            onChange={(e) => setCustomRules(e.target.value)}
            placeholder="Add custom escalation logic..."
            rows={4}
          />
        </motion.section>
      </div>

      <motion.div
        {...fadeUp}
        transition={{ ...springSnappy, delay: 0.2 }}
        className="sentinel-divider mt-8 flex justify-end border-t pt-6"
      >
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white opacity-80 transition-all hover:bg-violet-500 hover:opacity-100"
        >
          <Save className="h-4 w-4" />
          Save Configuration
          <span className="text-[10px] font-normal text-violet-200/70">
            (preview only)
          </span>
        </button>
      </motion.div>
    </SentinelShell>
  );
}
