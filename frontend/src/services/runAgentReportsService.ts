import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { ProcessedOutput } from "@/services/geminiService";

export type RunAgentReportRow = Database["public"]["Tables"]["run_agent_reports"]["Row"];

export type RunAgentReportInsert = Database["public"]["Tables"]["run_agent_reports"]["Insert"];

export async function saveRunAgentReport(
  report: RunAgentReportInsert
): Promise<RunAgentReportRow> {
  const { data, error } = await supabase
    .from("run_agent_reports")
    .insert(report)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function loadRunAgentReports(userId: string): Promise<RunAgentReportRow[]> {
  const { data, error } = await supabase
    .from("run_agent_reports")
    .select("*")
    .eq("ngo_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function deleteRunAgentReport(reportId: string): Promise<void> {
  const { error } = await supabase
    .from("run_agent_reports")
    .delete()
    .eq("id", reportId);

  if (error) {
    throw error;
  }
}

export function buildRunAgentReportTitle(source: "manual" | "files", rawInput: string, sourceFiles: string[]) {
  if (source === "files" && sourceFiles.length > 0) {
    return `Files: ${sourceFiles.slice(0, 3).join(", ")}${sourceFiles.length > 3 ? "..." : ""}`;
  }

  const preview = rawInput.trim().replace(/\s+/g, " ").slice(0, 48);
  return preview ? `${preview}${rawInput.trim().length > 48 ? "..." : ""}` : "Manual report";
}

export function toJson<T>(value: T): Json {
  return value as unknown as Json;
}

export function makeProcessedOutputFromInput(rawInput: string, sourceFiles: string[]): ProcessedOutput {
  return {
    originalFiles: sourceFiles,
    processedText: rawInput,
    summary: `Saved ${sourceFiles.length > 0 ? `${sourceFiles.length} file(s)` : "manual input"} from the run pipeline.`,
  };
}
