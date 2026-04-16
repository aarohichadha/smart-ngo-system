import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, MessageSquare, Send, FileText, Upload, RefreshCw, X, Plus, Database, Trash2, Brain, Users, TrendingUp, ShieldCheck, AlertTriangle, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
}

interface Prediction {
  title: string;
  description: string;
  sector: string;
  urgency: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  timeframe: string;
}

interface VolunteerBrief {
  name: string;
  skills: string[];
  zone: string;
  reason: string;
}

interface Assignment {
  issue_summary: string;
  sector: string;
  location: string;
  urgency_score: number;
  primary_volunteer: VolunteerBrief | null;
  backup_volunteers: VolunteerBrief[];
}

interface SmartAnalysis {
  predictions: Prediction[];
  assignments: Assignment[];
  summary: string;
}

interface ChatbotSyncedReport {
  id: string;
  report_title: string;
  report_summary: string;
  report_count: number;
  knowledge_chunks: number;
  report_data: Array<{
    id?: string;
    issue_summary?: string | null;
    sector?: string | null;
    location?: string | null;
    affected_count?: number | null;
    urgency_score?: number | null;
    status?: string | null;
    created_at?: string | null;
  }>;
  created_at: string;
}

interface KnowledgeBaseDocument {
  source: string;
  chunks: number;
  preview: string;
  kind: "uploaded" | "synced";
}

const BACKEND_URL = import.meta.env.VITE_NODE_BACKEND_URL || "http://localhost:3000/api";

export function ReportChatbot() {
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [activeTab, setActiveTab] = useState<"chat" | "analysis">("chat");
  
  // Smart Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<SmartAnalysis | null>(null);
  const [isKnowledgeBaseOpen, setIsKnowledgeBaseOpen] = useState(false);
  const [showSavedSyncReports, setShowSavedSyncReports] = useState(false);
  const [isLoadingSavedSyncReports, setIsLoadingSavedSyncReports] = useState(false);
  const [savedSyncReports, setSavedSyncReports] = useState<ChatbotSyncedReport[]>([]);
  const [showUploadedReports, setShowUploadedReports] = useState(false);
  const [uploadedReports, setUploadedReports] = useState<KnowledgeBaseDocument[]>([]);
  const [isLoadingUploadedReports, setIsLoadingUploadedReports] = useState(false);
  const [selectedSyncReport, setSelectedSyncReport] = useState<ChatbotSyncedReport | null>(null);
  const [selectedUploadedReport, setSelectedUploadedReport] = useState<KnowledgeBaseDocument | null>(null);
  
  // Chat History State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [knowledgeBaseCount, setKnowledgeBaseCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadSavedSyncReports = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be logged in to view saved reports.");

    setIsLoadingSavedSyncReports(true);
    try {
      const { data, error } = await supabase
        .from("chatbot_synced_reports")
        .select("*")
        .eq("ngo_user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSavedSyncReports((data || []) as ChatbotSyncedReport[]);
    } finally {
      setIsLoadingSavedSyncReports(false);
    }
  };

  const loadUploadedReports = async () => {
    setIsLoadingUploadedReports(true);
    try {
      const res = await fetch(`${BACKEND_URL}/documents`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to load uploaded reports.");
      }

      const data = await res.json();
      const docs = Array.isArray(data.documents) ? data.documents : [];
      const onlyUploaded = docs.filter((item: KnowledgeBaseDocument) => item.kind === "uploaded");
      setUploadedReports(onlyUploaded);
    } finally {
      setIsLoadingUploadedReports(false);
    }
  };

  const toggleSavedSyncReports = async () => {
    const nextValue = !showSavedSyncReports;
    setShowSavedSyncReports(nextValue);

    if (nextValue && savedSyncReports.length === 0) {
      try {
        await loadSavedSyncReports();
      } catch (error: any) {
        toast.error(`Unable to load saved reports: ${error.message}`);
      }
    }
  };

  useEffect(() => {
    // fetchSessions(); // BYPASSED FOR ONE-TIME SESSION
    
    // Fetch initial context block count from persistent ChromaDB
    const checkStats = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/stats`);
        if (res.ok) {
          const data = await res.json();
          setKnowledgeBaseCount(data.knowledgeBaseCount || 0);
        }
      } catch (err) {
        console.error("Failed to fetch initial stats:", err);
      }
    };
    checkStats();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // When active session changes, load its messages
  useEffect(() => {
    // if (activeSessionId) {
    //   fetchMessages(activeSessionId);
    // } else {
    //   setMessages([{ role: "assistant", content: "Hello! Select a chat from the sidebar or start a new one." }]);
    // }
    if (messages.length === 0) {
      setMessages([{ role: "assistant", content: "Hello! Upload your reports or sync your historical NGO data to begin asking questions." }]);
    }
  }, [activeSessionId]);

  /* --- Supabase History Management --- */
  const fetchSessions = async () => {
    /* BYPASSED FOR ONE-TIME SESSION
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('rag_chat_sessions')
      .select('*')
      .eq('ngo_user_id', user.id)
      .order('created_at', { ascending: false });
      
    if (data) setSessions(data);
    */
  };

  const fetchMessages = async (sessionId: string) => {
    /* BYPASSED FOR ONE-TIME SESSION
    const { data, error } = await supabase
      .from('rag_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
      
    if (data && data.length > 0) {
      setMessages(data.map(m => ({ role: m.role as "user" | "assistant", content: m.content })));
    } else {
      setMessages([{ role: "assistant", content: "Hello! How can I help you analyze your NGO data today?" }]);
    }
    */
  };

  const createNewSession = async (firstQuery: string): Promise<string> => {
    /* BYPASSED FOR ONE-TIME SESSION
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in");
    
    const title = firstQuery.split(' ').slice(0, 4).join(' ') + (firstQuery.split(' ').length > 4 ? '...' : '');
    
    // We expect an error if the SQL wasn't run, so handle gracefully.
    const { data, error } = await supabase
      .from('rag_chat_sessions')
      .insert({ ngo_user_id: user.id, title })
      .select()
      .single();
      
    if (error) {
        console.error("DB Error:", error);
        throw new Error("Unable to create session. Ensure you ran the SQL script.");
    }
    
    setSessions([data, ...sessions]);
    setActiveSessionId(data.id);
    return data.id;
    */
    return "local-session";
  };

  const saveMessageToSession = async (sessionId: string, role: string, content: string) => {
    // BYPASSED FOR ONE-TIME SESSION
    // await supabase.from('rag_chat_messages').insert({ session_id: sessionId, role, content });
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    /* BYPASSED FOR ONE-TIME SESSION
    e.stopPropagation();
    const { error } = await supabase.from('rag_chat_sessions').delete().eq('id', id);
    if (!error) {
      setSessions(sessions.filter(s => s.id !== id));
      if (activeSessionId === id) setActiveSessionId(null);
      toast.success("Chat deleted.");
    }
    */
  };

  /* --- RAG Backend Uploads & Chat --- */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedFiles((prev) => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProcessFiles = async () => {
    if (uploadedFiles.length === 0) return;
    setIsProcessingFiles(true);

    try {
      let chunksAdded = 0;
      for (const file of uploadedFiles) {
        toast.info(`Uploading ${file.name}...`);
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`${BACKEND_URL}/upload`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
           const errData = await res.json();
           throw new Error(errData.error || `Failed to process ${file.name}`);
        }
        const data = await res.json();
        const match = data.message.match(/Added (\d+) chunks/);
        if (match) {
            chunksAdded += parseInt(match[1]);
        }
      }
      
      setKnowledgeBaseCount(prev => prev + chunksAdded);
      toast.success(`Successfully uploaded documents. Added ${chunksAdded} context blocks.`);
      setUploadedFiles([]);
    } catch (err: any) {
      toast.error(`Error processing reports: ${err.message}`);
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const handleSyncHistory = async () => {
    setIsSyncing(true);
    toast.info("Syncing historical records from Supabase...");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be logged in to sync history.");

      const res = await fetch(`${BACKEND_URL}/sync-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ngo_user_id: user.id }),
      });

      if (!res.ok) {
         const errData = await res.json();
         throw new Error(errData.error || "Failed to sync history.");
      }
      
      const data = await res.json();
      
      const match = data.message.match(/as (\d+) context chunks/);
      if (match) {
          setKnowledgeBaseCount(prev => prev + parseInt(match[1]));
      }

      toast.success(data.message);
      await loadSavedSyncReports();
    } catch (err: any) {
      toast.error(`History Sync Error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!query.trim()) return;
    
    // Attempting query
    const content = query.trim();
    setQuery("");
    
    let currentSessionId = activeSessionId;

    try {
      if (!currentSessionId) {
         // Generate a new session if we aren't in one
         currentSessionId = await createNewSession(content);
      }
      
      const userMessage = { role: "user" as const, content };
      setMessages((prev) => [...prev, userMessage]);
      setIsSending(true);
      
      // Background save user query
      saveMessageToSession(currentSessionId, 'user', content);

      // Hit Flask Backend
      const res = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: content }),
      });

      if (!res.ok) {
         const errData = await res.json();
         throw new Error(errData.error || "Failed to get response");
      }
      
      const data = await res.json();
      
      const assistantMessage = { role: "assistant" as const, content: data.response };
      setMessages((prev) => [...prev, assistantMessage]);
      
      // Background save AI reply
      saveMessageToSession(currentSessionId, 'assistant', data.response);

    } catch (err: any) {
      toast.error(`Error: ${err.message}.`);
      // Revert if it completely fails
      setIsSending(false);
    } finally {
      setIsSending(false);
    }
  };

  const handleSmartAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysis(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Must be logged in");
      const res = await fetch(`${BACKEND_URL}/smart-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ngo_user_id: user.id }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Analysis failed");
      }
      const data = await res.json();
      setAnalysis(data.analysis);
      toast.success("Smart analysis complete!");
    } catch (err: any) {
      toast.error(`Analysis error: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const urgencyColor = (u: string) => {
    if (u === "high") return "bg-red-100 text-red-700 border-red-200";
    if (u === "medium") return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-green-100 text-green-700 border-green-200";
  };

  return (
    <div className="flex h-[calc(100vh-100px)] gap-4 border border-border rounded-xl bg-background overflow-hidden relative">
      
      {/* Left Sidebar: ChatGPT Style History */}
      <div className="w-72 border-r border-border bg-muted/20 flex flex-col sm:w-1/4">
        <div className="p-4 border-b border-border">
          <Button 
            className="w-full gap-2 justify-start shadow-sm hover:shadow" 
            variant="default"
            onClick={() => setActiveSessionId(null)}
          >
            <Plus className="w-4 h-4" />
            New Insight Chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center p-4">No past chats found.</p>
          ) : (
            sessions.map((session) => (
              <div 
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={`group flex items-center justify-between p-2.5 rounded-lg cursor-pointer text-sm transition-all ${
                  activeSessionId === session.id 
                    ? 'bg-primary/10 text-primary font-medium' 
                    : 'hover:bg-muted text-foreground/80'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-70" />
                  <span className="truncate">{session.title}</span>
                </div>
                <button 
                  onClick={(e) => deleteSession(e, session.id)} 
                  className="opacity-0 group-hover:opacity-100 hover:text-destructive flex-shrink-0 transition-opacity p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Floating Database Sync Drawer Triggered by Modal */}
        <div className="p-4 border-t border-border bg-card">
           <Dialog
             open={isKnowledgeBaseOpen}
             onOpenChange={(open) => {
               setIsKnowledgeBaseOpen(open);
               if (open) {
                 void loadSavedSyncReports().catch((error: any) => {
                   toast.error(`Unable to load saved reports: ${error.message}`);
                 });
                void loadUploadedReports().catch((error: any) => {
                  toast.error(`Unable to load uploaded reports: ${error.message}`);
                });
               }
             }}
           >
             <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2 h-10 border-primary/20 hover:bg-primary/5 text-primary">
                  <Database className="w-4 h-4" />
                  Manage Knowledge Base
                </Button>
             </DialogTrigger>
             <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Knowledge Base Manager</DialogTitle>
                  <DialogDescription>
                    Add new information to the chatbot's memory. This is persistent across all chats.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 pt-4">
                  {/* Sync Card */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Internal Database</h4>
                    <Button
                      onClick={handleSyncHistory}
                      disabled={isSyncing}
                      variant="secondary"
                      className="w-full gap-2 border border-border"
                    >
                      {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-blue-500" />}
                      {isSyncing ? "Fetching..." : "Fetch Latest NGO Reports from Supabase"}
                    </Button>
                  </div>

                  {/* Saved Syncs Card */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-medium">Saved Report Snapshots</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-2"
                        onClick={() => { void loadSavedSyncReports().catch((error: any) => toast.error(`Unable to load saved reports: ${error.message}`)); }}
                        disabled={isLoadingSavedSyncReports}
                      >
                        {isLoadingSavedSyncReports ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Refresh
                      </Button>
                    </div>

                    <Button
                      onClick={toggleSavedSyncReports}
                      variant="outline"
                      className="w-full justify-between gap-2 border border-border"
                    >
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-500" />
                        {showSavedSyncReports ? "Hide Saved Reports" : "View Saved Reports"}
                      </span>
                      <Badge variant="secondary">{savedSyncReports.length}</Badge>
                    </Button>

                    {showSavedSyncReports && (
                      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3 max-h-64 overflow-y-auto">
                        {savedSyncReports.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">No saved sync snapshots yet.</p>
                        ) : (
                          savedSyncReports.map((report) => (
                            <div key={report.id} className="rounded-md border border-border bg-background p-3 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium text-foreground">{report.report_title}</p>
                                  <p className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString()}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{report.report_count} issues</Badge>
                                  <Button size="sm" variant="outline" onClick={() => setSelectedSyncReport(report)}>
                                    View
                                  </Button>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{report.report_summary}</p>
                              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                <span className="px-2 py-1 rounded-full bg-muted">{report.knowledge_chunks} context chunks</span>
                                <span className="px-2 py-1 rounded-full bg-muted">{report.report_data.length} saved entries</span>
                              </div>
                              <div className="space-y-1.5">
                                {report.report_data.slice(0, 3).map((issue, issueIndex) => (
                                  <div key={`${report.id}-${issueIndex}`} className="rounded-md bg-muted/40 px-2.5 py-2 text-xs">
                                    <p className="font-medium text-foreground">{issue.issue_summary || "Untitled issue"}</p>
                                    <p className="text-muted-foreground">
                                      {issue.sector || "Unknown sector"}
                                      {issue.location ? ` • ${issue.location}` : ""}
                                      {typeof issue.urgency_score === "number" ? ` • Urgency ${issue.urgency_score}/10` : ""}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Uploaded Reports Card */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-medium">Uploaded Reports</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-2"
                        onClick={() => { void loadUploadedReports().catch((error: any) => toast.error(`Unable to load uploaded reports: ${error.message}`)); }}
                        disabled={isLoadingUploadedReports}
                      >
                        {isLoadingUploadedReports ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Refresh
                      </Button>
                    </div>

                    <Button
                      onClick={() => setShowUploadedReports((prev) => !prev)}
                      variant="outline"
                      className="w-full justify-between gap-2 border border-border"
                    >
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500" />
                        {showUploadedReports ? "Hide Uploaded Reports" : "View Uploaded Reports"}
                      </span>
                      <Badge variant="secondary">{uploadedReports.length}</Badge>
                    </Button>

                    {showUploadedReports && (
                      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3 max-h-64 overflow-y-auto">
                        {uploadedReports.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">No uploaded reports found in knowledge base yet.</p>
                        ) : (
                          uploadedReports.map((doc) => (
                            <div key={doc.source} className="rounded-md border border-border bg-background p-3 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium text-foreground">{doc.source}</p>
                                  <p className="text-xs text-muted-foreground">{doc.chunks} chunk(s) in knowledge base</p>
                                </div>
                                <Button size="sm" variant="outline" onClick={() => setSelectedUploadedReport(doc)}>
                                  View
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{doc.preview || "No preview available."}</p>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Upload Card */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">External Documents</h4>
                    <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 hover:bg-muted/50 transition cursor-pointer">
                      <FileText className="w-6 h-6 text-muted-foreground" />
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">Select PDF or TXT files</p>
                      </div>
                      <input
                        type="file"
                        multiple
                        accept=".txt,.pdf,.csv"
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={isProcessingFiles}
                      />
                    </label>

                    {uploadedFiles.length > 0 && (
                      <div className="space-y-2 max-h-[100px] overflow-y-auto">
                        <p className="text-xs font-medium text-muted-foreground">Queue ({uploadedFiles.length})</p>
                        {uploadedFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded-md text-xs border border-border">
                            <span className="truncate flex-1 max-w-[200px]">{file.name}</span>
                            <button onClick={() => removeFile(idx)} disabled={isProcessingFiles} className="text-muted-foreground hover:text-destructive">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      onClick={handleProcessFiles}
                      disabled={isProcessingFiles || uploadedFiles.length === 0}
                      className="w-full gap-2"
                    >
                      {isProcessingFiles ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {isProcessingFiles ? "Processing into ChromaDB..." : "Upload & Embed Documents"}
                    </Button>
                  </div>
                </div>
             </DialogContent>
           </Dialog>

           <Dialog open={selectedSyncReport !== null} onOpenChange={(open) => !open && setSelectedSyncReport(null)}>
             <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
               <DialogHeader>
                 <DialogTitle>{selectedSyncReport?.report_title || "Saved Snapshot"}</DialogTitle>
                 <DialogDescription>{selectedSyncReport?.report_summary || ""}</DialogDescription>
               </DialogHeader>
               {selectedSyncReport && (
                 <div className="space-y-3">
                   <div className="flex items-center gap-2 text-xs text-muted-foreground">
                     <Badge variant="outline">{selectedSyncReport.report_count} issues</Badge>
                     <Badge variant="outline">{selectedSyncReport.knowledge_chunks} chunks</Badge>
                     <span>{new Date(selectedSyncReport.created_at).toLocaleString()}</span>
                   </div>
                   <div className="space-y-2">
                     {selectedSyncReport.report_data.map((issue, idx) => (
                       <div key={`${selectedSyncReport.id}-${idx}`} className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                         <p className="font-medium text-foreground">{issue.issue_summary || "Untitled issue"}</p>
                         <p className="text-xs text-muted-foreground">
                           {issue.sector || "Unknown sector"}
                           {issue.location ? ` • ${issue.location}` : ""}
                           {typeof issue.urgency_score === "number" ? ` • Urgency ${issue.urgency_score}/10` : ""}
                         </p>
                       </div>
                     ))}
                   </div>
                 </div>
               )}
             </DialogContent>
           </Dialog>

           <Dialog open={selectedUploadedReport !== null} onOpenChange={(open) => !open && setSelectedUploadedReport(null)}>
             <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
               <DialogHeader>
                 <DialogTitle>{selectedUploadedReport?.source || "Uploaded Report"}</DialogTitle>
                 <DialogDescription>
                   {selectedUploadedReport ? `${selectedUploadedReport.chunks} chunk(s) currently stored in knowledge base.` : ""}
                 </DialogDescription>
               </DialogHeader>
               {selectedUploadedReport && (
                 <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed">
                   {selectedUploadedReport.preview || "No preview available."}
                 </pre>
               )}
             </DialogContent>
           </Dialog>
        </div>
      </div>

      {/* Main Area with Tab Switcher */}
      <div className="flex-1 flex flex-col bg-card/40 backdrop-blur-sm relative overflow-hidden">
        
        {/* Tab Header */}
        <div className="flex items-center border-b border-border px-4 py-2 bg-background/60">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === "chat" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquare className="w-4 h-4" /> Chat
            </button>
            <button
              onClick={() => setActiveTab("analysis")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === "analysis" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Brain className="w-4 h-4" /> Smart Analysis
            </button>
          </div>
          <div className="ml-auto hidden md:flex items-center gap-2">
            <div className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              {knowledgeBaseCount} context blocks
            </div>
          </div>
        </div>

        {/* --- CHAT TAB --- */}
        {activeTab === "chat" && (
          <>
            <div className="flex-1 overflow-y-auto w-full pt-8 pb-32">
              <div className="max-w-4xl mx-auto space-y-6 px-4 md:px-8">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                        <MessageSquare className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <div className={`w-full max-w-[85%] text-[15px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-muted/70 text-foreground rounded-3xl py-3 px-5 w-auto inline-block shadow-sm'
                        : 'text-foreground bg-transparent py-1 w-full'
                    }`}>
                      {msg.role === 'user' ? msg.content : (
                        <ReactMarkdown components={{
                          p: ({ children }) => <p className="mb-3 last:mb-0 leading-7">{children}</p>,
                          h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-4">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-lg font-semibold mb-2 mt-4">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-3">{children}</h3>,
                          ul: ({ children }) => <ul className="list-none space-y-1.5 mb-3 pl-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 mb-3">{children}</ol>,
                          li: ({ children }) => (
                            <li className="flex items-start gap-2">
                              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                              <span>{children}</span>
                            </li>
                          ),
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
                          code: ({ children }) => <code className="bg-muted border border-border text-primary px-1.5 py-0.5 rounded text-[13px] font-mono">{children}</code>,
                          pre: ({ children }) => <pre className="bg-muted border border-border rounded-lg p-4 overflow-x-auto text-[13px] font-mono my-3">{children}</pre>,
                          blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/40 pl-4 py-1 my-3 text-muted-foreground italic">{children}</blockquote>,
                          hr: () => <hr className="border-border my-4" />,
                        }}>{msg.content}</ReactMarkdown>
                      )}
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex w-full justify-start mt-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                      <MessageSquare className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex items-center gap-2 py-1">
                      <div className="w-2 h-2 rounded-full bg-primary animate-bounce opacity-80" />
                      <div className="w-2 h-2 rounded-full bg-primary animate-bounce delay-150 opacity-80" />
                      <div className="w-2 h-2 rounded-full bg-primary animate-bounce delay-300 opacity-80" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
              </div>
            </div>
            <div className="p-4 md:px-12 pb-8 bg-transparent">
              <div className="relative flex items-center max-w-4xl mx-auto shadow-md rounded-xl overflow-hidden bg-background border border-border focus-within:ring-2 focus-within:ring-primary/40">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Message Advanced RAG Assistant..."
                  className="flex-1 border-0 shadow-none focus-visible:ring-0 h-14 bg-transparent text-[15px] px-4"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
                />
                <Button onClick={handleSendMessage} disabled={isSending || !query.trim()} size="icon" className="mr-2 w-10 h-10 rounded-lg shrink-0">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-3">RAG Chatbot can make mistakes. Consider verifying important field insights.</p>
            </div>
          </>
        )}

        {/* --- SMART ANALYSIS TAB --- */}
        {activeTab === "analysis" && (
          <div className="flex-1 overflow-y-auto p-6 md:p-10">
            <div className="max-w-5xl mx-auto space-y-8">
              
              {/* Trigger Button */}
              {!analysis && !isAnalyzing && (
                <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Brain className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold mb-2">Smart Field Analysis</h2>
                    <p className="text-muted-foreground max-w-md">
                      Analyzes your historical issues, uploaded field reports, and active volunteer pool to generate AI-powered predictions and smart volunteer assignments.
                    </p>
                  </div>
                  <Button onClick={handleSmartAnalysis} size="lg" className="gap-2 px-8">
                    <Brain className="w-5 h-5" /> Run Smart Analysis
                  </Button>
                </div>
              )}

              {/* Loading State */}
              {isAnalyzing && (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="text-muted-foreground font-medium">Analyzing issues, reports & volunteers with AI...</p>
                  <p className="text-xs text-muted-foreground">This may take 10-20 seconds</p>
                </div>
              )}

              {/* Results */}
              {analysis && (
                <>
                  {/* Executive Summary */}
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold text-foreground">Executive Summary</h3>
                    </div>
                    <p className="text-muted-foreground leading-relaxed">{analysis.summary}</p>
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleSmartAnalysis} className="gap-2">
                        <RefreshCw className="w-4 h-4" /> Re-run Analysis
                      </Button>
                    </div>
                  </div>

                  {/* Predictions */}
                  {analysis.predictions?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold">Predictive Insights</h3>
                        <Badge variant="outline" className="ml-1">{analysis.predictions.length}</Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {analysis.predictions.map((pred, i) => (
                          <div key={i} className="border border-border rounded-xl p-4 bg-card space-y-3 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-semibold text-foreground text-sm leading-snug">{pred.title}</h4>
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${urgencyColor(pred.urgency)}`}>
                                {pred.urgency}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{pred.description}</p>
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md">{pred.sector}</span>
                              <span className="text-xs text-muted-foreground">⏳ {pred.timeframe}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-md ${pred.confidence === 'high' ? 'text-green-700 bg-green-50' : pred.confidence === 'medium' ? 'text-amber-700 bg-amber-50' : 'text-slate-600 bg-slate-100'}`}>
                                {pred.confidence} confidence
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Volunteer Assignments */}
                  {analysis.assignments?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Users className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold">Volunteer Assignments</h3>
                        <Badge variant="outline" className="ml-1">{analysis.assignments.length} issues</Badge>
                      </div>
                      <div className="space-y-4">
                        {analysis.assignments.map((asgn, i) => (
                          <div key={i} className="border border-border rounded-xl bg-card overflow-hidden hover:shadow-md transition-shadow">
                            {/* Issue Header */}
                            <div className="px-5 py-4 bg-muted/40 border-b border-border flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-foreground text-sm">{asgn.issue_summary}</p>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  <span className="text-xs bg-background border border-border px-2 py-0.5 rounded-md">{asgn.sector}</span>
                                  {asgn.location && <span className="text-xs text-muted-foreground">📍 {asgn.location}</span>}
                                </div>
                              </div>
                              {asgn.urgency_score && (
                                <div className={`text-xs px-2.5 py-1 rounded-full font-semibold border flex-shrink-0 ${
                                  asgn.urgency_score >= 8 ? 'bg-red-50 text-red-700 border-red-200' :
                                  asgn.urgency_score >= 5 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                  'bg-green-50 text-green-700 border-green-200'
                                }`}>
                                  Urgency {asgn.urgency_score}/10
                                </div>
                              )}
                            </div>

                            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                              {/* Primary Volunteer */}
                              <div className="md:col-span-1">
                                <div className="flex items-center gap-1.5 mb-2">
                                  <UserCheck className="w-4 h-4 text-green-600" />
                                  <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Primary</span>
                                </div>
                                {asgn.primary_volunteer ? (
                                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                                    <p className="font-semibold text-sm text-foreground">{asgn.primary_volunteer.name}</p>
                                    <p className="text-xs text-muted-foreground">📍 {asgn.primary_volunteer.zone}</p>
                                    <div className="flex flex-wrap gap-1">
                                      {asgn.primary_volunteer.skills?.map((s, si) => (
                                        <span key={si} className="text-[11px] bg-background border border-green-200 text-green-700 px-1.5 py-0.5 rounded">{s}</span>
                                      ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground italic border-t border-green-100 pt-2 mt-1">{asgn.primary_volunteer.reason}</p>
                                  </div>
                                ) : (
                                  <div className="border border-dashed border-border rounded-lg p-3 text-xs text-muted-foreground text-center">
                                    No matching volunteer found
                                  </div>
                                )}
                              </div>

                              {/* Backup Volunteers */}
                              <div className="md:col-span-2">
                                <div className="flex items-center gap-1.5 mb-2">
                                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                                  <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Backup Volunteers</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {asgn.backup_volunteers?.map((bk, bi) => (
                                    <div key={bi} className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
                                      <p className="font-semibold text-sm text-foreground">{bk.name}</p>
                                      <p className="text-xs text-muted-foreground">📍 {bk.zone}</p>
                                      <div className="flex flex-wrap gap-1">
                                        {bk.skills?.map((s, si) => (
                                          <span key={si} className="text-[11px] bg-background border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded">{s}</span>
                                        ))}
                                      </div>
                                      <p className="text-xs text-muted-foreground italic border-t border-amber-100 pt-1.5">{bk.reason}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
