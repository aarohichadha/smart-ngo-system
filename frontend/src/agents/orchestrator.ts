import { supabase } from "@/integrations/supabase/client";

export interface AgentLog {
  agent: string;
  timestamp: string;
  decision: string;
  reasoning: string;
}

export interface Alert {
  type: 'skill_gap' | 'overload' | 'critical_unassigned' | 'reallocation';
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface AgentState {
  rawInput: string;
  issues: any[];
  volunteers: any[];
  assignments: any[];
  alerts: Alert[];
  agentLogs: AgentLog[];
  currentStep: string;
  isComplete: boolean;
  confidence?: number;
  finalReport?: string;
}

/**
 * Migration: Server-side Vertex AI ReAct Loop
 * This orchestrator now calls the backend API instead of running logic client-side.
 */
export const runOrchestrator = async (
  rawInput: string,
  volunteers: any[],
  onStepComplete?: (state: AgentState) => void
): Promise<AgentState> => {
  console.log('[Orchestrator] Starting server-side Vertex AI pipeline');
  
  // Initial state to show the UI has started
  const initialState: AgentState = {
    rawInput,
    volunteers,
    issues: [],
    assignments: [],
    alerts: [],
    agentLogs: [{
      agent: "System",
      timestamp: new Date().toISOString(),
      decision: "Calling Vertex AI Backend Agent...",
      reasoning: "Handing off orchestration to the server-side ReAct loop."
    }],
    currentStep: "ingestion",
    isComplete: false,
  };
  onStepComplete?.(initialState);

  try {
    const backendUrl = "http://localhost:3000"; // Our Node.js backend
    const response = await fetch(`${backendUrl}/api/run-vertex-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawInput, volunteers }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Backend request failed (${response.status}): ${errText}`);
    }

    const finalState = await response.json();
    console.log('[Orchestrator] Server-side pipeline complete', finalState);
    
    // Trigger one last update for the UI
    onStepComplete?.(finalState);
    return finalState;
  } catch (error: any) {
    console.error('[Orchestrator] Backend pipeline failed:', error);
    const errorState: AgentState = {
      ...initialState,
      isComplete: true,
      currentStep: "complete",
      alerts: [{
        type: "critical_unassigned",
        message: `Pipeline failed: ${error.message}`,
        severity: "critical"
      }],
      agentLogs: [
        ...initialState.agentLogs,
        {
          agent: "Orchestrator",
          timestamp: new Date().toISOString(),
          decision: "Error",
          reasoning: error.message
        }
      ]
    };
    onStepComplete?.(errorState);
    throw error;
  }
};

// Legacy exports provided as stubs to prevent import errors in other files
export const runIngestionAgent = async (state: AgentState): Promise<AgentState> => state;
export const runExtractionAgent = async (state: AgentState): Promise<AgentState> => state;
export const runScoringAgent = async (state: AgentState): Promise<AgentState> => state;
export const runGapDetectionAgent = async (state: AgentState): Promise<AgentState> => state;
export const runMatchingAgent = async (state: AgentState): Promise<AgentState> => state;
export const runReallocationAgent = async (state: AgentState): Promise<AgentState> => state;
export const runReportAgent = async (state: AgentState): Promise<AgentState> => state;
