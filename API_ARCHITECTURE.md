# API Architecture & Data Processing Flow

## Overview
The application now supports multiple ways to process field reports and convert unstructured text into structured field data. This eliminates the direct frontend API key exposure issue and provides flexibility in data processing.

## Processing Methods

### 1. **File Upload + Text Extraction + Gemini Structuring**
**Path:** RunAgents.tsx → `handleProcessFiles()` → `processFilesWithGemini()`

**Flow:**
```
Upload Files (PDF/TXT/CSV/JSON)
    ↓
Extract Text from Files (Backend Feature)
    ↓
Combine Extracted Text
    ↓
Send to Gemini API (Text Only)
    ↓
Receive Structured Report
    ↓
Display & Download
```

**Functions Involved:**
- `extractTextFromFiles()` - Handles text extraction from multiple file types
- `structureTextWithGemini()` - Sends extracted text to Gemini for structuring
- `processFilesWithGemini()` - Orchestrates the entire flow

### 2. **Raw Text Input + Direct Gemini Structuring**
**Path:** RunAgents.tsx → `handleStructureRawText()` → `processRawTextWithGemini()`

**Flow:**
```
Paste/Input Raw Text
    ↓
Send to Gemini API
    ↓
Receive Structured Report
    ↓
Update Text Area
    ↓
Ready for Agent Processing
```

**Functions Involved:**
- `processRawTextWithGemini()` - Direct text-to-structure conversion

### 3. **Direct Agent Processing**
**Path:** RunAgents.tsx → `handleRunWithInput()` → `runOrchestrator()`

**Flow:**
```
Structured Field Report (from method 1 or 2)
    ↓
Parse Issues
    ↓
Score & Prioritize
    ↓
Gap Detection
    ↓
Volunteer Matching
    ↓
Generate Action Plan
    ↓
Save to Database
```

## Architecture Benefits

### Security
- **No Frontend API Keys in Requests**: Text extraction happens locally (PDF.js), but Gemini API calls can be moved to backend later
- **Separation of Concerns**: Text extraction is separate from Gemini processing
- **Fallback Support**: If Gemini fails, app falls back to locally-generated structured reports

### Flexibility
- **Multiple Input Methods**: Files, text input, or raw paste
- **Modular Functions**: Each step is independently callable
- **Custom Workflows**: Easy to insert additional processing steps

### Performance
- **Client-Side Text Extraction**: PDF parsing happens in browser (fast)
- **Optimized API Calls**: Only structured text sent to Gemini (smaller payloads)
- **Progress Feedback**: Real-time status updates during processing

## File Structure

### Services
- **`frontend/src/services/geminiService.ts`** - Core text processing logic
  - `extractTextFromPDF()` - PDF to text conversion
  - `readFileAsText()` - Universal file reader
  - `extractTextFromFiles()` - Batch file extraction
  - `structureTextWithGemini()` - Gemini API integration
  - `processRawTextWithGemini()` - Direct text processing
  - `processFilesWithGemini()` - Full file processing pipeline

### Pages
- **`src/pages/RunAgents.tsx`** - Main UI for processing and orchestration
  - File upload section with progress tracking
  - Raw text input with structure button
  - Agent pipeline visualization
  - Results console and action plan generation

## Configuration

### Environment Variables
```env
VITE_SUPABASE_PROJECT_ID=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_URL=...
VITE_GEMINI_API_KEY=...
VITE_BACKEND_API_URL=... (optional, for future backend integration)
```

## Error Handling

### Graceful Degradation
- If Gemini API fails, falls back to locally-generated structured report template
- File extraction failures show clear error messages
- Network errors caught and reported to user

### Progress Reporting
- Real-time status messages during processing
- Error messages include specific details
- Success confirmations after each step

## Future Enhancements

### Backend Integration (Optional)
```javascript
// Can be moved to Supabase Edge Function
POST /functions/v1/structure-text
{
  "text": "extracted text...",
  "fileNames": ["report1.pdf"]
}
```

### Additional Processors
- OCR for scanned documents
- Language detection and translation
- Custom sector/issue classification
- Real-time report streaming

## Usage Examples

### Example 1: Upload PDF Report
```typescript
1. Click file upload
2. Select report.pdf
3. Click "Process Files with Gemini"
4. System extracts text and structures it
5. Review and click "Run Agents"
```

### Example 2: Paste Manual Report
```typescript
1. Paste field notes into textarea
2. Click "Structure with Gemini"
3. Raw text gets converted to structured format
4. Review and click "Run Agents"
```

### Example 3: Direct Agent Processing
```typescript
1. Paste already-structured report (FIELD REPORT SUMMARY format)
2. Click "Run Agents"
3. System processes issues through full pipeline
```
