import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BrainCircuit, UserCheck, MapPin, CheckCircle2 } from "lucide-react";
import { analyzeSkillsForIssue, generateEmbedding } from "@/services/geminiService";
import { calculateCosineSimilarity, calculateLocationScore, calculateFinalMatchScore } from "@/lib/vectorUtils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function SmartMatchDialog({ issue, volunteers, onAssigned }: { issue: any, volunteers: any[], onAssigned: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyzedSkills, setAnalyzedSkills] = useState("");
  const [matches, setMatches] = useState<any[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const runSmartMatch = async () => {
    setLoading(true);
    setAnalyzedSkills("");
    setMatches([]);
    
    try {
      // 1. Dynamic skill deduction
      const requiredSkillsList = await analyzeSkillsForIssue(issue.issue_summary, issue.sector);
      setAnalyzedSkills(requiredSkillsList);
      
      // 2. Embed the required skills text
      const requiredEmbedding = await generateEmbedding(requiredSkillsList);

      // 3. Process all active volunteers
      const activeVolunteers = volunteers.filter(v => v.is_active);
      
      const scoredVolunteers = await Promise.all(activeVolunteers.map(async (vol) => {
        const volunteerSkillsText = (vol.skills || []).join(", ");
        
        let cosine = 0;
        if (volunteerSkillsText.trim() !== "") {
          const volEmbedding = await generateEmbedding(volunteerSkillsText);
          cosine = calculateCosineSimilarity(requiredEmbedding, volEmbedding);
        }
        
        const locScore = calculateLocationScore(issue.location || "", vol.zone || "");
        
        // Use a mock past success rate if not available (we randomize slightly for demo)
        const pastSuccessRate = vol.past_success_rate || (0.8 + (Math.random() * 0.2)); 
        
        const finalScore = calculateFinalMatchScore(cosine, pastSuccessRate, locScore);
        
        return {
          ...vol,
          score: finalScore,
          cosinePercentage: Math.round(Math.max(0, cosine) * 100),
          pastSuccessRate: Math.round(pastSuccessRate * 100)
        };
      }));

      // 4. Sort and return
      scoredVolunteers.sort((a, b) => b.score - a.score);
      setMatches(scoredVolunteers.slice(0, 5)); // top 5
      
    } catch (e: any) {
      toast.error(`Matching failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (volunteer: any) => {
    setAssigningId(volunteer.id);
    try {
      const { error } = await supabase.from("issues").update({
        assigned_volunteer_id: volunteer.id,
        status: "assigned",
        assignment_reason: `Smart Matched with ${volunteer.score}% score (Cosine: ${volunteer.cosinePercentage}%, Geo+Success adjusted)`
      }).eq("id", issue.id);

      if (error) throw error;
      toast.success(`Assigned ${volunteer.name} to issue.`);
      setOpen(false);
      onAssigned();
    } catch (e: any) {
      toast.error(`Assignment failed: ${e.message}`);
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (val) runSmartMatch(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-primary border-primary hover:bg-primary/10">
          <BrainCircuit className="w-4 h-4" /> Smart Match
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl bg-black border border-white/10 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <BrainCircuit className="text-primary w-5 h-5" /> 
            AI Volunteer Matching
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Issue Context Box */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg space-y-2">
             <div className="text-sm text-slate-400">Issue Context</div>
             <div className="text-sm text-white font-medium">{issue.issue_summary}</div>
             <div className="flex gap-2 text-xs text-slate-300">
               <Badge variant="outline" className="text-slate-300 border-slate-700">{issue.sector}</Badge>
               {issue.location && <Badge variant="outline" className="text-slate-300 border-slate-700 flex items-center gap-1"><MapPin className="w-3 h-3"/>{issue.location}</Badge>}
             </div>
          </div>

          {!loading && analyzedSkills && (
            <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg space-y-1">
               <div className="text-xs text-primary font-semibold uppercase tracking-wider">Dynamically Inferred Skills Requirements</div>
               <div className="text-sm text-white">{analyzedSkills}</div>
            </div>
          )}

          {loading ? (
             <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
               <Loader2 className="w-8 h-8 animate-spin text-primary" />
               <p className="text-sm">Analyzing issue context and embedding volunteer profiles...</p>
             </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-200">Top Suggested Volunteers</div>
              {matches.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-4">No active volunteers available.</div>
              ) : (
                <div className="space-y-3">
                  {matches.map((v, i) => (
                    <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950 hover:border-primary/50 transition-colors">
                       <div className="flex-1">
                         <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-100">{v.name}</span>
                            <Badge className="bg-primary/20 text-primary border-0">{v.score}% Match</Badge>
                         </div>
                         <div className="flex flex-wrap gap-2 text-xs mt-1 text-slate-400">
                           <span><span className="text-slate-500">Skills:</span> {(v.skills || []).join(", ") || "None"}</span>
                           <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {v.zone || "No zone"}</span>
                           <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500"/> {v.pastSuccessRate}% Success Index</span>
                         </div>
                       </div>
                       <Button 
                         size="sm" 
                         onClick={() => handleAssign(v)}
                         disabled={assigningId === v.id}
                         className="gap-2"
                       >
                         {assigningId === v.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <UserCheck className="w-4 h-4"/>}
                         Assign
                       </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
