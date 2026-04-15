import { toast } from "sonner";
import * as pdfjsLib from 'pdfjs-dist';

// Use backend for API calls - fallback to frontend API key if needed
const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || "";
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1/models";

// Lazy initialize PDF.js worker
let workerInitialized = false;
function initializePDFWorker() {
  if (workerInitialized) return;
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url,
    ).href;
    workerInitialized = true;
  } catch (error) {
    console.warn('Failed to initialize PDF worker:', error);
  }
}

export interface FileUploadResult {
  success: boolean;
  content: string;
  fileName: string;
  error?: string;
}

export interface ProcessedOutput {
  originalFiles: string[];
  processedText: string;
  summary: string;
}

/**
 * Extract text from PDF file
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    initializePDFWorker();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }

    return fullText.trim();
  } catch (error) {
    throw new Error(`PDF extraction error: ${(error as Error).message}`);
  }
}

/**
 * Read file content as text (handles both text and PDF files)
 */
export async function readFileAsText(file: File): Promise<string> {
  // Handle PDF files
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    try {
      return await extractTextFromPDF(file);
    } catch (error) {
      throw new Error(`Failed to extract PDF text: ${(error as Error).message}`);
    }
  }

  // Handle text and other files
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      resolve(typeof content === 'string' ? content : String(content ?? ''));
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Extract text from multiple files (backend feature)
 * Handles both PDF and text files
 */
export async function extractTextFromFiles(
  files: File[],
  onProgress?: (message: string) => void
): Promise<{ name: string; content: string }[]> {
  if (files.length === 0) {
    throw new Error("No files provided");
  }

  const fileContents: { name: string; content: string }[] = [];

  for (const file of files) {
    onProgress?.(`Extracting text from: ${file.name}`);
    try {
      let content = "";

      // Backend-first extraction (if configured), then local fallback.
      if (BACKEND_API_URL) {
        try {
          onProgress?.(`Calling backend extractor for: ${file.name}`);
          const formData = new FormData();
          formData.append("file", file);

          const response = await fetch(`${BACKEND_API_URL}/extract-text`, {
            method: "POST",
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();
            content = (data?.text || "").toString();
          }
        } catch (backendError) {
          console.warn(`Backend extraction failed for ${file.name}, falling back to local extractor`, backendError);
        }
      }

      if (!String(content ?? '').trim()) {
        onProgress?.(`Using local extractor for: ${file.name}`);
        content = String(await readFileAsText(file) ?? '');
      }

      fileContents.push({
        name: file.name,
        content,
      });
    } catch (e) {
      throw new Error(`Failed to read file ${file.name}: ${(e as Error).message}`);
    }
  }

  return fileContents;
}

/**
 * Process extracted text with Gemini API
 * Converts unstructured text into structured field report
 */
export async function structureTextWithGemini(
  extractedText: string,
  fileNames: string[],
  onProgress?: (message: string) => void
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured. Please add VITE_GEMINI_API_KEY to .env");
  }

  const prompt = `You are an expert field report analyzer for NGO coordination. Your task is to process unstructured field reports and extract actionable intelligence ready for volunteer assignment.

INSTRUCTIONS:
1. Read and extract ALL field reports from the provided text
2. Identify and list each distinct issue/problem (one per line)
3. For each issue, determine: sector, location, affected people count
4. Format as a clean field report that agents can parse and process
5. Prioritize critical issues (health, water, shelter, safety)
6. Include any stakeholder information, resource requests, or constraints

OUTPUT FORMAT (CRITICAL - must follow exactly):
Start with a brief overview, then list issues in this format:

FIELD REPORT SUMMARY:
[2-3 sentence executive summary]

CRITICAL ISSUES:
[List most urgent issues with sector and location]

ALL REPORTED ISSUES:
1. [Issue summary]. Location: [place]. Sector: [water/healthcare/education/shelter/safety/sanitation/food/logistics/other]. Affected: [number] people.
2. [Issue summary]. Location: [place]. Sector: [sector]. Affected: [number] people.
[Continue for all issues]

RESOURCE GAPS:
[List any mentioned gaps, skills needed, or constraints]

FILES PROCESSED:
${fileNames.join(", ")}

---

EXTRACTED TEXT TO PROCESS:
${extractedText}

STRUCTURED FIELD REPORT:`;

  onProgress?.("Sending extracted text to Gemini for structuring...");

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    console.log("Gemini API Request:", {
      url: url.replace(GEMINI_API_KEY, "***REDACTED***"),
      timestamp: new Date().toISOString(),
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    console.log("Gemini API Response Status:", response.status, response.statusText);

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: { message: response.statusText } };
      }
      
      console.error("Gemini API Error Response:", errorData);
      
      const errorMessage = errorData?.error?.message || response.statusText;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log("Gemini API Success Response received");
    
    const processedText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No content generated";

    onProgress?.("Structuring complete!");
    return processedText;
  } catch (e) {
    const errorMsg = (e as Error).message;
    console.error("Failed to structure text with Gemini:", errorMsg);
    throw new Error(`Gemini API failed: ${errorMsg}`);
  }
}

/**
 * Process multiple files with Gemini API
 * Extracts text first, then structures with Gemini
 */
export async function processFilesWithGemini(
  files: File[],
  onProgress?: (message: string) => void
): Promise<ProcessedOutput> {
  if (files.length === 0) {
    throw new Error("No files provided");
  }

  try {
    // Step 1: Extract text from all files
    onProgress?.("Initializing file processing...");
    const fileContents = await extractTextFromFiles(files, onProgress);

    // Step 2: Combine extracted text
    const combinedText = fileContents
      .map((f, i) => `FILE ${i + 1}: ${f.name}\n---\n${f.content}`)
      .join("\n\n");

    // Step 3: Structure with Gemini
    const processedText = await structureTextWithGemini(
      combinedText,
      fileContents.map((f) => f.name),
      onProgress
    );

    return {
      originalFiles: fileContents.map((f) => f.name),
      processedText,
      summary: generateSummary(processedText),
    };
  } catch (e) {
    // Fallback: Extract and structure locally
    console.warn("Gemini processing failed, generating structured report locally:", e);

    try {
      const fileContents = await extractTextFromFiles(files, onProgress);
      const fallbackReport = generateFallbackReport(fileContents);

      return {
        originalFiles: fileContents.map((f) => f.name),
        processedText: fallbackReport,
        summary: generateSummary(fallbackReport),
      };
    } catch (fallbackError) {
      throw new Error(
        `Failed to process files: ${(fallbackError as Error).message}`
      );
    }
  }
}

/**
 * Generate fallback structured report when Gemini API fails
 * Returns empty template for user to fill in
 */
function generateFallbackReport(
  fileContents: { name: string; content: string }[]
): string {
  return `FIELD REPORT SUMMARY:
[Unable to process with Gemini API. Please structure the report manually using the extracted text below.]

CRITICAL ISSUES:
[Add critical issues here]

ALL REPORTED ISSUES:
[Add numbered issues with Location, Sector, and Affected count]

RESOURCE GAPS:
[Add resource gaps and skill requirements]

FILES PROCESSED:
${fileContents.map((f) => `- ${f.name}`).join("\n")}

---
EXTRACTED TEXT:
${fileContents.map((f, i) => `\n=== FILE ${i + 1}: ${f.name} ===\n${f.content}`).join("\n\n")}`;
}

/**
 * Generate a brief summary from processed text
 */
function generateSummary(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim());
  const summaryLines = lines.slice(0, 5).join(" ");
  return summaryLines.substring(0, 500) + (summaryLines.length > 500 ? "..." : "");
}

/**
 * Generate downloadable text file from processed output
 */
export function downloadAsTextFile(
  content: string,
  fileName: string = "processed-report"
): void {
  const element = document.createElement("a");
  const file = new Blob([content], { type: "text/plain" });
  element.href = URL.createObjectURL(file);
  element.download = `${fileName}-${new Date().getTime()}.txt`;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(element.href);
}

/**
 * Format processed output for display and download
 */
export function formatOutputForDownload(output: ProcessedOutput): string {
  const timestamp = new Date().toISOString();
  return `PROCESSED REPORT
Generated: ${timestamp}

SOURCE FILES:
${output.originalFiles.map((f) => `- ${f}`).join("\n")}

${output.processedText}`;
}

/**
 * Process raw text directly with Gemini
 * For manual text input (copy-paste from reports)
 */
export async function processRawTextWithGemini(
  rawText: string,
  onProgress?: (message: string) => void
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured. Please add VITE_GEMINI_API_KEY to .env");
  }

  const safeRawText = String(rawText ?? '').trim();

  if (!safeRawText) {
    throw new Error("No text provided");
  }

  const prompt = `You are an expert field report analyzer for NGO coordination. Your task is to process unstructured field reports and extract actionable intelligence ready for volunteer assignment.

INSTRUCTIONS:
1. Read and extract ALL issues from the provided text
2. Identify and list each distinct issue/problem (one per line)
3. For each issue, determine: sector, location, affected people count
4. Format as a clean field report that agents can parse and process
5. Prioritize critical issues (health, water, shelter, safety)
6. Include any stakeholder information, resource requests, or constraints

OUTPUT FORMAT (CRITICAL - must follow exactly):
FIELD REPORT SUMMARY:
[2-3 sentence executive summary]

CRITICAL ISSUES:
[List most urgent issues with sector and location]

ALL REPORTED ISSUES:
1. [Issue summary]. Location: [place]. Sector: [water/healthcare/education/shelter/safety/sanitation/food/logistics/other]. Affected: [number] people.
2. [Issue summary]. Location: [place]. Sector: [sector]. Affected: [number] people.
[Continue for all issues]

RESOURCE GAPS:
[List any mentioned gaps, skills needed, or constraints]

---

TEXT TO PROCESS:
${safeRawText}

STRUCTURED FIELD REPORT:`;

  onProgress?.("Sending text to Gemini for structuring...");

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    console.log("Gemini API Request:", {
      url: url.replace(GEMINI_API_KEY, "***REDACTED***"),
      timestamp: new Date().toISOString(),
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    console.log("Gemini API Response Status:", response.status, response.statusText);

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: { message: response.statusText } };
      }
      
      console.error("Gemini API Error Response:", errorData);
      
      const errorMessage = errorData?.error?.message || response.statusText;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log("Gemini API Success Response received");
    
    const processedText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No content generated";

    onProgress?.("Text structuring complete!");
    return processedText;
  } catch (e) {
    const errorMsg = (e as Error).message;
    console.error("Failed to structure text with Gemini:", errorMsg);
    throw new Error(`Gemini API failed: ${errorMsg}`);
  }
}

/**
 * Generate embedding for text using Gemini's text-embedding-004
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured.");
  }
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/text-embedding-004",
      content: { parts: [{ text }] },
    })
  });
  
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to generate embedding");
  }
  
  const data = await response.json();
  return data.embedding?.values || [];
}

/**
 * Ask Gemini what skills are best for a given issue
 */
export async function analyzeSkillsForIssue(issueSummary: string, sector: string): Promise<string> {
  if (!GEMINI_API_KEY) return "General Volunteer";
  
  const prompt = `Based on the following NGO issue, what are the top 3-5 specific skills a volunteer should possess to resolve this? Return ONLY the skills as a comma-separated list, nothing else.
Issue: ${issueSummary}
Sector: ${sector}
Skills needed:`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 50 },
    })
  });
  
  if (!response.ok) return "General Support, Relief, Manual Labor";
  
  const data = await response.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text || "General Support").trim();
}

/**
 * Chat with reports (RAG query)
 */
export async function chatWithRAGContext(query: string, contextChunks: string[]): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key not configured.");
  
  const prompt = `You are a helpful AI assistant analyzing NGO field reports. Use ONLY the provided context chunks to answer the user's query. If the answer is not contained in the context, say "I cannot find the answer in the provided reports."

Context from Reports:
${contextChunks.join("\n\n---\n\n")}

User Query: ${query}
Answer:`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    })
  });
  
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err?.error?.message || "Failed to generate RAG response");
  }
  
  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
}


/**
 * Generate embedding using the local Python backend
 */
export async function generateLocalEmbedding(text: string): Promise<number[]> {
  const endpoint = `${BACKEND_API_URL || ""}/api/embed`;
  console.log(`[EmbeddingService] Attempting local embedding at: ${endpoint}`);
  
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.warn(`[EmbeddingService] Local embedding failed (Status: ${response.status}). Falling back to Gemini.`);
      return generateEmbedding(text);
    }

    const data = await response.json();
    console.log(`[EmbeddingService] Local embedding successful (Vector dim: ${data.embedding?.length})`);
    return data.embedding || [];
  } catch (error) {
    console.error(`[EmbeddingService] Local embedding API error at ${endpoint}:`, error);
    return generateEmbedding(text);
  }
}
