import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@cloudflare/kumo";
import { TestTube, Robot, Copy, DownloadSimple } from "@phosphor-icons/react";
import { AppButton } from "~/components/ui/AppButton";
import { PageHeader } from "~/components/ui/PageHeader";
import { EmptyState } from "~/components/ui/EmptyState";
import { ListSkeleton } from "~/components/ui/Skeleton";
import { Toast, type ToastMessage } from "~/components/ui/Toast";
import { AgentTaskNotice } from "~/components/agent/AgentTaskNotice";
import { useAgentTask } from "~/lib/use-agent-task";
import { openChatTask } from "~/lib/chat-task";
import { SitDashboard } from "~/components/sit/SitDashboard";
import { SitTestCaseDetail } from "~/components/sit/SitTestCaseDetail";
import type { QualityCounts } from "~/components/sit/SitQualityPanel";
import type { SitQualityIssue } from "~/lib/sit-parser";
import type { SitDataset, SitTestCase, SitFileEntry } from "~/shared/sit-types";

export const Route = createFileRoute("/projects/$id/sit")({
  component: SitPage,
});

function SitPage() {
  const { id } = Route.useParams();

  const [data, setData] = useState<SitDataset | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedTc, setSelectedTc] = useState<SitTestCase | null>(null);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);

  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [issues, setIssues] = useState<SitQualityIssue[]>([]);
  const [qualityCounts, setQualityCounts] = useState<QualityCounts>({ errors: 0, warnings: 0, infos: 0 });
  const [qualityBusy, setQualityBusy] = useState(false);


  const showToast = useCallback((kind: "success" | "error", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`/api/projects/${id}/sit`, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setData(json);
          if (selectedFilename) {
            const match = json.files?.find((f: SitFileEntry) => f.filename === selectedFilename);
            if (match) {
              const detail = await fetch(`/api/projects/${id}/sit/${selectedFilename}`, { cache: "no-store" });
              if (detail.ok) setSelectedTc(await detail.json());
            }
          }
          setLoaded(true);
          return;
        }
      } catch {}
      if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
    }
    setLoaded(true);
  }, [id, selectedFilename]);

  const loadQuality = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}/sit/quality`, { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setIssues(d.issues ?? []);
        setQualityCounts(d.counts ?? { errors: 0, warnings: 0, infos: 0 });
      }
    } catch {}
  }, [id]);

  const refreshAll = useCallback(() => {
    void load();
    void loadQuality();
  }, [load, loadQuality]);

  useEffect(() => { refreshAll(); }, [id]);

  // Normalize one file to STANDARD format.
  const normalizeFile = useCallback(async (file: string) => {
    setQualityBusy(true);
    try {
      const res = await fetch(`/api/projects/${id}/sit/${encodeURIComponent(file)}/normalize`, { method: "POST" });
      if (res.ok) {
        showToast("success", `${file} dinormalisasi`);
        setSelectedTc(null);
        setSelectedFilename(null);
        void load();
        void loadQuality();
      } else {
        showToast("error", "Normalisasi gagal");
      }
    } catch {
      showToast("error", "Normalisasi gagal");
    } finally {
      setQualityBusy(false);
    }
  }, [id, load, loadQuality, showToast]);

  // Normalize every file.
  const normalizeAll = useCallback(async () => {
    setQualityBusy(true);
    try {
      const res = await fetch(`/api/projects/${id}/sit/normalize-all`, { method: "POST" });
      if (res.ok) {
        const d = await res.json();
        showToast("success", `Normalisasi selesai: ${d.normalized} file diperbarui`);
        setSelectedTc(null);
        setSelectedFilename(null);
        void load();
        void loadQuality();
      } else {
        showToast("error", "Normalisasi gagal");
      }
    } catch {
      showToast("error", "Normalisasi gagal");
    } finally {
      setQualityBusy(false);
    }
  }, [id, load, loadQuality, showToast]);


  const selectTc = useCallback(async (entry: SitFileEntry) => {
    setSelectedFilename(entry.filename);
    try {
      const res = await fetch(`/api/projects/${id}/sit/${entry.filename}`, { cache: "no-store" });
      if (res.ok) setSelectedTc(await res.json());
    } catch {}
  }, [id]);


  // Build a refinement prompt from the current issues and run it via the agent.
  const fixWithAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}/sit/feedback`, { cache: "no-store" });
      if (!res.ok) throw new Error("feedback build failed");
      const d = await res.json();
      const feedback = d.feedback as string;
      if (feedback && feedback.trim()) {
        // The fix runs as a chat thread, like Generate: the feedback is sent in it once.
        const res2 = await fetch("/api/chat/threads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId: id, title: "Perbaiki SIT", mode: "agent", permissionMode: "ask" }),
          cache: "no-store",
        });
        if (!res2.ok) throw new Error("thread create failed");
        const created = (await res2.json()) as { thread: { id: string } };
        openChatTask({ threadId: created.thread.id, text: feedback });
      } else {
        showToast("error", "Tidak ada feedback untuk agent");
      }
    } catch {
      showToast("error", "Gagal menyiapkan perbaikan agent");
    }
  }, [id, showToast]);

  // Generate SIT runs as a chat thread; when it ends, the page reloads the test cases.
  const task = useAgentTask(id, "sit", () => {
    setSelectedTc(null);
    setSelectedFilename(null);
    void load();
    void loadQuality();
  });
  const generating = task.running;
  const handleGenerate = useCallback(() => void task.start(), [task]);

  const copyPrompt = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/agent/prompt?projectId=${encodeURIComponent(id)}&mode=sit`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const d = await res.json();
        await navigator.clipboard.writeText(d.command);
        showToast("success", `Prompt disalin (${d.agentName}) — tempel di terminal`);
      } else {
        showToast("error", "Gagal membuat prompt");
      }
    } catch {
      showToast("error", "Gagal menyalin prompt");
    }
  }, [id, showToast]);

  const exportXlsx = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/projects/${id}/sit/export-xlsx`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err?.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SIT-${id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("success", "Export XLSX berhasil");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Export gagal");
    } finally {
      setExporting(false);
    }
  }, [id, showToast]);





  return (
    <div className="h-full flex flex-col">
      <PageHeader
        icon={<TestTube size={14} className="text-kumo-brand" />}
        title="System Integration Test"
        help="sit"
        badges={data?.summary ? (
          <>
            <Badge variant="neutral" className="text-[11px]">{data.summary.overall.totalTcGroups} TC Groups</Badge>
            <Badge variant="neutral" className="text-[11px]">{data.summary.overall.totalSteps} Steps</Badge>
            <Badge variant="neutral" className="text-[11px] text-green-400/80">{data.summary.overall.totalPassed} Pass</Badge>
            <Badge variant="neutral" className="text-[11px] text-red-400/80">{data.summary.overall.totalFailed} Fail</Badge>
            <Badge variant="neutral" className="text-[11px] text-blue-400/80">{data.summary.overall.readinessPercentage}% ready</Badge>
          </>
        ) : undefined}
        actions={
          <>
            <AppButton
              onClick={handleGenerate} disabled={generating}
              variant="primary"
              size="sm"
              icon={<Robot size={12} className={generating ? "animate-pulse" : ""} />}
              className="rounded-full px-3"
              title={generating ? "Sedang berjalan di chat" : "Generate SIT dari semua artifact lewat chat"}
            >
              {generating ? "Agent berjalan…" : "Generate SIT"}
            </AppButton>
            <AppButton
              onClick={copyPrompt}
              variant="secondary"
              size="sm"
              icon={<Copy size={12} />}
              className="rounded-full px-3"
              title="Salin prompt untuk dijalankan manual di terminal"
            >
              Copy Prompt
            </AppButton>
            {data && data.files.length > 0 && (
              <AppButton
                onClick={exportXlsx}
                variant="secondary"
                size="sm"
                icon={<DownloadSimple size={12} className={exporting ? "animate-pulse" : ""} />}
                className="rounded-full px-3"
                title="Export SIT sebagai panduan QC dalam format Excel"
              >
                {exporting ? "Exporting..." : "Export XLSX"}
              </AppButton>
            )}
          </>
        }
      />

      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="shrink-0 mb-3 empty:hidden">
        <AgentTaskNotice task={task} />
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {!loaded ? (
          <ListSkeleton rows={6} className="mt-1" />
        ) : selectedTc ? (
          <SitTestCaseDetail tc={selectedTc} onBack={() => { setSelectedTc(null); setSelectedFilename(null); }} />
        ) : data && data.files.length > 0 ? (
          <SitDashboard
            data={data}
            onSelect={selectTc}
            issues={issues}
            qualityCounts={qualityCounts}
            qualityBusy={qualityBusy}
            onNormalizeAll={normalizeAll}
            onFixWithAgent={fixWithAgent}
            onNormalizeFile={normalizeFile}
          />
        ) : (
          <EmptyState
            icon={<TestTube size={36} className="text-kumo-brand/60" />}
            title="Belum ada data SIT"
            description="Generate test cases dari FSD, ERD, API Spec, Tasks, dan RTM untuk dijadikan panduan QC — atau copy prompt untuk menjalankan agent manual via terminal."
            action={
              <div className="flex items-center gap-2">
                <AppButton onClick={handleGenerate} disabled={generating} variant="primary" size="sm" icon={<Robot size={12} />} className="rounded-full px-4">
                  Generate SIT
                </AppButton>
                <AppButton onClick={copyPrompt} variant="secondary" size="sm" icon={<Copy size={12} />} className="rounded-full px-4">
                  Copy Prompt
                </AppButton>
              </div>
            }
            className="h-full"
          />
        )}
      </div>

    </div>
  );
}
