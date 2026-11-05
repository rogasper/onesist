import { McpServersPanel } from "~/components/settings/McpServersPanel";
import { AgentCliPanel } from "~/components/settings/AgentCliPanel";
import { AppearancePanel } from "~/components/settings/AppearancePanel";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Gear } from "@phosphor-icons/react";
import { PageHeader } from "~/components/ui/PageHeader";
import { AppButton } from "~/components/ui/AppButton";
import { ProviderSettings } from "~/components/providers/ProviderSettings";

export const Route = createFileRoute("/settings")({
  component: GlobalSettingsPage,
});

type GlobalTab = "models" | "mcp" | "cli" | "appearance";

/**
 * Machine-wide settings. BYOK providers, external MCP servers and agent-CLI
 * detection all live in global backend stores (`llm_providers` and
 * `mcp_servers` have no project_id); terminal prefs and the theme are
 * per-device (localStorage). Project settings keep their own page — both
 * surfaces read the same rows.
 */
function GlobalSettingsPage() {
  const [activeTab, setActiveTab] = useState<GlobalTab>("models");

  const TABS: { id: GlobalTab; label: string }[] = [
    { id: "models", label: "Model & BYOK" },
    { id: "mcp", label: "MCP Servers" },
    { id: "cli", label: "Agent CLI" },
    { id: "appearance", label: "Tampilan & Terminal" },
  ];

  return (
    <div className="max-w-2xl">
      <PageHeader
        icon={<Gear size={14} className="text-kumo-brand" />}
        title="Global Settings"
        help="globalSettings"
        className="mb-4 shrink-0"
      />

      <div className="flex items-center gap-1.5 mb-5 border-b border-kumo-line pb-3">
        {TABS.map((t) => (
          <AppButton
            key={t.id}
            variant="chip"
            size="sm"
            active={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-3"
          >
            {t.label}
          </AppButton>
        ))}
      </div>

      {activeTab === "models" && (
        <Section title="Model & BYOK">
          <ProviderSettings variant="inline" open onClose={() => {}} />
        </Section>
      )}

      {activeTab === "mcp" && (
        <Section title="MCP Servers (Eksternal)">
          <McpServersPanel />
        </Section>
      )}

      {activeTab === "cli" && (
        <Section title="Agent CLI">
          <AgentCliPanel />
        </Section>
      )}

      {activeTab === "appearance" && (
        <Section title="Tampilan & Terminal">
          <AppearancePanel />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5">
      <h2 className="text-xs font-medium text-kumo-subtle uppercase tracking-wider mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
