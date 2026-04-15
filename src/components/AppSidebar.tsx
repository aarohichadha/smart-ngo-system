import { useEffect, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getProfileByUserId } from "@/services/impactService";
import type { NgoProfile } from "@/types/impact";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  LayoutDashboard,
  Play,
  ListChecks,
  Users,
  Bookmark,
  MessageSquare,
  FileText,
  Terminal,
  Zap,
  LogOut,
  User,
  DollarSign,
  Building2,
  Handshake,
  Heart,
  BrainCircuit,
} from "lucide-react";

const ngoNavItems = [
  { labelKey: "nav.dashboard", url: "/dashboard", icon: LayoutDashboard },
  { labelKey: "About", url: "/about", icon: Building2 },
  { labelKey: "nav.sponsors", url: "/sponsors", icon: Handshake },
  { labelKey: "nav.runAgents", url: "/run", icon: Play, accent: true },
  { labelKey: "RAG Insights", url: "/insights", icon: BrainCircuit, accent: true },
  { labelKey: "nav.manageFunds", url: "/manage-funds", icon: DollarSign },
  { labelKey: "nav.issues", url: "/issues", icon: ListChecks },
  { labelKey: "nav.volunteers", url: "/volunteers", icon: Users },
  { labelKey: "nav.actionPlan", url: "/action-plan", icon: FileText },
  { labelKey: "nav.agentLogs", url: "/logs", icon: Terminal },
  { labelKey: "nav.community", url: "/community", icon: MessageSquare },
  { labelKey: "nav.saved", url: "/saved", icon: Bookmark },
];

const volunteerNavItems = [
  { labelKey: "nav.volunteerPortal", url: "/volunteer-portal", icon: Users, accent: true },
  { labelKey: "nav.fundSupport", url: "/fund-support", icon: DollarSign },
  { labelKey: "nav.community", url: "/community", icon: MessageSquare },
  { labelKey: "nav.saved", url: "/saved", icon: Bookmark },
];

const sponsorNavItems = [
  { labelKey: "nav.sponsorPortal", url: "/sponsor-portal", icon: Heart, accent: true },
  { labelKey: "nav.community", url: "/community", icon: MessageSquare },
  { labelKey: "nav.saved", url: "/saved", icon: Bookmark },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [ngoProfile, setNgoProfile] = useState<NgoProfile | null>(null);
  const resolvedNavItems = user?.userType === "individual"
    ? volunteerNavItems
    : user?.userType === "sponsor"
      ? sponsorNavItems
      : ngoNavItems;

  useEffect(() => {
    let active = true;

    if (!user || user.userType !== "ngo") {
      setNgoProfile(null);
      return;
    }

    void getProfileByUserId(user.id)
      .then((payload) => {
        if (active) {
          setNgoProfile(payload.ngoProfile as NgoProfile | null);
        }
      })
      .catch((error) => {
        console.error("Failed to load NGO sidebar profile:", error);
        if (active) {
          setNgoProfile(null);
        }
      });

    return () => {
      active = false;
    };
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate("/auth");
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-sidebar-primary font-bold text-base leading-tight">{t("sidebar.organization")}</h1>
              <p className="text-sidebar-foreground/40 text-[10px] leading-tight">{t("sidebar.subtitle")}</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {resolvedNavItems.map((item) => {
                const label = t(item.labelKey);
                const isActive = item.url === "/dashboard" || item.url === "/sponsor-portal"
                  ? location.pathname === item.url
                  : location.pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={label}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                      <NavLink
                        to={item.url}
                        end={item.url === "/dashboard" || item.url === "/sponsor-portal"}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                          item.accent && !isActive
                            ? "text-sidebar-primary hover:bg-sidebar-accent"
                            : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      >
                        <item.icon
                          className={`w-4 h-4 flex-shrink-0 ${item.accent && !isActive ? "text-sidebar-primary" : ""}`}
                        />
                        {!collapsed && <span className="text-sm">{label}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      <SidebarFooter className="flex flex-col gap-2 px-4 py-3">
        {user && !collapsed && (
          <div className="flex items-center gap-2 px-2 py-2 rounded-md bg-sidebar-accent/50">
            <User className="w-4 h-4 text-sidebar-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-sidebar-primary truncate">{user.email}</p>
              <p className="text-[9px] text-sidebar-foreground/60 capitalize">
                {user.userType}
              </p>
            </div>
          </div>
        )}
        
        {!collapsed && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-xs"
          >
            <LogOut className="w-3 h-3 mr-2" />
            {t("common.logout")}
          </Button>
        )}
        
        {collapsed && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full"
            title={t("common.logout")}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        )}
        
      </SidebarFooter>
    </Sidebar>
  );
}
