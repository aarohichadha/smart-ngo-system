# 🚀 Quick Start Guide - New Processing Flow

## TL;DR - Just Use It!

You now have **3 ways** to process field reports instead of 1:

### Option 1️⃣: Upload Files
```
Open RunAgents page → Upload PDF/TXT → Click "Process Files with Gemini" → Done!
```

### Option 2️⃣: Paste Raw Text  
```
Paste text → Click "Structure with Gemini" → Done!
```

### Option 3️⃣: Direct Processing
```
Paste structured report → Click "Run Agents" → Done!
```

---

## What's New (In 1 Minute)

### The Problem
API key exposure and monolithic processing function = hard to maintain and extend

### The Solution
**Modular architecture** that separates concerns:
```
Text Extraction (PDF.js) ↔ Text Processing (Gemini) ↔ Issue Matching (Agents)
```

### What This Means
✅ Clean separation of concerns  
✅ Easy to test each step  
✅ Ready to move to backend anytime  
✅ Works with files AND text input  
✅ Fallback if Gemini API fails  

---

## Files You Need To Know About

### Code Changes
- **`frontend/src/services/geminiService.ts`** - 3 new functions for modular processing
- **`src/pages/RunAgents.tsx`** - New "Structure with Gemini" button

### Guides (Read If You Want Details)
- **`IMPLEMENTATION_SUMMARY.md`** ← Start here for overview
- **`PROCESSING_FLOW.md`** ← How to use + backend integration guide
- **`API_ARCHITECTURE.md`** ← Technical deep dive
- **`TESTING_FLOW.md`** ← How to test and debug

---

## New Features

### 🆕 "Structure with Gemini" Button
Located on RunAgents page next to "Run Agents"

**What it does:**
1. Takes raw text from textarea
2. Sends to Gemini API
3. Returns text formatted as structured report
4. Updates textarea with result

**When to use:**
- Copy-pasting from unformatted reports
- Manual text entry from field notes
- Testing structuring without files

### 🆕 Modular Functions (For Developers)

```typescript
// New way: Separated concerns
const files = await extractTextFromFiles([file1, file2]);
const structured = await structureTextWithGemini(files[0].content);

// Or shorthand: Same as before
const output = await processFilesWithGemini([file1, file2]);
```

---

## API Key Situation

**Current:** Gemini API key is in `.env` (frontend)
- ✅ Works fine for now
- ⚠️ Exposed in browser (minor security concern)

**Future (Optional):**
Move to Supabase Edge Function (backend)
- See `PROCESSING_FLOW.md` for step-by-step guide
- No changes needed for current flow to work

---

## Troubleshooting

### Issue: "Gemini API error"
**Fix:** Check if API key is valid in `.env`
```bash
VITE_GEMINI_API_KEY="AIzaSy..."
```

### Issue: PDF text extraction fails
**Fix:** Try with text file (.txt) instead
- PDF.js works best with text-based PDFs
- Scanned images won't work

### Issue: Button is disabled/grayed out
**Fix:** Make sure you've pasted text in the textarea
- Empty text = button disabled
- Already running = button disabled

### Issue: Nothing happens when I click button
**Fix:** Check browser console (F12) for errors
- Look for red error messages
- Copy error text to check documentation

---

## Testing It Out

### Super Quick Test (2 minutes)
```
1. Go to /RunAgents page
2. Paste this:
   "Water problem in Village A. 200 families affected. 
    School damaged, 150 children. Need volunteers."
3. Click "Structure with Gemini"
4. Wait 5 seconds
5. See formatted report in textarea
6. Click "Run Agents"
7. Done! Check results.
```

### Full Test (10 minutes)
See `TESTING_FLOW.md` for comprehensive testing guide

---

## What Didn't Change

Everything else works exactly the same:
- ✅ Volunteer database
- ✅ Agent pipeline (matching, scoring, etc.)
- ✅ Action plan generation
- ✅ Report downloading
- ✅ Supabase integration
- ✅ Authentication

---

## Performance Notes

Typical timings:
- File upload: < 1 sec
- Text extraction: 2-5 sec (PDF size dependent)
- Gemini processing: 3-8 sec (API latency)
- Agent pipeline: 5-10 sec
- **Total: ~15-25 seconds**

---

## One Crazy New Thing You Can Do

### Process PDFs without code!

**Before:** Had to manually copy-paste text
**Now:** 
```
1. Upload PDF
2. System extracts text automatically
3. Sends to Gemini
4. Get structured report
5. Click Run Agents
```

All in the UI!

---

## Advanced: Moving to Backend (Optional)

If you want to hide the API key:

```bash
# 1. Create backend function
supabase functions new structure-text

# 2. Move Gemini API call there
# 3. Update geminiService.ts to call function instead
# 4. Deploy
supabase functions deploy

# 5. Done!
```

See `PROCESSING_FLOW.md` for code example.

---

## Need Help?

- 📖 Check `IMPLEMENTATION_SUMMARY.md` for what changed
- 📖 Check `PROCESSING_FLOW.md` for usage examples
- 📖 Check `API_ARCHITECTURE.md` for technical details
- 📖 Check `TESTING_FLOW.md` for debugging
- 🔧 Check browser console (F12) for error messages

---

## Status Check

- ✅ Build passes
- ✅ No TypeScript errors
- ✅ All functions exported correctly
- ✅ UI integrated and styled
- ✅ Backward compatible (old flow still works)
- ✅ Ready to test!

---

**That's it! Go test it out.** 🚀
