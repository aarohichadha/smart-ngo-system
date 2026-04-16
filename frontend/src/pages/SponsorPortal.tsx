import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Heart, Handshake, WalletCards, PackageSearch, Building2, Users } from "lucide-react";
import { PostCard } from "@/components/community/PostCard";
import { PostFilters } from "@/components/community/PostFilters";
import type { CommunityFilter, CommunityPost } from "@/types/impact";
import type { ConnectionResponse } from "@/types/impact";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { useLanguage } from "@/contexts/LanguageContext";
import { addConnection, getCommunityFeed, getConnectionsForMe, getSavedPosts, savePost, unsavePost, updateConnectionStatus } from "@/services/impactService";

const INITIAL_FILTER: CommunityFilter = {
  feedType: "all",
  category: "",
  location: "",
  urgency: "all",
  query: "",
};

const OPEN_STATUSES = new Set(["open", "active", "assigned", "unassigned", "accepted"]);

const keywordCheck = (post: CommunityPost, keywords: string[]) => {
  const haystack = `${post.title} ${post.description} ${post.category}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
};

type SponsorshipRequestPayload = {
  type?: string;
  ngoName?: string;
  ngoLocation?: string;
  ngoFocus?: string;
  cause?: string;
  fundingNeeded?: number;
  previousWorkExperience?: string;
  note?: string;
  requestedAt?: string;
};

type SponsorshipFollowUpPayload = {
  type?: string;
  parentConnectionId?: string;
  question?: string;
  sponsorName?: string;
  sentAt?: string;
};

type SponsorshipFollowUpResponsePayload = {
  type?: string;
  parentConnectionId?: string;
  followUpConnectionId?: string;
  response?: string;
  respondedAt?: string;
};

const parseSponsorshipRequest = (message: string) => {
  try {
    const payload = JSON.parse(message) as SponsorshipRequestPayload;
    if (payload?.type === "sponsorship_request") {
      return payload;
    }
  } catch {
    return null;
  }

  return null;
};

const parseSponsorshipFollowUp = (message: string) => {
  try {
    const payload = JSON.parse(message) as SponsorshipFollowUpPayload;
    if (payload?.type === "sponsorship_follow_up") {
      return payload;
    }
  } catch {
    return null;
  }

  return null;
};

const parseSponsorshipFollowUpResponse = (message: string) => {
  try {
    const payload = JSON.parse(message) as SponsorshipFollowUpResponsePayload;
    if (payload?.type === "sponsorship_follow_up_response") {
      return payload;
    }
  } catch {
    return null;
  }

  return null;
};

export default function SponsorPortal() {
  const { profile, loading: authLoading, userId } = useAuthProfile();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [connections, setConnections] = useState<ConnectionResponse[]>([]);
  const [sponsoredKeys, setSponsoredKeys] = useState<Set<string>>(new Set());
  const [updatingIncomingId, setUpdatingIncomingId] = useState<string | null>(null);
  const [connectingIncomingId, setConnectingIncomingId] = useState<string | null>(null);
  const [followUpDialog, setFollowUpDialog] = useState<{ connection: ConnectionResponse; request: SponsorshipRequestPayload | null } | null>(null);
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [filter, setFilter] = useState<CommunityFilter>(INITIAL_FILTER);
  const [quick, setQuick] = useState({
    fundingNeeded: false,
    materialSupport: false,
    highPriority: false,
    ngoRequests: true,
    communityRequests: false,
  });

  const accountType = profile ? ("user_type" in profile ? profile.user_type : (profile as { role?: string }).role) : null;
  const isSponsor = accountType === "sponsor";

  const refresh = async () => {
    setLoading(true);
    try {
      const [feed, saved] = await Promise.all([
        getCommunityFeed(),
        getSavedPosts(),
      ]);
      const sponsorConnections = await getConnectionsForMe();
      setPosts(feed);
      setSavedKeys(new Set(saved.map((post) => `${post.postType}:${post.id}`)));
      setConnections(sponsorConnections as ConnectionResponse[]);
    } catch (error: any) {
      toast.error(error.message || t("community.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (!OPEN_STATUSES.has(post.status.toLowerCase())) return false;

      if (filter.feedType !== "all" && post.postType !== filter.feedType) return false;
      if (filter.category && !post.category.toLowerCase().includes(filter.category.toLowerCase())) return false;
      if (filter.location && !post.location.toLowerCase().includes(filter.location.toLowerCase())) return false;
      if (filter.urgency !== "all" && post.urgency !== filter.urgency) return false;

      const q = filter.query.toLowerCase().trim();
      if (q) {
        const matchesText =
          post.title.toLowerCase().includes(q)
          || post.description.toLowerCase().includes(q)
          || post.ownerName.toLowerCase().includes(q);

        if (!matchesText) return false;
      }

      if (quick.highPriority && !["high", "critical"].includes(post.urgency)) return false;
      if (quick.ngoRequests && !quick.communityRequests && post.postType !== "ngo_request") return false;
      if (quick.communityRequests && !quick.ngoRequests && post.postType !== "volunteer_offer") return false;
      if (!quick.ngoRequests && !quick.communityRequests) return false;

      if (quick.fundingNeeded && !keywordCheck(post, ["fund", "funding", "grant", "donation", "budget"])) return false;
      if (quick.materialSupport && !keywordCheck(post, ["material", "supply", "supplies", "equipment", "kit", "resources"])) return false;

      return true;
    });
  }, [posts, filter, quick]);

  const stats = useMemo(() => {
    const openPosts = posts.filter((post) => OPEN_STATUSES.has(post.status.toLowerCase()));
    const feedFunding = openPosts.reduce((sum, post) => sum + (post.postType === "ngo_request" ? (post.fundingAmount || 0) : 0), 0);
    const openNgoRequests = openPosts.filter((post) => post.postType === "ngo_request");
    const incomingRequests = connections.filter((connection) => connection.receiver_id === userId && parseSponsorshipRequest(connection.message));
    const acceptedIncomingFunding = incomingRequests.reduce((sum, connection) => {
      if (connection.status !== "accepted") return sum;
      const parsed = parseSponsorshipRequest(connection.message);
      return sum + (typeof parsed?.fundingNeeded === "number" ? parsed.fundingNeeded : 0);
    }, 0);
    return {
      openRequests: openNgoRequests.length,
      fundingNeeded: feedFunding + acceptedIncomingFunding,
      contributionsMade: connections.filter((connection) => connection.sender_id === userId).length,
      incomingRequests: incomingRequests.length,
      collaborationFocused: openPosts.filter((post) => keywordCheck(post, ["collaborat", "partner", "partnership"])).length,
      ngoRequests: openNgoRequests.length,
      communityRequests: openPosts.filter((post) => post.postType === "volunteer_offer").length,
    };
  }, [connections, posts, userId]);

  const incomingSponsorshipRequests = useMemo(
    () =>
      connections
        .filter((connection) => connection.receiver_id === userId)
        .map((connection) => ({
          connection,
          request: parseSponsorshipRequest(connection.message),
        }))
        .filter(({ request }) => Boolean(request)),
    [connections, userId],
  );

  const toggleQuick = (key: keyof typeof quick) => {
    setQuick((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async (post: CommunityPost) => {
    try {
      const key = `${post.postType}:${post.id}`;
      if (savedKeys.has(key)) {
        await unsavePost(post.postType, post.id);
      } else {
        await savePost(post.postType, post.id);
      }
      await refresh();
    } catch (error: any) {
      toast.error(error.message || t("community.couldNotUpdateSaved"));
    }
  };

  const handleRespond = async (post: CommunityPost) => {
    const message = window.prompt(
      post.postType === "ngo_request"
        ? t("community.responsePromptNgo")
        : t("community.responsePromptVolunteer"),
    );

    if (!message) return;

    try {
      await addConnection({
        requestId: post.postType === "ngo_request" ? post.id : undefined,
        offerId: post.postType === "volunteer_offer" ? post.id : undefined,
        receiverId: post.ownerId,
        message,
      });
      toast.success(t("community.responseSent"));
    } catch (error: any) {
      toast.error(error.message || t("community.couldNotSendResponse"));
    }
  };

  const handleSponsor = async (post: CommunityPost) => {
    const defaultMessage = post.postType === "ngo_request"
      ? `Hi ${post.ownerName}, we are interested in sponsoring support for \"${post.title}\".`
      : `Hi ${post.ownerName}, we are interested in sponsoring this community need.`;

    const message = window.prompt("Write a short sponsorship note", defaultMessage);
    if (!message) return;

    try {
      await addConnection({
        requestId: post.postType === "ngo_request" ? post.id : undefined,
        offerId: post.postType === "volunteer_offer" ? post.id : undefined,
        receiverId: post.ownerId,
        message,
      });

      const key = `${post.postType}:${post.id}`;
      setSponsoredKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });

      toast.success("Sponsorship interest sent.");
    } catch (error: any) {
      toast.error(error.message || "Could not send sponsorship interest.");
    }
  };

  const handleIncomingStatus = async (connectionId: string, status: "accepted" | "rejected") => {
    setUpdatingIncomingId(connectionId);
    try {
      await updateConnectionStatus(connectionId, status);
      toast.success(status === "accepted" ? "Request accepted." : "Request declined.");
      await refresh();
    } catch (error: any) {
      toast.error(error.message || "Could not update request status.");
    } finally {
      setUpdatingIncomingId(null);
    }
  };

  const openFollowUpDialog = (connection: ConnectionResponse, request: SponsorshipRequestPayload | null) => {
    const defaultMessage = request?.ngoName
      ? `Hi ${request.ngoName}, thanks for your sponsorship request. Could you share more details about timelines, milestones, and expected outcomes?`
      : "Thanks for your sponsorship request. Could you share more details?";

    setFollowUpDialog({ connection, request });
    setFollowUpMessage(defaultMessage);
  };

  const closeFollowUpDialog = () => {
    if (connectingIncomingId) return;
    setFollowUpDialog(null);
    setFollowUpMessage("");
  };

  const submitFollowUp = async () => {
    if (!followUpDialog || !followUpMessage.trim()) {
      toast.error("Please add a follow-up message.");
      return;
    }

    const { connection, request } = followUpDialog;

    setConnectingIncomingId(connection.id);
    try {
      await addConnection({
        requestId: connection.request_id || undefined,
        offerId: connection.offer_id || undefined,
        receiverId: connection.sender_id,
        message: JSON.stringify(
          {
            type: "sponsorship_follow_up",
            parentConnectionId: connection.id,
            question: followUpMessage.trim(),
            ngoName: request?.ngoName || null,
            sponsorName: profile?.display_name || profile?.full_name || "Sponsor",
            sentAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      });

      toast.success("Follow-up message sent to NGO.");
      closeFollowUpDialog();
      await refresh();
    } catch (error: any) {
      toast.error(error.message || "Could not send follow-up message.");
    } finally {
      setConnectingIncomingId(null);
    }
  };

  if (!authLoading && !isSponsor) {
    return <Navigate to="/community" replace />;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sponsor Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse verified needs, prioritize impact, and mark sponsorship interest with NGO and community teams.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Open NGO Requests</p>
            <p className="text-2xl font-bold mt-1">{stats.openRequests}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Funding Needed</p>
            <p className="text-2xl font-bold mt-1">Rs {stats.fundingNeeded.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Contributions Made</p>
            <p className="text-2xl font-bold mt-1">{stats.contributionsMade}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Incoming Requests</p>
            <p className="text-2xl font-bold mt-1">{stats.incomingRequests}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Incoming sponsorship requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {incomingSponsorshipRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sponsorship requests have arrived yet.</p>
          ) : (
            incomingSponsorshipRequests.map(({ connection, request }) => {
              const followUpThreads = connections
                .filter((item) => item.sender_id === userId && item.receiver_id === connection.sender_id)
                .map((item) => ({
                  connection: item,
                  payload: parseSponsorshipFollowUp(item.message),
                }))
                .filter(({ payload }) => payload?.parentConnectionId === connection.id);

              const ngoResponses = connections
                .filter((item) => item.sender_id === connection.sender_id && item.receiver_id === userId)
                .map((item) => ({
                  connection: item,
                  payload: parseSponsorshipFollowUpResponse(item.message),
                }))
                .filter(({ payload }) => payload?.parentConnectionId === connection.id);

              return (
              <div key={connection.id} className="rounded-lg border bg-muted/20 p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{request?.ngoName || "NGO request"}</p>
                    <p className="text-xs text-muted-foreground">
                      {request?.ngoLocation ? request.ngoLocation : "Incoming request from your sponsor network"}
                    </p>
                  </div>
                  <Badge variant="outline">{connection.status || "pending"}</Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md bg-background/80 p-3 border">
                    <p className="text-xs uppercase text-muted-foreground">Cause</p>
                    <p className="mt-1 text-sm text-foreground whitespace-pre-line">{request?.cause || connection.message}</p>
                  </div>
                  <div className="rounded-md bg-background/80 p-3 border">
                    <p className="text-xs uppercase text-muted-foreground">Fund needed</p>
                    <p className="mt-1 text-sm text-foreground">
                      {typeof request?.fundingNeeded === "number" ? `Rs ${request.fundingNeeded.toLocaleString()}` : "Not specified"}
                    </p>
                  </div>
                  <div className="rounded-md bg-background/80 p-3 border">
                    <p className="text-xs uppercase text-muted-foreground">Previous work experience</p>
                    <p className="mt-1 text-sm text-foreground whitespace-pre-line">
                      {request?.previousWorkExperience || "No experience notes shared."}
                    </p>
                  </div>
                </div>

                {request?.ngoFocus ? (
                  <div className="rounded-md bg-background/80 p-3 border">
                    <p className="text-xs uppercase text-muted-foreground">NGO focus</p>
                    <p className="mt-1 text-sm text-foreground whitespace-pre-line">{request.ngoFocus}</p>
                  </div>
                ) : null}

                {request?.note ? (
                  <div className="rounded-md bg-background/80 p-3 border">
                    <p className="text-xs uppercase text-muted-foreground">Note</p>
                    <p className="mt-1 text-sm text-foreground whitespace-pre-line">{request.note}</p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleIncomingStatus(connection.id, "accepted")}
                    disabled={updatingIncomingId === connection.id || connectingIncomingId === connection.id || connection.status === "accepted"}
                  >
                    {connection.status === "accepted" ? "Accepted" : "Accept"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleIncomingStatus(connection.id, "rejected")}
                    disabled={updatingIncomingId === connection.id || connectingIncomingId === connection.id || connection.status === "rejected"}
                  >
                    {connection.status === "rejected" ? "Declined" : "Decline"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openFollowUpDialog(connection, request || null)}
                    disabled={updatingIncomingId === connection.id || connectingIncomingId === connection.id}
                  >
                    {connectingIncomingId === connection.id ? "Sending..." : "Connect"}
                  </Button>
                </div>

                {followUpThreads.length > 0 ? (
                  <div className="rounded-md border bg-background/70 p-3 space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Follow-up questions</p>
                    {followUpThreads.map(({ connection: followUp, payload }) => (
                      <div key={followUp.id} className="rounded-md border bg-card p-3">
                        <p className="text-sm text-foreground whitespace-pre-line">{payload?.question || followUp.message}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {ngoResponses.length > 0 ? (
                  <div className="rounded-md border bg-background/70 p-3 space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">NGO responses</p>
                    {ngoResponses.map(({ connection: responseConn, payload }) => (
                      <div key={responseConn.id} className="rounded-md border bg-card p-3">
                        <p className="text-sm text-foreground whitespace-pre-line">{payload?.response || responseConn.message}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PostFilters value={filter} onChange={setFilter} />
          <div className="flex flex-wrap gap-2">
            <Button variant={quick.fundingNeeded ? "default" : "outline"} size="sm" onClick={() => toggleQuick("fundingNeeded")}>
              <WalletCards className="h-4 w-4 mr-1" />
              Funding Needed
            </Button>
            <Button variant={quick.materialSupport ? "default" : "outline"} size="sm" onClick={() => toggleQuick("materialSupport")}>
              <PackageSearch className="h-4 w-4 mr-1" />
              Material Support
            </Button>
            <Button variant={quick.highPriority ? "default" : "outline"} size="sm" onClick={() => toggleQuick("highPriority")}>
              <Handshake className="h-4 w-4 mr-1" />
              High Priority
            </Button>
            <Button variant={quick.ngoRequests ? "default" : "outline"} size="sm" onClick={() => toggleQuick("ngoRequests")}>
              <Building2 className="h-4 w-4 mr-1" />
              NGO Requests
            </Button>
            <Button variant={quick.communityRequests ? "default" : "outline"} size="sm" onClick={() => toggleQuick("communityRequests")}>
              <Users className="h-4 w-4 mr-1" />
              Community Requests
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">Loading sponsor feed...</CardContent>
          </Card>
        ) : filteredPosts.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No requests match your sponsor filters.
            </CardContent>
          </Card>
        ) : (
          filteredPosts.map((post) => {
            const key = `${post.postType}:${post.id}`;
            return (
              <PostCard
                key={key}
                post={post}
                canRespond={post.ownerId !== userId}
                isOwner={post.ownerId === userId}
                isSaved={savedKeys.has(key)}
                onSave={handleSave}
                onRespond={handleRespond}
                respondLabel="Message"
                showSponsorAction={post.ownerId !== userId}
                isSponsored={sponsoredKeys.has(key)}
                sponsorLabel={sponsoredKeys.has(key) ? "Sponsored" : "Sponsor"}
                onSponsor={handleSponsor}
              />
            );
          })
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sponsor Focus Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
          <p className="text-muted-foreground">Collaboration focused requests: <span className="text-foreground font-medium">{stats.collaborationFocused}</span></p>
          <p className="text-muted-foreground">NGO requests in feed: <span className="text-foreground font-medium">{stats.ngoRequests}</span></p>
          <p className="text-muted-foreground">Community requests in feed: <span className="text-foreground font-medium">{stats.communityRequests}</span></p>
        </CardContent>
      </Card>

      <Dialog open={Boolean(followUpDialog)} onOpenChange={(open) => (!open ? closeFollowUpDialog() : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send follow-up question</DialogTitle>
            <DialogDescription>
              Ask the NGO for any additional details you need before confirming sponsorship.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="sponsor-follow-up-message">Message</Label>
            <Textarea
              id="sponsor-follow-up-message"
              value={followUpMessage}
              onChange={(event) => setFollowUpMessage(event.target.value)}
              rows={6}
              placeholder="Add your follow-up question"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeFollowUpDialog} disabled={Boolean(connectingIncomingId)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitFollowUp()} disabled={Boolean(connectingIncomingId)}>
              {connectingIncomingId ? "Sending..." : "Send question"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
