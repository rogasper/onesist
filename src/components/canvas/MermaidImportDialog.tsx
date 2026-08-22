import { useState } from "react";
import { Button, Dialog, DialogDescription, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { AppButton } from "~/components/ui/AppButton";
import {
  Code,
  GitBranch,
  WarningCircle,
  Sparkle,
  TreeStructure,
  ArrowsLeftRight,
  Shapes,
  Cloud,
  Eraser,
  Check,
} from "@phosphor-icons/react";

const MERMAID_TEMPLATES: { id: string; label: string; icon: any; desc: string; code: string }[] = [
  {
    id: "flowchart",
    label: "Flowchart",
    icon: TreeStructure,
    desc: "Process & decision workflow",
    code: `graph TD
    Start([Start Project]) --> Requirements[Analyze FSD Requirements]
    Requirements --> Design[Create ERD & API Spec]
    Design --> Review{Review Passed?}
    Review -- Yes --> Tasks[Breakdown Developer Tasks]
    Review -- No --> Refine[Refine FSD & Specs]
    Refine --> Requirements
    Tasks --> End([Ready for Sprint])`,
  },
  {
    id: "sequence",
    label: "Sequence",
    icon: ArrowsLeftRight,
    desc: "API / actor interaction sequence",
    code: `sequenceDiagram
    autonumber
    actor Client as Frontend Client
    participant API as API Gateway / Backend
    participant DB as SQLite / PostgreSQL

    Client->>API: POST /api/auth/login { username, password }
    activate API
    API->>DB: SELECT * FROM users WHERE username = ?
    activate DB
    DB-->>API: User Record (hashed_pwd, role)
    deactivate DB
    API->>API: Verify Password & Sign JWT
    API-->>Client: 200 OK { token, user }
    deactivate API`,
  },
  {
    id: "classDiagram",
    label: "Class / Entity",
    icon: Shapes,
    desc: "OOP / data model relationship",
    code: `classDiagram
    class User {
      +String id
      +String email
      +String role
      +login()
    }
    class Project {
      +String id
      +String name
      +String rootPath
      +getStats()
    }
    class Task {
      +String id
      +String title
      +Int storyPoints
      +String status
    }
    User "1" -- "*" Project : owns
    Project "1" -- "*" Task : contains`,
  },
  {
    id: "architecture",
    label: "Architecture",
    icon: Cloud,
    desc: "System topology & infrastructure",
    code: `flowchart LR
    subgraph ClientLayer["Frontend & Desktop"]
      WEB["React 19 Web App"]
      TAURI["Tauri 2 Desktop Shell"]
    end

    subgraph BackendLayer["Server Side (Bun)"]
      API["API Router & Endpoints"]
      SSE["SSE Event Bus"]
      TERM["Terminal Server PTY"]
    end

    subgraph StorageLayer["Data & Persistence"]
      DB[("SQLite + Drizzle ORM")]
      FS[("Local Project Workspace")]
    end

    WEB -->|HTTP / SSE| API
    TAURI -->|Sidecar Executable| API
    API --> DB
    API --> FS
    API --> SSE`,
  },
];

const PLANTUML_TEMPLATES: { id: string; label: string; icon: any; desc: string; code: string }[] = [
  {
    id: "plant-deployment",
    label: "Deployment (HLD)",
    icon: Cloud,
    desc: "Nodes, DB, queue — ELK layout",
    code: `@startuml
title Onesist HLD — Tauri + Bun + SQLite

node "Client" {
  [React 19 Web] as WEB
  [Tauri 2 Shell] as TAURI
}
node "Server (Bun)" {
  [API Router] as API
  [SSE Event Bus] as SSE
  [Terminal PTY] as TERM
  database "SQLite + Drizzle" as DB
}
cloud "OS / Filesystem" {
  [Project Workspace] as FS
}
WEB --> API : HTTP / SSE
TAURI --> API : Sidecar
API --> DB
API --> FS
API --> SSE
API --> TERM
@enduml`,
  },
  {
    id: "plant-nwdiag",
    label: "Network / Infra",
    icon: TreeStructure,
    desc: "Nwdiag lanes — network topology",
    code: `@startuml
@startnwdiag
title Network — VPC + Services
network dmz {
  address = "10.0.0.0/24"
  web [address = "10.0.0.10"]
  lb  [address = "10.0.0.11"]
}
network internal {
  address = "10.0.1.0/24"
  api [address = "10.0.1.10"]
  db  [address = "10.0.1.20"]
  cache [address = "10.0.1.30"]
}
web -- lb
lb -- api
api -- db
api -- cache
@endnwdiag
@enduml`,
  },
  {
    id: "plant-component",
    label: "Component (C4)",
    icon: Shapes,
    desc: "Components & containers",
    code: `@startuml
title C4 Component — SA Dashboard

package "Frontend" {
  [React App] as FE
  [Tauri Shell] as DESKTOP
}
package "Backend" {
  [API Router] as API
  [Agent Runner] as AGENT
  [File Watcher] as WATCHER
}
database "SQLite" as DB

FE --> API
DESKTOP --> API
API --> DB
AGENT --> API
WATCHER --> API
@enduml`,
  },
];

const TEMPLATES = MERMAID_TEMPLATES;

interface MermaidImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (code: string, replaceExisting: boolean) => Promise<void> | void;
  isPlantUmlLoading?: boolean;
}

export function MermaidImportDialog({ open, onClose, onImport, isPlantUmlLoading }: MermaidImportDialogProps) {
  const [activeTab, setActiveTab] = useState<"mermaid" | "plantuml">("mermaid");
  const [selectedTemplate, setSelectedTemplate] = useState("flowchart");
  const [code, setCode] = useState(MERMAID_TEMPLATES[0].code);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templates = activeTab === "plantuml" ? PLANTUML_TEMPLATES : MERMAID_TEMPLATES;

  const handleSelectTemplate = (tmpl: (typeof templates)[0]) => {
    setSelectedTemplate(tmpl.id);
    setCode(tmpl.code);
    setError(null);
  };

  const handleTabChange = (tab: "mermaid" | "plantuml") => {
    setActiveTab(tab);
    const t = tab === "plantuml" ? PLANTUML_TEMPLATES[0] : MERMAID_TEMPLATES[0];
    setSelectedTemplate(t.id);
    setCode(t.code);
    setError(null);
  };

  const handleConvert = async () => {
    if (!code.trim()) {
      setError("Please enter Mermaid diagram code");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onImport(code, replaceExisting);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to parse Mermaid diagram. Please check for syntax errors.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Dialog className="max-w-3xl">
        <div className="p-6 text-kumo-default">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-kumo-brand/10 text-kumo-brand">
                <GitBranch size={20} />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-kumo-default">
                  Import Diagram to Canvas
                </DialogTitle>
                <DialogDescription className="text-xs text-kumo-subtle mt-0.5">
                  Mermaid → vector + tech icons • PlantUML (excaliplant) → ELK layout → Excalidraw
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Engine Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-kumo-elevated border border-kumo-line w-fit mb-3">
            <button
              onClick={() => handleTabChange("mermaid")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "mermaid" ? "bg-kumo-brand text-white shadow" : "text-kumo-subtle hover:text-kumo-default"}`}
            >
              Mermaid
            </button>
            <button
              onClick={() => handleTabChange("plantuml")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "plantuml" ? "bg-kumo-brand text-white shadow" : "text-kumo-subtle hover:text-kumo-default"}`}
            >
              PlantUML (excaliplant)
            </button>
          </div>

          {/* Template Selection Pills (Horizontal Overflow) */}
          <div className="mb-3.5">
            <div className="text-[11px] font-medium text-kumo-subtle mb-2 flex items-center gap-1.5">
              <Sparkle size={13} className="text-amber-400" />
              <span>{activeTab === "plantuml" ? "Choose PlantUML template:" : "Choose Mermaid template:"}</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 min-w-0">
              {templates.map((tmpl) => {
                const Icon = tmpl.icon;
                const isSelected = selectedTemplate === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tmpl)}
                    className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs whitespace-nowrap transition-all cursor-pointer ${
                      isSelected
                        ? "border-kumo-brand bg-kumo-brand/10 text-kumo-brand font-medium ring-1 ring-kumo-brand/30 shadow-sm"
                        : "border-kumo-line bg-kumo-elevated/70 text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated hover:border-kumo-line"
                    }`}
                  >
                    <Icon size={15} className={isSelected ? "text-kumo-brand" : "text-kumo-subtle"} />
                    <span className="font-medium">{tmpl.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Code Editor Container */}
          <div className="rounded-lg border border-kumo-line bg-kumo-elevated overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-kumo-line bg-kumo-base/60 text-[11px] text-kumo-subtle">
              <div className="flex items-center gap-1.5 font-mono">
                <Code size={13} className="text-kumo-brand" />
                <span>{activeTab === "plantuml" ? "PlantUML Definition (@startuml)" : "Mermaid Definition"}</span>
              </div>
              <button
                type="button"
                onClick={() => setCode("")}
                className="flex items-center gap-1 hover:text-kumo-default transition-colors"
                title="Clear code"
              >
                <Eraser size={12} />
                <span>Clear</span>
              </button>
            </div>
            <textarea
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              placeholder="graph TD;\n  A-->B;"
              rows={11}
              className="w-full bg-transparent p-3.5 font-mono text-xs text-kumo-default placeholder-kumo-subtle focus:outline-none resize-none leading-relaxed"
              spellCheck={false}
            />
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2 animate-in fade-in">
              <WarningCircle size={16} className="shrink-0 mt-0.5" />
              <div className="break-all font-mono text-[11px] leading-snug">{error}</div>
            </div>
          )}

          {/* Options */}
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-kumo-subtle cursor-pointer select-none hover:text-kumo-default transition-colors">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="rounded border-kumo-line bg-kumo-elevated text-kumo-brand focus:ring-0 cursor-pointer"
              />
              <span>Replace current canvas (unchecked = add to existing drawing)</span>
            </label>
          </div>

          {/* Footer */}
          <div className="mt-5 flex items-center justify-end gap-2.5 pt-3 border-t border-kumo-line">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={loading || isPlantUmlLoading}>
              Cancel
            </Button>
            <AppButton
              variant="primary"
              size="sm"
              onClick={handleConvert}
              disabled={loading || isPlantUmlLoading || !code.trim()}
              icon={<GitBranch size={14} />}
              className="px-4"
            >
              {loading || isPlantUmlLoading ? "Parsing Diagram…" : "Convert to Canvas"}
            </AppButton>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
