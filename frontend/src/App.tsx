import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "./components/Layout";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import RunAgents from "./pages/RunAgents";
import Issues from "./pages/Issues";
import Volunteers from "./pages/Volunteers";
import ActionPlan from "./pages/ActionPlan";
import AgentLogs from "./pages/AgentLogs";
import Community from "./pages/Community";
import VolunteerPortal from "./pages/VolunteerPortal";
import Saved from "./pages/Saved";
import PostDetail from "./pages/PostDetail";
import NotFound from "./pages/NotFound";
import FundSupport from "./pages/FundSupport";
import ManageFunds from "./pages/ManageFunds";
import AboutNgo from "./pages/AboutNgo";
import Sponsors from "./pages/Sponsors";
import SponsorPortal from "@/pages/SponsorPortal";
import RagInsights from "./pages/RagInsights";
import NewsPortal from "./pages/NewsPortal";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <LanguageProvider>
          <AuthProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Auth />} />
                <Route path="/auth" element={<Auth />} />
                <Route
                  element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/about" element={<AboutNgo />} />
                  <Route path="/news" element={<NewsPortal />} />
                  <Route path="/sponsors" element={<Sponsors />} />
                  <Route path="/community" element={<Community />} />
                  <Route path="/community/:type/:id" element={<PostDetail />} />
                  <Route path="/volunteer-portal" element={<VolunteerPortal />} />
                  <Route path="/sponsor-portal" element={<SponsorPortal />} />
                  <Route path="/fund-support" element={<FundSupport />} />
                  <Route path="/manage-funds" element={<ManageFunds />} />
                  <Route path="/saved" element={<Saved />} />
                  <Route path="/run" element={<RunAgents />} />
                  <Route path="/insights" element={<RagInsights />} />
                  <Route path="/issues" element={<Issues />} />
                  <Route path="/volunteers" element={<Volunteers />} />
                  <Route path="/action-plan" element={<ActionPlan />} />
                  <Route path="/logs" element={<AgentLogs />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </LanguageProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
