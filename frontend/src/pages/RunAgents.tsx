import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { runOrchestrator, AgentState } from "@/agents/orchestrator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle, Circle, Loader2, ArrowRight, Upload, Download, FileText } from "lucide-react";
import { extractTextFromFiles, formatOutputForDownload, downloadAsTextFile, type ProcessedOutput } from "@/services/geminiService";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  buildRunAgentReportTitle,
  loadRunAgentReports,
  makeProcessedOutputFromInput,
  saveRunAgentReport,
  toJson,
  type RunAgentReportRow,
} from "@/services/runAgentReportsService";

const STEPS = [
  { key: "ingestion", labelKey: "runAgents.ingestion", descriptionKey: "runAgents.detectingInput" },
  { key: "extraction", labelKey: "runAgents.extraction", descriptionKey: "runAgents.parsingIssues" },
  { key: "scoring", labelKey: "runAgents.scoring", descriptionKey: "runAgents.computingScores" },
  { key: "gap_detection", labelKey: "runAgents.gapDetection", descriptionKey: "runAgents.checkingCoverage" },
  { key: "matching", labelKey: "runAgents.matching", descriptionKey: "runAgents.assigningVolunteers" },
  { key: "reallocation", labelKey: "runAgents.reallocation", descriptionKey: "runAgents.rebalancing" },
  { key: "complete", labelKey: "runAgents.report", descriptionKey: "runAgents.generatingPlan" },
];

const STEP_ORDER = STEPS.map((s) => s.key);

type StepStatus = "waiting" | "active" | "done";

function getStepStatus(stepKey: string, currentStep: string, isComplete: boolean): StepStatus {
  if (currentStep === "starting") return "waiting";
  const currentIdx = STEP_ORDER.indexOf(currentStep === "complete" ? "complete" : currentStep);
  const stepIdx = STEP_ORDER.indexOf(stepKey);

  if (isComplete && stepKey === "complete") return "done";
  if (currentStep === stepKey) return "active";
  if (stepIdx < currentIdx) return "done";
  return "waiting";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function RunAgents() {
  const [rawInput, setRawInput] = useState("");
  const [running, setRunning] = useState(false);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [debugLogs, setDebugLogs] = useState<Array<{ timestamp: string; message: string }>>([]);
  const consoleRef = useRef<HTMLDivElement>(null);
  const debugRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();
  
  // File upload states
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [processedOutput, setProcessedOutput] = useState<ProcessedOutput | null>(null);
  const [processingProgress, setProcessingProgress] = useState("");
  const [savedReports, setSavedReports] = useState<RunAgentReportRow[]>([]);
  const [loadingSavedReports, setLoadingSavedReports] = useState(false);
  const [showSavedReports, setShowSavedReports] = useState(false);
  const [selectedSavedReport, setSelectedSavedReport] = useState<RunAgentReportRow | null>(null);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [agentState?.agentLogs]);

  useEffect(() => {
    if (debugRef.current) {
      debugRef.current.scrollTop = debugRef.current.scrollHeight;
    }
  }, [debugLogs]);

  useEffect(() => {
    void refreshSavedReports();
  }, []);

  const addDebugLog = (message: string) => {
    setDebugLogs((prev) => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        message,
      },
    ]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedFiles((prev) => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toProcessedOutput = (value: unknown): ProcessedOutput | null => {
    if (!value || typeof value !== "object") return null;

    const candidate = value as Partial<ProcessedOutput>;
    if (
      Array.isArray(candidate.originalFiles) &&
      typeof candidate.processedText === "string" &&
      typeof candidate.summary === "string"
    ) {
      return {
        originalFiles: candidate.originalFiles,
        processedText: candidate.processedText,
        summary: candidate.summary,
      };
    }

    return null;
  };

  const refreshSavedReports = async () => {
    setLoadingSavedReports(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setSavedReports([]);
        return;
      }

      const reports = await loadRunAgentReports(user.id);
      setSavedReports(reports);
    } catch (error) {
      console.error("Failed to load saved run agent reports:", error);
      toast.error("Could not load saved reports.");
    } finally {
      setLoadingSavedReports(false);
    }
  };

  const handleLoadSavedReport = (report: RunAgentReportRow) => {
    setRawInput(report.raw_input || "");
    const processed = toProcessedOutput(report.processed_output);
    if (processed && typeof processed === "object") {
      setProcessedOutput(processed);
    } else {
      setProcessedOutput(null);
    }
    toast.success("Saved report loaded into the editor.");
  };

  const handleViewSavedReport = (report: RunAgentReportRow) => {
    setSelectedSavedReport(report);
  };

  const runPipelineWithInput = async (
    inputText: string,
    source: "manual" | "files" = "manual",
    sourceFiles: string[] = []
  ) => {
    const input = String(inputText ?? '').trim();

    if (!input) {
      toast.error("Please paste a field report first.");
      return;
    }

    console.log("[RunAgents] Starting pipeline", {
      source,
      inputLength: input.length,
      preview: input.slice(0, 200),
    });

    addDebugLog(`Pipeline started from ${source} input (${input.length} chars)`);

    setRunning(true);
    setAgentState(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Please sign in first.");
        return;
      }

      const { data: volunteers } = await supabase
        .from("volunteers")
        .select("*")
        .eq("ngo_user_id", user.id)
        .eq("is_active", true);

      console.log("[RunAgents] Volunteers loaded", {
        count: volunteers?.length || 0,
        volunteerIds: (volunteers || []).map((volunteer) => volunteer.id),
      });

      addDebugLog(`Loaded ${(volunteers || []).length} active volunteer(s)`);

      const finalState = await runOrchestrator(
        input,
        volunteers || [],
        (state) => {
          setAgentState({ ...state });
          addDebugLog(`Step ${state.currentStep}: ${state.issues.length} issue(s), ${state.alerts.length} alert(s)`);
        }
      );

      console.log("[RunAgents] Pipeline finished", {
        issues: finalState.issues.length,
        assignments: finalState.assignments.length,
        alerts: finalState.alerts.length,
        currentStep: finalState.currentStep,
      });

      addDebugLog(`Pipeline finished with ${finalState.issues.length} issue(s) and ${finalState.assignments.length} assignment(s)`);

      // Save to Supabase with owner id so logs can be scoped per user.
      const { error: runErr } = await supabase.from("agent_runs").insert({
        ngo_user_id: user.id,
        total_issues: finalState.issues.length,
        total_assigned: finalState.assignments.length,
        alerts: finalState.alerts as any,
        agent_logs: finalState.agentLogs as any,
      });

      if (runErr) throw runErr;

      if (finalState.issues.length > 0) {
        // Append issues so previous runs remain saved in Supabase.
        const issuesPayload = finalState.issues.map((issue) => ({
          ngo_user_id: user.id,
          issue_summary: issue.issue_summary ?? null,
          sector: issue.sector ?? null,
          location: issue.location ?? null,
          affected_count: issue.affected_count ?? null,
          priority_score: issue.priority_score ?? null,
          urgency_score: issue.urgency_score ?? null,
          status: issue.status ?? "unassigned",
          assigned_volunteer_id: issue.assigned_volunteer_id ?? null,
          assignment_reason: issue.assignment_reason ?? null,
          created_at: issue.created_at ?? new Date().toISOString(),
        }));

        const { error: issuesErr } = await supabase.from("issues").insert(issuesPayload as any);
        if (issuesErr) throw issuesErr;
      }

      try {
        const savedReport = await saveRunAgentReport({
          ngo_user_id: user.id,
          title: buildRunAgentReportTitle(source, input, sourceFiles),
          raw_input: input,
          source_type: source,
          source_files: toJson(sourceFiles),
          processed_output: toJson(
            processedOutput || makeProcessedOutputFromInput(input, sourceFiles)
          ),
          pipeline_result: toJson(finalState),
        });

        setSavedReports((prev) => [savedReport, ...prev]);
      } catch (saveError) {
        console.error("Failed to save run agent report:", saveError);
        toast.error("Pipeline ran, but saving the report failed.");
      }

      toast.success(t("runAgents.pipelineComplete", { count: finalState.issues.length }));
    } catch (e: any) {
      toast.error(t("runAgents.pipelineError", { message: e.message }));
      addDebugLog(`Pipeline error: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  const handleProcessFiles = async () => {
    if (uploadedFiles.length === 0) {
      toast.error("Please select at least one file to process.");
      return;
    }

    setProcessingFiles(true);
    setProcessingProgress("Initializing...");
    setProcessedOutput(null);

    try {
      console.log("[RunAgents] Extracting text from files", {
        fileCount: uploadedFiles.length,
        fileNames: uploadedFiles.map((file) => file.name),
      });

      addDebugLog(`Extracting ${uploadedFiles.length} file(s)`);

      const extracted = await extractTextFromFiles(uploadedFiles, (msg) => {
        console.log("[RunAgents] File extraction progress", msg);
        setProcessingProgress(msg);
        addDebugLog(msg);
      });

      const combinedText = extracted
        .map((f, i) => `FILE ${i + 1}: ${f.name}\n---\n${f.content}`)
        .join("\n\n");

      console.log("[RunAgents] Extraction complete", {
        extractedFiles: extracted.map((file) => file.name),
        combinedTextLength: combinedText.length,
      });

      addDebugLog(`Extraction complete (${combinedText.length} chars)`);

      const output: ProcessedOutput = {
        originalFiles: extracted.map((f) => f.name),
        processedText: combinedText,
        summary: `Extracted text from ${extracted.length} file(s).`,
      };

      setProcessedOutput(output);
      setRawInput(combinedText);
      void runPipelineWithInput(combinedText, "files", extracted.map((f) => f.name));
      toast.success(`Successfully processed ${uploadedFiles.length} file(s)`);
    } catch (e: any) {
      toast.error("File processing failed: " + e.message);
      setProcessingProgress("");
      addDebugLog(`File processing failed: ${e.message}`);
    } finally {
      setProcessingFiles(false);
    }
  };

  const handleDownloadProcessed = () => {
    if (!processedOutput) {
      toast.error("No processed data to download.");
      return;
    }

    const formatted = formatOutputForDownload(processedOutput);
    downloadAsTextFile(formatted, "processed-report");
    toast.success("Report downloaded successfully!");
  };

  const handleRunWithInput = async () => {
    await runPipelineWithInput(rawInput, "manual", processedOutput?.originalFiles || uploadedFiles.map((file) => file.name));
  };

  const toggleSavedReports = async () => {
    const next = !showSavedReports;
    setShowSavedReports(next);
    if (next) {
      await refreshSavedReports();
    }
  };

  const currentStep = agentState?.currentStep || "starting";
  const isComplete = agentState?.isComplete || false;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
          <h1 className="text-2xl font-bold text-foreground">{t("nav.runAgents")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("runAgents.subtitle")}</p>
      </div>

      {/* File Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Extract Text from Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload reports to extract plain text and paste it into the input box. The agent pipeline will handle AI extraction and scoring.
          </p>

          {/* File Input */}
          <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-6 hover:border-muted-foreground/40 transition cursor-pointer">
            <label className="flex flex-col items-center gap-2 cursor-pointer">
              <FileText className="w-8 h-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Select files to upload</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports .txt, .pdf (as text), .csv, .json and other document formats
                </p>
              </div>
              <input
                type="file"
                multiple
                onChange={handleFileChange}
                disabled={processingFiles}
                className="hidden"
                accept=".txt,.pdf,.csv,.json,.doc,.docx,.xls,.xlsx"
              />
            </label>
          </div>

          {/* File List */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Selected files ({uploadedFiles.length}):</p>
              <div className="space-y-2">
                {uploadedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 bg-muted rounded-md"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(idx)}
                      disabled={processingFiles}
                      className="text-xs text-red-500 hover:text-red-700 ml-2 flex-shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Processing Status */}
          {processingProgress && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                <p className="text-sm text-blue-700">{processingProgress}</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleProcessFiles}
              disabled={processingFiles || uploadedFiles.length === 0}
              className="gap-2 flex-1"
            >
              {processingFiles ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Extract Text from Files
                </>
              )}
            </Button>
            {processedOutput && (
              <Button
                onClick={handleDownloadProcessed}
                variant="outline"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Download
              </Button>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={toggleSavedReports} className="gap-2">
              <FileText className="w-4 h-4" />
              {showSavedReports ? "Hide Saved Reports" : `Saved Reports (${savedReports.length})`}
            </Button>
          </div>

          {showSavedReports && (
            <div className="rounded-lg border border-border bg-muted/10 p-3 mt-3 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Saved Reports & Inputs
              </p>
              {loadingSavedReports ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading saved reports...
                </div>
              ) : savedReports.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved reports yet. Run the pipeline once to save the current input.</p>
              ) : (
                savedReports.map((report) => {
                  const files = Array.isArray(report.source_files) ? report.source_files : [];
                  const processed = toProcessedOutput(report.processed_output);

                  return (
                    <div key={report.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{report.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {report.source_type === "files" ? `${files.length} file(s)` : "Manual input"} • {new Date(report.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleViewSavedReport(report)}>
                            View
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleLoadSavedReport(report)}>
                            Load
                          </Button>
                        </div>
                      </div>
                      {processed?.summary && (
                        <p className="text-xs text-muted-foreground">{processed.summary}</p>
                      )}
                      {files.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {files.map((fileName: string) => (
                            <Badge key={fileName} variant="secondary" className="text-[11px]">
                              {fileName}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">{t("runAgents.pasteReport")}</label>
            <Textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={t("runAgents.placeholder")}
              className="min-h-[140px] resize-none font-mono text-sm"
              disabled={running}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void handleRunWithInput()} disabled={running || !rawInput.trim()} className="gap-2 flex-1">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {running ? t("runAgents.running") : t("runAgents.runAll")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Debug Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            ref={debugRef}
            className="rounded-md border border-muted-foreground/20 bg-[#0f1117] p-3 font-mono text-xs leading-relaxed overflow-y-auto"
            style={{ minHeight: 160, maxHeight: 260 }}
          >
            {debugLogs.length === 0 ? (
              <span className="text-green-400/40">No debug events yet.</span>
            ) : (
              debugLogs.map((log, index) => (
                <div key={index} className="mb-1 text-green-200">
                  <span className="text-green-400/60">[{formatTime(log.timestamp)}]</span>{" "}
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={selectedSavedReport !== null} onOpenChange={(open) => !open && setSelectedSavedReport(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedSavedReport?.title || "Saved Report"}</DialogTitle>
            <DialogDescription>
              Snapshot saved under your NGO account on {selectedSavedReport ? new Date(selectedSavedReport.created_at).toLocaleString() : ""}.
            </DialogDescription>
          </DialogHeader>

          {selectedSavedReport && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Source</p>
                  <p className="text-sm font-medium">{selectedSavedReport.source_type === "files" ? "Files" : "Manual input"}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Issues</p>
                  <p className="text-sm font-medium">{selectedSavedReport.pipeline_result ? (selectedSavedReport.pipeline_result as any)?.issues?.length ?? 0 : 0}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Assignments</p>
                  <p className="text-sm font-medium">{selectedSavedReport.pipeline_result ? (selectedSavedReport.pipeline_result as any)?.assignments?.length ?? 0 : 0}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Raw Input</p>
                <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed max-h-56 overflow-y-auto">
                  {selectedSavedReport.raw_input}
                </pre>
              </div>

              {toProcessedOutput(selectedSavedReport.processed_output)?.summary && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Processed Summary</p>
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                    {toProcessedOutput(selectedSavedReport.processed_output)?.summary}
                  </div>
                </div>
              )}

              {selectedSavedReport.pipeline_result && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Pipeline Result</p>
                  <pre className="whitespace-pre-wrap rounded-lg border border-border bg-[#0f1117] text-green-200 p-3 text-xs leading-relaxed max-h-80 overflow-y-auto">
                    {JSON.stringify(selectedSavedReport.pipeline_result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stepper + Console — only show once started */}
      {agentState && (
        <div className="grid grid-cols-5 gap-6">
          {/* Stepper */}
          <div className="col-span-2">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t("runAgents.pipelineSteps")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {STEPS.map((step) => {
                  const status = getStepStatus(step.key, currentStep, isComplete);
                  const log = agentState.agentLogs.find((l) =>
                    l.agent.toLowerCase().includes(step.key === "complete" ? "report" : step.key.replace("_", " "))
                  );
                  return (
                    <div key={step.key} className="flex gap-3 items-start">
                      <div className="mt-0.5 flex-shrink-0">
                        {status === "done" && <CheckCircle className="w-5 h-5 text-primary" />}
                        {status === "active" && <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />}
                        {status === "waiting" && <Circle className="w-5 h-5 text-muted-foreground/30" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium leading-tight ${status === "waiting" ? "text-muted-foreground" : "text-foreground"}`}>
                          {t(step.labelKey)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t(step.descriptionKey)}
                        </p>
                        {status === "done" && log && (
                          <p className="text-xs text-primary mt-1 truncate">{log.decision}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Agent Thoughts Console */}
          <div className="col-span-3">
            <Card className="h-full border-0 overflow-hidden">
              <CardHeader className="pb-2 bg-[hsl(222,20%,9%)] border-b border-white/5">
                <CardTitle className="text-xs text-green-400 font-mono flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  {t("runAgents.agentThoughts")}
                </CardTitle>
              </CardHeader>
              <div
                ref={consoleRef}
                className="terminal-console p-4 text-xs leading-relaxed overflow-y-auto"
                style={{ minHeight: 280, maxHeight: 380, background: "#0f1117" }}
              >
                {agentState.agentLogs.length === 0 ? (
                  <span className="text-green-400/40">{t("runAgents.waiting")}</span>
                ) : (
                  agentState.agentLogs.map((log, i) => (
                    <div key={i} className="mb-2">
                      <span className="text-green-400/60">[{formatTime(log.timestamp)}]</span>
                      {" "}
                      <span className="text-cyan-400">{log.agent}</span>
                      {" › "}
                      <span className="text-green-300">{log.decision}</span>
                    </div>
                  ))
                )}
                {running && (
                  <span className="text-amber-400 animate-pulse">▌</span>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Post-completion CTA */}
      {isComplete && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 border border-primary/20">
          <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
          <p className="text-sm text-foreground flex-1">
            {t("runAgents.pipelineCompleteSteps", { count: agentState?.agentLogs.length || 0 })}
          </p>
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link to="/issues">
              {t("runAgents.viewIssues")} <ArrowRight className="w-3 h-3" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
