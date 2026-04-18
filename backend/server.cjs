const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { createClient } = require("@supabase/supabase-js");
const {
  normalizePhoneNumber,
  resolveNgoOwnerIdFromPhone,
  processReport,
  assignVolunteers,
} = require("./src/server/whatsappPipeline.cjs");
const { runVertexAgent } = require("./src/services/vertexAgentService.cjs");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
  ]);

  if (!origin || allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

const PORT = Number(process.env.PORT || 3000);
const INTERNAL_API_BASE_URL =
  process.env.WHATSAPP_INTERNAL_API_BASE_URL || `http://127.0.0.1:${PORT}`;

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "sahayak123";

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERP_API_KEY = process.env.SERP_API_KEY;

const missingEnv = [
  !ACCESS_TOKEN && "WHATSAPP_ACCESS_TOKEN",
  !WHATSAPP_PHONE_NUMBER_ID && "WHATSAPP_PHONE_NUMBER_ID",
  !SUPABASE_URL && "VITE_SUPABASE_URL",
  !SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
].filter(Boolean);

if (missingEnv.length > 0) {
  console.error("Missing required env variables:", missingEnv.join(", "));
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function buildIssuesSummary(issues) {
  if (!Array.isArray(issues) || issues.length === 0) {
    return "No major issues were extracted from the report.";
  }

  return issues
    .slice(0, 5)
    .map((issue, index) => {
      const title = issue.title || issue.issue_title || `Issue ${index + 1}`;
      const priority = issue.priority || issue.severity || "Unknown";
      return `${index + 1}. ${title} - Priority: ${priority}`;
    })
    .join("\n");
}

function buildAssignmentSummary(assignments) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return "No volunteers were assigned.";
  }

  return assignments
    .slice(0, 5)
    .map((assignment, index) => {
      const issueTitle =
        assignment.issue_title || assignment.issue || `Issue ${index + 1}`;
      const volunteerName =
        assignment.volunteer_name || assignment.volunteer || "Unknown volunteer";
      return `${index + 1}. ${issueTitle} -> ${volunteerName}`;
    })
    .join("\n");
}

async function sendWhatsAppText(to, body) {
  try {
    await axios.post(
      `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Message sent to:", to);
  } catch (error) {
    console.error(
      "Send message failed:",
      error.response?.data || error.message
    );
  }
}

async function uploadToSupabase(
  filePath,
  fileName,
  mimeType = "application/octet-stream"
) {
  try {
    const fileBuffer = fs.readFileSync(filePath);

    const { data, error } = await supabase.storage
      .from("reports")
      .upload(`whatsapp/${Date.now()}_${fileName}`, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      return null;
    }

    console.log("Uploaded to Supabase:", data.path);
    return data.path;
  } catch (err) {
    console.error("Upload failed:", err);
    return null;
  }
}

async function uploadBufferToSupabase(
  buffer,
  fileName,
  mimeType = "application/octet-stream"
) {
  try {
    const { data, error } = await supabase.storage
      .from("reports")
      .upload(`whatsapp/${Date.now()}_${fileName}`, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error("Supabase buffer upload error:", error);
      return null;
    }

    console.log("Uploaded buffer to Supabase:", data.path);
    return data.path;
  } catch (err) {
    console.error("Buffer upload failed:", err);
    return null;
  }
}

async function downloadWhatsAppMedia(mediaId, fileName = "file.bin") {
  try {
    const metaRes = await axios.get(
      `https://graph.facebook.com/v22.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );

    const mediaUrl = metaRes.data.url;

    const fileRes = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    });

    const uploadsDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir);
    }

    const safeFileName = fileName.replace(/[<>:"/\\|?*]+/g, "_");
    const filePath = path.join(uploadsDir, safeFileName);

    fs.writeFileSync(filePath, fileRes.data);

    console.log("File saved at:", filePath);
    return filePath;
  } catch (error) {
    console.error(
      "Media download failed:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function createWhatsAppReport({
  phoneNumber,
  messageId,
  storagePath,
  fileName,
  mimeType,
}) {
  let ngoUserId;

  try {
    ngoUserId = await resolveNgoOwnerIdFromPhone({
      supabase,
      phoneNumber,
    });
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Could not resolve NGO owner.",
      type: "owner_not_found",
    };
  }

  const insertPayload = {
    ngo_user_id: ngoUserId,
    phone_number: phoneNumber,
    message_id: messageId,
    storage_path: storagePath,
    file_name: fileName,
    mime_type: mimeType,
    status: "processing",
    pipeline_result: {
      ngo_user_id: ngoUserId,
      source: "whatsapp",
      normalized_phone_number: normalizePhoneNumber(phoneNumber),
    },
  };

  let { data, error } = await supabase
    .from("whatsapp_reports")
    .insert([insertPayload])
    .select()
    .single();

  if (
    error?.code === "PGRST204" &&
    error?.message?.includes("'ngo_user_id' column")
  ) {
    console.warn(
      "whatsapp_reports table is missing ngo_user_id; retrying insert with pipeline_result fallback."
    );

    const { ngo_user_id, ...legacyPayload } = insertPayload;
    ({ data, error } = await supabase
      .from("whatsapp_reports")
      .insert([legacyPayload])
      .select()
      .single());
  }

  if (error) {
    console.error("whatsapp_reports insert error:", error);
    return {
      data: null,
      error: error.message,
      type: "insert_failed",
    };
  }

  return {
    data,
    error: null,
    type: null,
  };
}

async function updateWhatsAppReport(reportId, updates) {
  const nextUpdates = { ...updates };

  if (updates.pipeline_result && typeof updates.pipeline_result === "object") {
    const { data: currentRow, error: fetchError } = await supabase
      .from("whatsapp_reports")
      .select("pipeline_result")
      .eq("id", reportId)
      .maybeSingle();

    if (fetchError) {
      console.error("whatsapp_reports fetch before update error:", fetchError);
    } else {
      nextUpdates.pipeline_result = {
        ...(currentRow?.pipeline_result || {}),
        ...updates.pipeline_result,
      };
    }
  }

  const { error } = await supabase
    .from("whatsapp_reports")
    .update(nextUpdates)
    .eq("id", reportId);

  if (error) {
    console.error("whatsapp_reports update error:", error);
  }
}

async function upsertConversation(phoneNumber, currentState, context = {}) {
  const { error } = await supabase.from("whatsapp_conversations").upsert({
    phone_number: phoneNumber,
    current_state: currentState,
    context,
  });

  if (error) {
    console.error("whatsapp_conversations upsert error:", error);
  }
}

async function getConversation(phoneNumber) {
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (error) {
    console.error("whatsapp_conversations fetch error:", error);
    return null;
  }

  return data;
}

app.post("/api/whatsapp/process-report", async (req, res) => {
  const startedAt = Date.now();
  const payload = {
    reportId: req.body?.reportId,
    storagePath: req.body?.storagePath,
    phoneNumber: req.body?.phoneNumber,
    source: req.body?.source || "whatsapp",
  };

  if (!payload.reportId || !payload.storagePath || !payload.phoneNumber) {
    return res.status(400).json({
      success: false,
      issues: [],
      error: "reportId, storagePath, and phoneNumber are required.",
    });
  }

  try {
    console.log("[API /api/whatsapp/process-report] Request received", payload);

    const result = await processReport({
      supabase,
      payload,
    });

    console.log("[API /api/whatsapp/process-report] Completed", {
      reportId: payload.reportId,
      issues: result.issues.length,
      durationMs: Date.now() - startedAt,
    });

    return res.json(result);
  } catch (error) {
    const message = error?.message || "Unknown processing error";
    console.error("[API /api/whatsapp/process-report] Failed", {
      reportId: payload.reportId,
      error: message,
      stack: error?.stack,
    });

    return res.status(500).json({
      success: false,
      issues: [],
      error: message,
    });
  }
});

app.post("/api/whatsapp/process-text-report", async (req, res) => {
  const startedAt = Date.now();
  const payload = {
    reportId: req.body?.reportId,
    storagePath: req.body?.storagePath,
    phoneNumber: req.body?.phoneNumber,
    source: req.body?.source || "whatsapp",
  };

  if (!payload.reportId || !payload.storagePath || !payload.phoneNumber) {
    return res.status(400).json({
      success: false,
      issues: [],
      error: "reportId, storagePath, and phoneNumber are required.",
    });
  }

  try {
    console.log("[API /api/whatsapp/process-text-report] Request received", payload);

    const result = await processReport({
      supabase,
      payload,
    });

    console.log("[API /api/whatsapp/process-text-report] Completed", {
      reportId: payload.reportId,
      issues: result.issues.length,
      durationMs: Date.now() - startedAt,
    });

    return res.json(result);
  } catch (error) {
    const message = error?.message || "Unknown text processing error";
    console.error("[API /api/whatsapp/process-text-report] Failed", {
      reportId: payload.reportId,
      error: message,
      stack: error?.stack,
    });

    return res.status(500).json({
      success: false,
      issues: [],
      error: message,
    });
  }
});

app.post("/api/whatsapp/assign-volunteers", async (req, res) => {
  const startedAt = Date.now();
  const payload = {
    reportId: req.body?.reportId,
    phoneNumber: req.body?.phoneNumber,
    issueIds: Array.isArray(req.body?.issueIds) ? req.body.issueIds : [],
    ngoUserId: req.body?.ngoUserId || null,
    source: req.body?.source || "whatsapp",
  };

  if (!payload.reportId || !payload.phoneNumber) {
    return res.status(400).json({
      success: false,
      assignments: [],
      error: "reportId and phoneNumber are required.",
    });
  }

  try {
    console.log("[API /api/whatsapp/assign-volunteers] Request received", payload);

    const result = await assignVolunteers({
      supabase,
      payload,
    });

    console.log("[API /api/whatsapp/assign-volunteers] Completed", {
      reportId: payload.reportId,
      assignments: result.assignments.length,
      durationMs: Date.now() - startedAt,
    });

    return res.json(result);
  } catch (error) {
    const message = error?.message || "Unknown assignment error";
    console.error("[API /api/whatsapp/assign-volunteers] Failed", {
      reportId: payload.reportId,
      error: message,
      stack: error?.stack,
    });

    return res.status(500).json({
      success: false,
      assignments: [],
      error: message,
    });
  }
});

app.post("/api/run-vertex-agent", async (req, res) => {
  const { rawInput, volunteers } = req.body;
  
  if (!rawInput) {
    return res.status(400).json({ error: "rawInput is required" });
  }

  try {
    console.log("[API] /api/run-vertex-agent called");
    const state = await runVertexAgent(rawInput, volunteers || []);
    return res.json(state);
  } catch (error) {
    console.error("[API] Vertex Agent error:", error);
    return res.status(500).json({ error: error.message });
  }
});

async function triggerIssueExtraction({ reportId, storagePath, phoneNumber }) {
  try {
    console.log("Triggering issue extraction:", {
      mode: "local-handler",
      reportId,
      storagePath,
      phoneNumber,
    });

    const result = await processReport({
      supabase,
      payload: {
        reportId,
        storagePath,
        phoneNumber,
        source: "whatsapp",
      },
    });

    console.log("Issue extraction response:", result);

    return {
      success: !!result?.success,
      issues: result?.issues || [],
      raw: result,
    };
  } catch (error) {
    console.error(
      "Issue extraction trigger failed:",
      error?.response?.data || error?.message || error
    );
    return { success: false, issues: [] };
  }
}

async function triggerTextReportProcessing({ reportId, storagePath, phoneNumber }) {
  const payload = {
    reportId,
    storagePath,
    phoneNumber,
    source: "whatsapp",
  };

  try {
    console.log("Triggering text report processing:", {
      mode: "api-handler",
      ...payload,
    });

    const response = await axios.post(
      `${INTERNAL_API_BASE_URL}/api/whatsapp/process-text-report`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Text report processing response:", response.data);

    return {
      success: !!response.data?.success,
      issues: response.data?.issues || [],
      raw: response.data,
    };
  } catch (error) {
    console.error(
      "Text report processing trigger failed:",
      error?.response?.data || error?.message || error
    );
    return { success: false, issues: [] };
  }
}

async function triggerVolunteerAssignment({
  reportId,
  phoneNumber,
  issueIds = [],
  ngoUserId = null,
}) {
  const payload = {
    reportId,
    phoneNumber,
    issueIds,
    ngoUserId,
    source: "whatsapp",
  };

  try {
    console.log("Triggering volunteer assignment:", {
      mode: "api-handler",
      ...payload,
    });

    const response = await axios.post(
      `${INTERNAL_API_BASE_URL}/api/whatsapp/assign-volunteers`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Volunteer assignment response:", response.data);

    return {
      success: !!response.data?.success,
      assignments: response.data?.assignments || [],
      raw: response.data,
    };
  } catch (error) {
    console.error(
      "Volunteer assignment trigger failed:",
      error?.response?.data || error?.message || error
    );
    return { success: false, assignments: [] };
  }
}

async function handleDocumentMessage(message) {
  const phoneNumber = message.from;
  const mediaId = message.document?.id;
  const fileName = message.document?.filename || "document.bin";
  const mimeType = message.document?.mime_type || "application/octet-stream";

  console.log("Document received");
  console.log("Media ID:", mediaId);
  console.log("Filename:", fileName);
  console.log("Mime type:", mimeType);

  await sendWhatsAppText(
    phoneNumber,
    "Your report has been received. We are extracting issues now."
  );

  const savedPath = await downloadWhatsAppMedia(mediaId, fileName);
  console.log("Downloaded document path:", savedPath);

  const supabasePath = await uploadToSupabase(savedPath, fileName, mimeType);
  console.log("Supabase file path:", supabasePath);

  if (!supabasePath) {
    await sendWhatsAppText(
      phoneNumber,
      "We received your report, but upload failed on our side. Please try again."
    );
    return;
  }

  const reportCreation = await createWhatsAppReport({
    phoneNumber,
    messageId: message.id,
    storagePath: supabasePath,
    fileName,
    mimeType,
  });

  if (reportCreation.type === "owner_not_found") {
    await sendWhatsAppText(
      phoneNumber,
      "This WhatsApp number is not linked to any NGO account in Sahayak. Please link your NGO number first and try again."
    );
    return;
  }

  if (!reportCreation.data) {
    await sendWhatsAppText(
      phoneNumber,
      "The file was uploaded, but we could not create the processing record. Please try again."
    );
    return;
  }

  const reportRow = reportCreation.data;

  const pipelineResult = await triggerIssueExtraction({
    reportId: reportRow.id,
    storagePath: supabasePath,
    phoneNumber,
  });

  if (!pipelineResult.success) {
    await updateWhatsAppReport(reportRow.id, {
      status: "failed",
      pipeline_result: pipelineResult.raw || pipelineResult,
    });

    await sendWhatsAppText(
      phoneNumber,
      "We received your report, but issue extraction failed. Please try again."
    );
    return;
  }

  const issues = pipelineResult.issues;

  await updateWhatsAppReport(reportRow.id, {
    status: "processed",
    extracted_issue_count: issues.length,
    pipeline_result: pipelineResult.raw || pipelineResult,
  });

  const summary = buildIssuesSummary(issues);

  await sendWhatsAppText(
    phoneNumber,
    `Issues extracted successfully.\n\n${summary}\n\nDo you want to assign these issues to volunteers? Reply YES or NO.`
  );

  await upsertConversation(phoneNumber, "awaiting_assignment_confirmation", {
    report_id: reportRow.id,
    ngo_user_id: reportRow.ngo_user_id,
    issue_ids: issues.map((issue) => issue.id).filter(Boolean),
  });
}

async function handleImageMessage(message) {
  const phoneNumber = message.from;
  const mediaId = message.image?.id;
  const mimeType = message.image?.mime_type || "image/jpeg";
  const extension = mimeType === "image/png" ? ".png" : ".jpg";
  const fileName = `image_${Date.now()}${extension}`;

  console.log("Image received");
  console.log("Media ID:", mediaId);
  console.log("Mime type:", mimeType);

  await sendWhatsAppText(
    phoneNumber,
    "Your image has been received. We are extracting issues now."
  );

  const savedPath = await downloadWhatsAppMedia(mediaId, fileName);
  console.log("Downloaded image path:", savedPath);

  const supabasePath = await uploadToSupabase(savedPath, fileName, mimeType);
  console.log("Supabase file path:", supabasePath);

  if (!supabasePath) {
    await sendWhatsAppText(
      phoneNumber,
      "We received your image, but upload failed on our side. Please try again."
    );
    return;
  }

  const reportCreation = await createWhatsAppReport({
    phoneNumber,
    messageId: message.id,
    storagePath: supabasePath,
    fileName,
    mimeType,
  });

  if (reportCreation.type === "owner_not_found") {
    await sendWhatsAppText(
      phoneNumber,
      "This WhatsApp number is not linked to any NGO account in Sahayak. Please link your NGO number first and try again."
    );
    return;
  }

  if (!reportCreation.data) {
    await sendWhatsAppText(
      phoneNumber,
      "The image was uploaded, but we could not create the processing record. Please try again."
    );
    return;
  }

  const reportRow = reportCreation.data;

  const pipelineResult = await triggerIssueExtraction({
    reportId: reportRow.id,
    storagePath: supabasePath,
    phoneNumber,
  });

  if (!pipelineResult.success) {
    await updateWhatsAppReport(reportRow.id, {
      status: "failed",
      pipeline_result: pipelineResult.raw || pipelineResult,
    });

    await sendWhatsAppText(
      phoneNumber,
      "We received your image, but issue extraction failed. Please try again."
    );
    return;
  }

  const issues = pipelineResult.issues;

  await updateWhatsAppReport(reportRow.id, {
    status: "processed",
    extracted_issue_count: issues.length,
    pipeline_result: pipelineResult.raw || pipelineResult,
  });

  const summary = buildIssuesSummary(issues);

  await sendWhatsAppText(
    phoneNumber,
    `Issues extracted successfully.\n\n${summary}\n\nDo you want to assign these issues to volunteers? Reply YES or NO.`
  );

  await upsertConversation(phoneNumber, "awaiting_assignment_confirmation", {
    report_id: reportRow.id,
    ngo_user_id:
      reportRow.ngo_user_id || reportRow.pipeline_result?.ngo_user_id || null,
    issue_ids: issues.map((issue) => issue.id).filter(Boolean),
  });
}

async function handleTextReportMessage(message) {
  const phoneNumber = message.from;
  const rawText = message.text?.body?.trim() || "";

  if (!rawText) {
    await sendWhatsAppText(
      phoneNumber,
      "Please send some report details in text, or upload a report document or image."
    );
    return;
  }

  const fileName = `report_${Date.now()}.txt`;
  const mimeType = "text/plain";

  await sendWhatsAppText(
    phoneNumber,
    "Your text report has been received. We are extracting issues now."
  );

  const supabasePath = await uploadBufferToSupabase(
    Buffer.from(rawText, "utf8"),
    fileName,
    mimeType
  );
  console.log("Supabase text report path:", supabasePath);

  if (!supabasePath) {
    await sendWhatsAppText(
      phoneNumber,
      "We received your text report, but upload failed on our side. Please try again."
    );
    return;
  }

  const reportCreation = await createWhatsAppReport({
    phoneNumber,
    messageId: message.id,
    storagePath: supabasePath,
    fileName,
    mimeType,
  });

  if (reportCreation.type === "owner_not_found") {
    await sendWhatsAppText(
      phoneNumber,
      "This WhatsApp number is not linked to any NGO account in Sahayak. Please link your NGO number first and try again."
    );
    return;
  }

  if (!reportCreation.data) {
    await sendWhatsAppText(
      phoneNumber,
      "The text report was uploaded, but we could not create the processing record. Please try again."
    );
    return;
  }

  const reportRow = reportCreation.data;

  const pipelineResult = await triggerTextReportProcessing({
    reportId: reportRow.id,
    storagePath: supabasePath,
    phoneNumber,
  });

  if (!pipelineResult.success) {
    await updateWhatsAppReport(reportRow.id, {
      status: "failed",
      pipeline_result: pipelineResult.raw || pipelineResult,
    });

    await sendWhatsAppText(
      phoneNumber,
      "We received your text report, but issue extraction failed. Please try again."
    );
    return;
  }

  const issues = pipelineResult.issues;

  await updateWhatsAppReport(reportRow.id, {
    status: "processed",
    extracted_issue_count: issues.length,
    pipeline_result: pipelineResult.raw || pipelineResult,
  });

  const summary = buildIssuesSummary(issues);

  await sendWhatsAppText(
    phoneNumber,
    `Issues extracted successfully.\n\n${summary}\n\nDo you want to assign these issues to volunteers? Reply YES or NO.`
  );

  await upsertConversation(phoneNumber, "awaiting_assignment_confirmation", {
    report_id: reportRow.id,
    ngo_user_id:
      reportRow.ngo_user_id || reportRow.pipeline_result?.ngo_user_id || null,
    issue_ids: issues.map((issue) => issue.id).filter(Boolean),
  });
}

async function handleTextMessage(message) {
  const phoneNumber = message.from;
  const rawText = message.text?.body?.trim() || "";
  const userText = rawText.toLowerCase();

  console.log("Text message:", userText);

  const conversation = await getConversation(phoneNumber);

  if (
    conversation &&
    conversation.current_state === "awaiting_assignment_confirmation"
  ) {
    if (userText === "yes") {
      const reportId = conversation.context?.report_id;
      const issueIds = conversation.context?.issue_ids || [];
      const ngoUserId = conversation.context?.ngo_user_id || null;

      await sendWhatsAppText(
        phoneNumber,
        "Assigning issues to volunteers now."
      );

      const assignmentResult = await triggerVolunteerAssignment({
        reportId,
        phoneNumber,
        issueIds,
        ngoUserId,
      });

      if (!assignmentResult.success) {
        await sendWhatsAppText(
          phoneNumber,
          "Issue extraction was completed, but volunteer assignment failed."
        );
        return;
      }

      const summary = buildAssignmentSummary(assignmentResult.assignments);

      await sendWhatsAppText(
        phoneNumber,
        `Volunteer assignment completed.\n\n${summary}`
      );

      await upsertConversation(phoneNumber, "idle", {});
      return;
    }

    if (userText === "no") {
      await sendWhatsAppText(
        phoneNumber,
        "Okay. The issues have been saved without volunteer assignment."
      );
      await upsertConversation(phoneNumber, "idle", {});
      return;
    }

    if (rawText.length >= 20) {
      await sendWhatsAppText(
        phoneNumber,
        "Your previous report is still saved. I will treat this new message as a fresh text report."
      );
      await upsertConversation(phoneNumber, "idle", {});
      await handleTextReportMessage(message);
      return;
    }

    await sendWhatsAppText(phoneNumber, "Please reply with only YES or NO.");
    return;
  }

  await handleTextReportMessage(message);
}

// backend/server.cjs
app.post('/api/serp-news', async (req, res) => {
  try {
    const { query, filters = {} } = req.body || {};

    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    if (!SERP_API_KEY) {
      return res.status(500).json({ error: 'SERP_API_KEY is not configured.' });
    }

    const country = typeof filters.country === 'string' ? filters.country.trim() : '';
    const language = typeof filters.language === 'string' && filters.language.trim() ? filters.language.trim() : 'en';
    const normalizedCountry = country.toLowerCase();
    const countryCodeMap = {
      india: 'in',
      'united states': 'us',
      usa: 'us',
      us: 'us',
      uk: 'gb',
      'united kingdom': 'gb',
      canada: 'ca',
      australia: 'au',
    };

    const serpParams = new URLSearchParams({
      engine: 'google',
      tbm: 'nws',
      q: String(query).trim(),
      api_key: SERP_API_KEY,
      hl: language,
      num: '10',
    });

    const countryCode = countryCodeMap[normalizedCountry];
    if (countryCode) {
      serpParams.set('gl', countryCode);
    }

    if (country) {
      serpParams.set('location', country);
    }

    const serpResponse = await fetch(`https://serpapi.com/search.json?${serpParams.toString()}`);
    const serpData = await serpResponse.json();

    if (!serpResponse.ok || serpData.error) {
      return res.status(502).json({
        error: serpData.error || 'Failed to fetch SERP news results.',
      });
    }

    const sourceResults = Array.isArray(serpData.news_results) && serpData.news_results.length > 0
      ? serpData.news_results
      : Array.isArray(serpData.organic_results)
        ? serpData.organic_results
        : [];

    const inferSeverity = (text) => {
      const value = String(text || '').toLowerCase();
      if (/(critical|urgent|severe|deadly|emergency|evacuat|outbreak)/.test(value)) {
        return 'high';
      }
      if (/(warn|risk|concern|impact|spread|damage)/.test(value)) {
        return 'medium';
      }
      return 'low';
    };

    const inferIssueType = (text) => {
      const value = String(text || '').toLowerCase();
      if (/(water|sanitation|drought|flood|rain|storm)/.test(value)) return 'water_sanitation';
      if (/(health|hospital|disease|medical|clinic|outbreak)/.test(value)) return 'health';
      if (/(school|education|student|teacher)/.test(value)) return 'education';
      if (/(food|hunger|nutrition|ration)/.test(value)) return 'food_security';
      if (/(job|employment|livelihood|income)/.test(value)) return 'livelihood';
      return 'news';
    };

    const structuredIssues = sourceResults.slice(0, 10).map((item, index) => {
      const title = item.title || item.snippet || `News item ${index + 1}`;
      const snippet = item.snippet || '';
      const sourceName = item.source || item.displayed_source || '';

      return {
        issue_title: title,
        issue_type: inferIssueType(`${title} ${snippet}`),
        affected_population: 0,
        location: country || item.location || sourceName || 'Unknown',
        severity: inferSeverity(`${title} ${snippet}`),
        source_url: item.link || item.redirect_link || '',
        source_name: sourceName,
        published_at: item.date || null,
        snippet,
      };
    });

    return res.json(structuredIssues);
  } catch (error) {
    console.error('SERP news route failed:', error.response?.data || error.message || error);
    return res.status(500).json({
      error: 'SERP news route failed.',
    });
  }
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// app.post("/webhook", async (req, res) => {
//   try {
//     const entry = req.body.entry?.[0];
//     const change = entry?.changes?.[0];
//     const value = change?.value;
//     const message = value?.messages?.[0];

//     if (!message) {
//       return res.sendStatus(200);
//     }

//     console.log("Incoming message:", JSON.stringify(message, null, 2));

//     if (message.type === "text") {
//       await handleTextMessage(message);
//     } else if (message.type === "document") {
//       await handleDocumentMessage(message);
//     } else if (message.type === "image") {
//       await handleImageMessage(message);
//     } else {
//       await sendWhatsAppText(
//         message.from,
//         "Unsupported message type. Please send a report document or image."
//       );
//     }

//     res.sendStatus(200);
//   } catch (error) {
//     console.error(
//       "Webhook error:",
//       error.response?.data || error.message || error
//     );
//     res.sendStatus(500);
//   }
// });

app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    // Ignore Meta/sample test payloads
    if (
      !message.from ||
      message.id === "wamid.TEST" ||
      message.from === "919999999999"
    ) {
      console.log("Ignoring test webhook payload");
      return res.sendStatus(200);
    }

    console.log("Incoming message:", JSON.stringify(message, null, 2));

    switch (message.type) {
      case "text":
        await handleTextMessage(message);
        break;

      case "document":
        await handleDocumentMessage(message);
        break;

      case "image":
        await handleImageMessage(message);
        break;

      default:
        await sendWhatsAppText(
          message.from,
          "Unsupported message type. Please send a report document or image."
        );
        break;
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error(
      "Webhook error:",
      error.response?.data || error.message || error
    );
    return res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
