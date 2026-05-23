# Processing Flow Diagrams

## Overview: 3 Input Methods → 1 Pipeline

```
┌──────────────────────────────────────────────────────────────────┐
│                       SAHAYAK PROCESSING                        │
└──────────────────────────────────────────────────────────────────┘

INPUT STAGE (3 Options)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    ┌─────────────┐
    │  PDF/TXT    │  METHOD 1: FILE UPLOAD
    │   FILES     │  ├─ Click upload button
    └──────┬──────┘  ├─ Select 1+ files
           │         ├─ Click "Process Files with Gemini"
           │         └─ Wait for structuring
           │
           ├─→ extractTextFromFiles() ──┐
           │   • PDF to text via PDF.js  │
           │   • Handle multiple files   │
           │   • Progress callbacks      │
           │                             │
           ├────────────────────────────┤
           │                             │
           │  ┌──────────────────┐      │
           │  │  RAW TEXT INPUT  │      │  METHOD 2: PASTE & STRUCTURE
           │  │  (Copy/Paste)    │      │  ├─ Paste report text
           │  └────────┬─────────┘      │  ├─ Click "Structure with Gemini"
           │           │                │  └─ Wait for structuring
           │           │                │
           │           └──────────────┐ │
           │                          │ │
           └──────────────────────────┼─┘
                                      │
                                      ↓

EXTRACTION & STRUCTURING STAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            ┌────────────────────────┐
            │  Extracted Raw Text    │
            │  (combined from files  │
            │   or pasted input)     │
            └────────────┬───────────┘
                         │
                         ↓
              structureTextWithGemini()
              • Send text to Gemini API
              • Parse response
              • Format as structured report
                         │
                         ↓
            ┌────────────────────────┐
            │  STRUCTURED REPORT:    │
            │  • FIELD REPORT SUMMARY│
            │  • CRITICAL ISSUES     │
            │  • ALL ISSUES (list)   │
            │  • RESOURCE GAPS       │
            └────────────┬───────────┘
                         │
                         ├─→ Display in textarea
                         ├─→ Download as file (optional)
                         └─→ Ready for agents
                         │
                         ↓

PROCESSING STAGE (3+ Method)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            METHOD 3: DIRECT AGENT PROCESSING
            ├─ Paste already-structured report
            ├─ Click "Run Agents"
            └─ Skip structuring step

            ┌────────────────────────┐
            │  AGENT ORCHESTRATOR    │
            └────────────┬───────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    ↓                    ↓                    ↓
INGESTION           EXTRACTION            SCORING
├─ Detect issues   ├─ Parse issues      ├─ Compute priority
├─ Count issues    ├─ Extract fields    ├─ Rank by severity
└─ Validate format └─ Organize data     └─ Category weights
    │                  │                    │
    └──────────────────┼────────────────────┘
                       │
                       ↓
                 GAP DETECTION
                 ├─ Identify skill gaps
                 ├─ Missing volunteers
                 └─ Resource needs
                       │
                       ↓
                    MATCHING
                    ├─ Score volunteers
                    ├─ Assign to issues
                    └─ Backup assignments
                       │
                       ↓
                  REALLOCATION (if needed)
                  ├─ Balance workload
                  ├─ Redistribute if overload
                  └─ Optimize coverage
                       │
                       ↓
            ┌────────────────────────┐
            │   ACTION PLAN REPORT   │
            │  • Assignments         │
            │  • Timeline            │
            │  • Volunteer matches   │
            │  • Coverage gaps       │
            └────────────┬───────────┘
                         │
                         ↓
                ┌─────────────────┐
                │  SAVE TO        │
                │  SUPABASE DB    │
                │  • Issues       │
                │  • Assignments  │
                │  • Action Plan  │
                └─────────────────┘
```

---

## Detailed: Method 1 - File Processing

```
┌─────────────────────────────────────────────────────┐
│ User Interaction                                    │
├─────────────────────────────────────────────────────┤

1. UPLOAD
   User: Click file input
       ↓
   Select: report.pdf, report2.txt
       ↓
   State: uploadedFiles = [File, File]

2. PROCESS
   User: Click "Process Files with Gemini"
       ↓
   Frontend: setProcessingFiles(true)
       ↓
   Progress: "Initializing..."

└──────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ System Processing (processFilesWithGemini)          │
├─────────────────────────────────────────────────────┤

Step 1: EXTRACTION
────────────────
for each file:
  Progress: "Reading file: report.pdf"
    ↓
  if PDF: extractTextFromPDF(file)
    • Use PDF.js worker
    • Parse page by page
    • Concatenate text
  else: readFileAsText(file)
    • Use FileReader API
    • Return raw text
    ↓
  Result: { name: "report.pdf", content: "..." }

Step 2: COMBINATION
─────────────────
Combined = 
  "FILE 1: report.pdf\n---\n[content1]\n\n
   FILE 2: report2.txt\n---\n[content2]"

Step 3: STRUCTURING
──────────────────
Progress: "Sending extracted text to Gemini..."
    ↓
structureTextWithGemini(combinedText)
    ↓
fetch(generativelanguage.googleapis.com)
  method: POST
  body: {
    contents: [
      { parts: [{ text: combinedText }] }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    }
  }
    ↓
Response: {
  candidates: [{
    content: {
      parts: [{
        text: "FIELD REPORT SUMMARY:\n..."
      }]
    }
  }]
}

Step 4: FORMATTING
──────────────────
processedText = response.content.parts[0].text
    ↓
generateSummary(processedText)
    ↓
Return ProcessedOutput {
  originalFiles: ["report.pdf", "report2.txt"],
  processedText: "FIELD REPORT SUMMARY:\n...",
  summary: "Brief summary of report..."
}

└──────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Frontend Update                                     │
├─────────────────────────────────────────────────────┤

setProcessedOutput(output)
setRawInput(output.processedText)
toast.success("Successfully processed 2 file(s)")

State updated, UI shows:
├─ Textarea with structured report
├─ Summary visible
└─ Download button enabled

User can now:
├─ Review the structured report
├─ Download as text file
└─ Click "Run Agents" to process

└──────────────────────────────────────────────────────┘
```

---

## Detailed: Method 2 - Text Structuring

```
┌─────────────────────────────────────────────────────┐
│ User Interaction                                    │
├─────────────────────────────────────────────────────┤

User: 
1. Paste raw field notes into textarea
   "Water problem affecting 200 families...
    School damaged, 150 children...
    Need urgently..."

2. Click "Structure with Gemini" button
   ↓
   Button disabled = false
   
└──────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ System Processing (processRawTextWithGemini)        │
├─────────────────────────────────────────────────────┤

Step 1: VALIDATION
──────────────────
if (!rawText.trim()) throw Error(...)
    ↓ OK

Step 2: GEMINI CALL
───────────────────
Progress: "Sending text to Gemini for structuring..."
    ↓
Prompt = "You are an expert field report analyzer..."
         + rawText
         + "STRUCTURED FIELD REPORT:"
    ↓
fetch(generativelanguage.googleapis.com)
  method: POST
  body: {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { ... }
  }

Step 3: RESPONSE PARSING
────────────────────────
if response.ok:
  structuredText = response.candidates[0].content.parts[0].text
    ↓
  Progress: "Text structuring complete!"
else:
  Error handling (see fallback section)

└──────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Frontend Update                                     │
├─────────────────────────────────────────────────────┤

setRawInput(structuredText)
setStructuringText(false)
toast.success("Text successfully structured...")

UI Updates:
├─ Textarea shows structured report
├─ Ready for "Run Agents"
└─ Button state normalized

└──────────────────────────────────────────────────────┘
```

---

## Error Handling: Fallback Flow

```
┌─────────────────────────────────────────────────────┐
│ If Gemini API Fails                                 │
├─────────────────────────────────────────────────────┤

try {
  const result = await geminiCall()
} catch (e) {
  console.warn("Gemini failed:", e)
    ↓
  // FALLBACK FLOW
  const fileContents = await extractTextFromFiles(files)
    ↓
  const fallback = generateFallbackReport(fileContents)
    ↓
  return {
    originalFiles: [...],
    processedText: fallback,  // ← Local report
    summary: "..."
  }
}

User sees:
├─ Report appears in textarea anyway
├─ Toast: "File processing failed: [error]"
└─ Can still review and run agents

Benefits:
✅ App doesn't crash
✅ User isn't completely stuck
✅ Can retry later
✅ Fallback has decent structure

└──────────────────────────────────────────────────────┘
```

---

## Data Format: Structured Report

```
Input (Unstructured):
════════════════════
"Water crisis in the village. 200 families no clean water.
Well is broken. Clinic also affected.
School was damaged in storm. 150 kids can't attend.
We need volunteers urgently!"

                           ↓↓↓
                    GEMINI PROCESSING
                           ↓↓↓

Output (Structured):
════════════════════
FIELD REPORT SUMMARY:
This report documents critical water and education infrastructure
failures. 200 families lack clean water, and 150 children are out
of school. Urgent intervention needed.

CRITICAL ISSUES:
1. Water supply failure - 200 families affected
2. School infrastructure damage - 150 children out of school

ALL REPORTED ISSUES:
1. Well collapse and water shortage. Location: Village. Sector: water. 
   Affected: 200 people.
2. School structure damage from storm. Location: Village. Sector: education. 
   Affected: 150 people.
3. Clinic water shortage. Location: Village. Sector: healthcare. 
   Affected: 1200 people.

RESOURCE GAPS:
- 1-2 water engineers for infrastructure repair
- Construction workers for school rebuild
- Healthcare support for clinic water restoration

                           ↓↓↓
                    AGENT PROCESSING
                           ↓↓↓

Output (Action Plan):
═════════════════════
[Issues parsed into database]
[Volunteers scored for matching]
[Assignments made]
[Action plan generated]
[Report saved to Supabase]
```

---

## Function Call Graph

```
USER INTERACTION
      ↓
      ├─→ File Upload
      │   └─→ handleProcessFiles()
      │       └─→ processFilesWithGemini()
      │           ├─→ extractTextFromFiles()
      │           │   ├─→ readFileAsText()
      │           │   └─→ extractTextFromPDF() [if PDF]
      │           └─→ structureTextWithGemini()
      │               └─→ fetch(Gemini API)
      │
      ├─→ Text Input
      │   └─→ handleStructureRawText()
      │       └─→ processRawTextWithGemini()
      │           └─→ fetch(Gemini API)
      │
      └─→ Run Agents
          └─→ handleRunWithInput()
              └─→ runOrchestrator()
                  ├─→ Ingestion
                  ├─→ Extraction
                  ├─→ Scoring
                  ├─→ Gap Detection
                  ├─→ Matching
                  ├─→ Reallocation
                  └─→ Report Generation
```

---

## Architecture Timeline

```
BEFORE (Monolithic)
═══════════════════
User Input → processFilesWithGemini() → Structured Output
           (all logic in one function, hard to maintain)


AFTER (Modular)
═══════════════
User Input 
    ├─ Files → extractTextFromFiles() → Raw Text
    │                                      ↓
    │                                 structureTextWithGemini() 
    │                                      ↓
    └─ Raw Text ─────────────────────→ Structured Output
                                           ↓
                                    runOrchestrator()
                                           ↓
                                     Action Plan

Benefits:
✅ Each function single responsibility
✅ Easy to test independently
✅ Easy to mock or replace
✅ Ready for backend migration
✅ Supports multiple input methods
```

---

## State Machine (RunAgents Component)

```
IDLE
├─ rawInput: ""
├─ running: false
├─ processingFiles: false
├─ structuringText: false
└─ agentState: null

        ↓ User uploads files

FILE_UPLOADING
├─ uploadedFiles: [File1, File2]
├─ processingFiles: false
└─ processingProgress: ""

        ↓ Click "Process Files with Gemini"

PROCESSING_FILES
├─ processingFiles: true
├─ processingProgress: "Reading file: report.pdf"
└─ → (streaming progress updates)

        ↓ Processing complete

FILE_PROCESSED
├─ processingFiles: false
├─ processedOutput: { ... }
├─ rawInput: "FIELD REPORT SUMMARY: ..."
└─ processingProgress: ""

        ├─ OR ↓ User pastes text

TEXT_ENTERED
├─ rawInput: "some text..."
└─ structuringText: false

        ↓ Click "Structure with Gemini"

STRUCTURING_TEXT
├─ structuringText: true
├─ processingProgress: "Sending text to Gemini..."
└─ → (streaming progress)

        ↓ Structuring complete

TEXT_STRUCTURED
├─ structuringText: false
├─ rawInput: "FIELD REPORT SUMMARY: ..."
└─ processingProgress: ""

        ├─ OR ↓ Click "Run Agents"

RUNNING_AGENTS
├─ running: true
├─ agentState: { currentStep: "ingestion", ... }
└─ → (streaming agent logs)

        ↓ All steps complete

AGENTS_COMPLETE
├─ running: false
├─ agentState: { isComplete: true, ... }
└─ User can review results
```

---

That covers the complete processing flow visually! 🎯
