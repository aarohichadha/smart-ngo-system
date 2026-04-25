const path = require("path");
const { runVertexAgent } = require("../services/vertexAgentService.cjs");

const PRIORITY_LABELS = [
  { min: 8, label: "High" },
  { min: 5, label: "Medium" },
  { min: -Infinity, label: "Low" },
];

function log(scope, message, meta = undefined) {
  if (meta === undefined) {
    console.log(`[${scope}] ${message}`);
    return;
  }

  console.log(`[${scope}] ${message}`, meta);
}

function normalizePhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function toPriorityLabel(score) {
  const numericScore = Number(score || 0);
  return PRIORITY_LABELS.find((entry) => numericScore >= entry.min)?.label || "Low";
}

async function resolveNgoOwnerIdFromPhone({ supabase, phoneNumber }) {
  const normalizedTargetPhone = normalizePhoneNumber(phoneNumber);

  if (!normalizedTargetPhone) {
    throw new Error("Could not resolve NGO owner: missing phone number mapping.");
  }

  const [{ data: profiles, error: profilesError }, { data: ngoProfiles, error: ngoProfilesError }] = await Promise.all([
    supabase.from("profiles").select("id, role, user_type, contact_number"),
    supabase.from("ngo_profiles").select("user_id, contact_info"),
  ]);

  if (profilesError) {
    throw new Error(`Failed to load profiles: ${profilesError.message}`);
  }

  if (ngoProfilesError) {
    throw new Error(`Failed to load NGO profiles: ${ngoProfilesError.message}`);
  }

  const profilePhoneMap = new Map();
  for (const profile of profiles || []) {
    if (profile.role !== "ngo" && profile.user_type !== "ngo") continue;
    const normalized = normalizePhoneNumber(profile.contact_number);
    if (normalized) {
      profilePhoneMap.set(normalized, profile.id);
    }
  }

  for (const ngoProfile of ngoProfiles || []) {
    const normalized = normalizePhoneNumber(ngoProfile.contact_info);
    if (normalized && !profilePhoneMap.has(normalized)) {
      profilePhoneMap.set(normalized, ngoProfile.user_id);
    }
  }

  const resolvedNgoUserId = profilePhoneMap.get(normalizedTargetPhone);
  if (!resolvedNgoUserId) {
    throw new Error(
      `Could not resolve NGO owner for phone ${normalizedTargetPhone}. Link this WhatsApp number to profiles.contact_number or ngo_profiles.contact_info for an NGO account.`
    );
  }

  return resolvedNgoUserId;
}

async function extractTextFromBuffer({ buffer, fileName, mimeType }) {
  const safeFileName = String(fileName || "").toLowerCase();
  const safeMimeType = String(mimeType || "").toLowerCase();
  const isPdf = safeMimeType === "application/pdf" || safeFileName.endsWith(".pdf");

  if (!isPdf) {
    return buffer.toString("utf8").trim();
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str || "").join(" ");
    fullText += `${pageText}\n`;
  }

  return fullText.trim();
}

async function getReportWithNgoOwner({ supabase, reportId, fallbackNgoUserId = null }) {
  const { data: reportRow, error: reportError } = await supabase
    .from("whatsapp_reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();

  if (reportError) {
    throw new Error(`Failed to load whatsapp report: ${reportError.message}`);
  }

  if (!reportRow) {
    throw new Error(`WhatsApp report ${reportId} was not found.`);
  }

  const ngoUserId =
    reportRow.ngo_user_id ||
    reportRow?.pipeline_result?.ngo_user_id ||
    fallbackNgoUserId ||
    reportRow?.user_id ||
    reportRow?.owner_id ||
    reportRow?.profile_id ||
    null;

  if (!ngoUserId) {
    const resolvedFromPhone = await resolveNgoOwnerIdFromPhone({
      supabase,
      phoneNumber: reportRow.phone_number,
    });

    return { reportRow, ngoUserId: resolvedFromPhone };
  }

  return { reportRow, ngoUserId };
}


function mapIssueInsertPayloads(issues, ngoUserId) {
  return (issues || []).map((issue) => ({
    ngo_user_id: ngoUserId,
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
}

async function fetchReportFile({ supabase, storagePath }) {
  const { data, error } = await supabase.storage.from("reports").download(storagePath);

  if (error) {
    throw new Error(`Failed to download report from Supabase Storage: ${error.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fetchActiveVolunteers({ supabase, ngoUserId }) {
  const { data, error } = await supabase
    .from("volunteers")
    .select("*")
    .eq("ngo_user_id", ngoUserId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to load volunteers: ${error.message}`);
  }

  return data || [];
}

async function createAgentRun({ supabase, ngoUserId, state }) {
  const { data, error } = await supabase
    .from("agent_runs")
    .insert({
      ngo_user_id: ngoUserId,
      total_issues: state.issues.length,
      total_assigned: state.issues.filter((issue) => issue.status === "assigned").length,
      alerts: state.alerts,
      agent_logs: state.agentLogs,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create agent run: ${error.message}`);
  }

  return data.id;
}

async function updateAgentRun({ supabase, agentRunId, state }) {
  const { error } = await supabase
    .from("agent_runs")
    .update({
      total_issues: state.issues.length,
      total_assigned: state.issues.filter((issue) => issue.status === "assigned").length,
      alerts: state.alerts,
      agent_logs: state.agentLogs,
    })
    .eq("id", agentRunId);

  if (error) {
    throw new Error(`Failed to update agent run: ${error.message}`);
  }
}

async function persistIssues({ supabase, ngoUserId, state }) {
  if (!state.issues.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("issues")
    .insert(mapIssueInsertPayloads(state.issues, ngoUserId))
    .select("id, issue_summary, priority_score");

  if (error) {
    throw new Error(`Failed to persist generated issues: ${error.message}`);
  }

  return data || [];
}

async function updateReportPipelineState({ supabase, reportId, basePipelineResult, patch }) {
  const mergedPipelineResult = {
    ...(basePipelineResult || {}),
    ...(patch || {}),
  };

  const updatePayload = {
    pipeline_result: mergedPipelineResult,
  };

  if (patch?.status) {
    updatePayload.status = patch.status;
  }

  if (typeof patch?.extracted_issue_count === "number") {
    updatePayload.extracted_issue_count = patch.extracted_issue_count;
  }

  const { error } = await supabase
    .from("whatsapp_reports")
    .update(updatePayload)
    .eq("id", reportId);

  if (error) {
    throw new Error(`Failed to update whatsapp report state: ${error.message}`);
  }
}

async function processReport({ supabase, payload }) {
  const { reportId, storagePath } = payload;
  const { ngoUserId, reportRow } = await getReportWithNgoOwner({
    supabase,
    reportId,
    fallbackNgoUserId: payload?.ngoUserId || null,
  });
  log("WhatsApp Process", "Resolved NGO owner", { reportId, ngoUserId, storagePath });

  const fileBuffer = await fetchReportFile({ supabase, storagePath });
  const fileName = reportRow?.file_name || path.basename(storagePath);
  const mimeType = reportRow?.mime_type || "application/octet-stream";
  const extractedText = await extractTextFromBuffer({ buffer: fileBuffer, fileName, mimeType });

  log("WhatsApp Process", "Downloaded and extracted report text", {
    reportId,
    fileName,
    mimeType,
    extractedChars: extractedText.length,
  });

  const volunteers = await fetchActiveVolunteers({ supabase, ngoUserId });
  
  // Rely entirely on Vertex AI to execute ReAct loop (extraction through assignment)
  let state = await runVertexAgent(extractedText, volunteers, ngoUserId, supabase);

  const agentRunId = await createAgentRun({ supabase, ngoUserId, state });
  const insertedIssues = await persistIssues({ supabase, ngoUserId, state });

  const issueIds = insertedIssues.map((issue) => issue.id);
  const pipelineResult = reportRow?.pipeline_result || {};

  await updateReportPipelineState({
    supabase,
    reportId,
    basePipelineResult: pipelineResult,
    patch: {
      status: "processed",
      extracted_issue_count: insertedIssues.length,
      ngo_user_id: ngoUserId,
      agent_run_id: agentRunId,
      issue_ids: issueIds,
      extracted_text: extractedText,
      pre_assignment_state: {
        issues: state.issues,
        alerts: state.alerts,
        agentLogs: state.agentLogs,
      },
      processed_at: new Date().toISOString(),
    },
  });

  return {
    success: true,
    issues: insertedIssues.map((issue) => ({
      id: issue.id,
      title: issue.issue_summary || "",
      priority: toPriorityLabel(issue.priority_score),
    })),
  };
}

async function fetchPersistedIssuesForReport({ supabase, ngoUserId, issueIds }) {
  const normalizedIssueIds = Array.isArray(issueIds)
    ? issueIds.filter(Boolean)
    : [];

  if (normalizedIssueIds.length === 0) {
    throw new Error("No generated issue ids were stored for this report.");
  }

  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("ngo_user_id", ngoUserId)
    .in("id", normalizedIssueIds);

  if (error) {
    throw new Error(`Failed to load persisted issues: ${error.message}`);
  }

  const issueMap = new Map((data || []).map((issue) => [issue.id, issue]));
  return normalizedIssueIds.map((issueId) => issueMap.get(issueId)).filter(Boolean);
}

async function persistAssignments({ supabase, issueIds, finalIssues }) {
  const updates = issueIds.map((issueId, index) => ({
    issueId,
    issue: finalIssues[index],
  }));

  for (const updateItem of updates) {
    const { issueId, issue } = updateItem;
    const { error } = await supabase
      .from("issues")
      .update({
        assigned_volunteer_id: issue.assigned_volunteer_id ?? null,
        assignment_reason: issue.assignment_reason ?? null,
        status: issue.status ?? "unassigned",
        priority_score: issue.priority_score ?? null,
        urgency_score: issue.urgency_score ?? null,
      })
      .eq("id", issueId);

    if (error) {
      throw new Error(`Failed to persist assignment for issue ${issueId}: ${error.message}`);
    }
  }
}

async function assignVolunteers({ supabase, payload }) {
  const { reportId } = payload;
  const { ngoUserId, reportRow } = await getReportWithNgoOwner({
    supabase,
    reportId,
    fallbackNgoUserId: payload?.ngoUserId || null,
  });
  const pipelineResult = reportRow?.pipeline_result || {};
  const issueIds = Array.isArray(pipelineResult.issue_ids) && pipelineResult.issue_ids.length
    ? pipelineResult.issue_ids
    : Array.isArray(payload.issueIds)
      ? payload.issueIds
      : [];

  const volunteers = await fetchActiveVolunteers({ supabase, ngoUserId });
  const persistedIssues = await fetchPersistedIssuesForReport({ supabase, ngoUserId, issueIds });

  const hydratedIssues = Array.isArray(pipelineResult?.pre_assignment_state?.issues)
    ? pipelineResult.pre_assignment_state.issues.map((issue, index) => ({
        ...issue,
        id: issueIds[index] || persistedIssues[index]?.id || null,
        assigned_volunteer_id: persistedIssues[index]?.assigned_volunteer_id ?? issue.assigned_volunteer_id ?? null,
        assignment_reason: persistedIssues[index]?.assignment_reason ?? issue.assignment_reason ?? null,
        status: persistedIssues[index]?.status ?? issue.status ?? "unassigned",
      }))
    : persistedIssues;

  if (!hydratedIssues.length) {
    throw new Error("No issues available for assignment.");
  }

  // Vertex AI already handled assignments during processReport.
  // We simply read the current assignments from the already processed issues.
  let state = {
    issues: hydratedIssues,
    volunteers,
    alerts: pipelineResult?.pre_assignment_state?.alerts || [],
    agentLogs: pipelineResult?.pre_assignment_state?.agentLogs || [],
  };

  await persistAssignments({ supabase, issueIds, finalIssues: state.issues });

  if (pipelineResult.agent_run_id) {
    await updateAgentRun({ supabase, agentRunId: pipelineResult.agent_run_id, state });
  }

  await updateReportPipelineState({
    supabase,
    reportId,
    basePipelineResult: pipelineResult,
    patch: {
      status: "assigned",
      final_assignment_state: {
        issues: state.issues,
        alerts: state.alerts,
        agentLogs: state.agentLogs,
      },
      assigned_at: new Date().toISOString(),
    },
  });

  const volunteerMap = new Map(volunteers.map((volunteer) => [volunteer.id, volunteer.name]));
  const assignments = state.issues
    .filter((issue) => issue.assigned_volunteer_id)
    .map((issue) => ({
      issue_title: issue.issue_summary || "",
      volunteer_name: volunteerMap.get(issue.assigned_volunteer_id) || "Unknown volunteer",
    }));

  return {
    success: true,
    assignments,
  };
}

module.exports = {
  normalizePhoneNumber,
  resolveNgoOwnerIdFromPhone,
  processReport,
  assignVolunteers,
};
