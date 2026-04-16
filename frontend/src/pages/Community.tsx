import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PostFilters } from "@/components/community/PostFilters";
import { PostCard } from "@/components/community/PostCard";
import { RequestFormDialog, type RequestFormValues } from "@/components/community/RequestFormDialog";
import { OfferFormDialog, type OfferFormValues } from "@/components/community/OfferFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import type { CommunityFilter, CommunityPost } from "@/types/impact";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  addConnection,
  createNgoRequest,
  createVolunteerOffer,
  deleteNgoRequest,
  deleteVolunteerOffer,
  getCommunityFeed,
  getNgoDirectory,
  getRecommendations,
  getSavedPosts,
  savePost,
  unsavePost,
  updateNgoRequest,
  updateVolunteerOffer,
} from "@/services/impactService";

interface NgoDirectoryItem {
  id: string;
  display_name: string;
  location: string | null;
  verification_status: string;
  details?: {
    description: string | null;
    sector: string | null;
    contact_info: string | null;
  };
}

interface NgoMatch {
  ngo: NgoDirectoryItem;
  score: number;
  reasons: string[];
}

type CommunityTab = "discover" | "create" | "activity";
type CreateMode = "request" | "offer";

const INITIAL_FILTER: CommunityFilter = {
  feedType: "all",
  category: "",
  location: "",
  urgency: "all",
  query: "",
};

export default function Community() {
  const { profile, userId } = useAuthProfile();
  const { t } = useLanguage();
  const [createMode, setCreateMode] = useState<CreateMode>("request");
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [recommended, setRecommended] = useState<CommunityPost[]>([]);
  const [ngoDirectory, setNgoDirectory] = useState<NgoDirectoryItem[]>([]);
  const [lastRequest, setLastRequest] = useState<RequestFormValues | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [filter, setFilter] = useState(INITIAL_FILTER);
  const accountType = profile ? ("user_type" in profile ? profile.user_type : (profile as { role?: string }).role) : null;
  const canPostRequest = accountType === "ngo" || accountType === "individual";
  const canPostOffer = accountType === "ngo" || accountType === "individual";

  const navigate = useNavigate();

  const refresh = async () => {
    setLoading(true);
    try {
      const [feed, saved, suggestions, directory] = await Promise.all([
        getCommunityFeed(),
        getSavedPosts(),
        getRecommendations(),
        getNgoDirectory(),
      ]);
      setPosts(feed);
      setSavedKeys(new Set(saved.map((post) => `${post.postType}:${post.id}`)));
      setRecommended(suggestions);
      setNgoDirectory(directory as NgoDirectoryItem[]);
    } catch (error: any) {
      toast.error(error.message || t("community.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (accountType === "individual") {
      setCreateMode("offer");
      return;
    }

    if (accountType === "ngo") {
      setCreateMode("request");
    }
  }, [accountType]);
  const normalize = (value: string) => value.toLowerCase().trim();

  const buildNgoMatches = (request: RequestFormValues, directory: NgoDirectoryItem[]): NgoMatch[] => {
    const requestLocation = normalize(request.location);
    const requestCategory = normalize(request.category);
    const requestDescription = normalize(request.description);
    const requestTitle = normalize(request.title);
    const skillTerms = request.skillsNeeded
      .split(",")
      .map((item) => normalize(item))
      .filter(Boolean);

    return directory
      .map((ngo) => {
        const sector = normalize(ngo.details?.sector || "");
        const description = normalize(ngo.details?.description || "");
        const ngoLocation = normalize(ngo.location || "");
        const searchText = `${ngo.display_name} ${ngo.location || ""} ${ngo.details?.sector || ""} ${ngo.details?.description || ""}`.toLowerCase();

        let score = 0;
        const reasons: string[] = [];

        if (requestLocation && ngoLocation && requestLocation === ngoLocation) {
          score += 3;
          reasons.push("Same location");
        }

        if (requestCategory && sector && (sector.includes(requestCategory) || requestCategory.includes(sector))) {
          score += 4;
          reasons.push("Sector match");
        }

        const matchedSkills = skillTerms.filter((skill) => skill && searchText.includes(skill));
        if (matchedSkills.length > 0) {
          score += matchedSkills.length * 2;
          reasons.push(`Skills match: ${matchedSkills.slice(0, 2).join(", ")}`);
        }

        const keywordMatches = [requestTitle, requestDescription]
          .filter(Boolean)
          .some((term) => sector.includes(term) || description.includes(term));

        if (keywordMatches) {
          score += 1;
          reasons.push("Context match");
        }

        if (ngo.verification_status === "verified") {
          score += 1;
          reasons.push("Verified NGO");
        }

        if (score === 0) {
          reasons.push("Broader network match");
        }

        return { ngo, score, reasons };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  };

  const filtered = useMemo(() => {
    return posts.filter((post) => {
      if (filter.feedType !== "all" && post.postType !== filter.feedType) return false;
      if (filter.category && !post.category.toLowerCase().includes(filter.category.toLowerCase())) return false;
      if (filter.location && !post.location.toLowerCase().includes(filter.location.toLowerCase())) return false;
      if (filter.urgency !== "all" && post.urgency !== filter.urgency) return false;

      const q = filter.query.toLowerCase().trim();
      if (!q) return true;
      return (
        post.title.toLowerCase().includes(q) ||
        post.description.toLowerCase().includes(q) ||
        post.ownerName.toLowerCase().includes(q)
      );
    });
  }, [posts, filter]);

  const requestMatches = useMemo(() => {
    const latestRequestPost = [...posts]
      .filter((post) => post.ownerId === userId && post.postType === "ngo_request")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    const latestRequest =
      lastRequest ||
      (latestRequestPost
        ? {
            title: latestRequestPost.title,
            description: latestRequestPost.description,
            category: latestRequestPost.category,
            urgency: latestRequestPost.urgency as RequestFormValues["urgency"],
            location: latestRequestPost.location,
            volunteersNeeded: 1,
            fundingAmount: latestRequestPost.fundingAmount || 0,
            skillsNeeded: latestRequestPost.category,
            deadline: "",
            contactMethod: "",
          }
        : null);

    if (!canPostRequest || !latestRequest) return [] as NgoMatch[];

    return buildNgoMatches(
      {
        title: latestRequest.title,
        description: latestRequest.description,
        category: latestRequest.category,
        urgency: latestRequest.urgency as RequestFormValues["urgency"],
        location: latestRequest.location,
        volunteersNeeded: 1,
        fundingAmount: latestRequest.fundingAmount,
        skillsNeeded: latestRequest.category,
        deadline: "",
        contactMethod: "",
      },
      ngoDirectory,
    );
  }, [canPostRequest, lastRequest, ngoDirectory, posts, userId]);

  const latestRequestPost = useMemo(() => {
    return [...posts]
      .filter((post) => post.ownerId === userId && post.postType === "ngo_request")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;
  }, [posts, userId]);

  const effectiveRequestId = lastRequestId || latestRequestPost?.id || null;

  const myPosts = useMemo(() => {
    return [...posts]
      .filter((post) => post.ownerId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [posts, userId]);

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
      toast.error(error.message || "Could not update saved post.");
    }
  };

  const handleRespond = async (post: CommunityPost) => {
    if (!profile) return;

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

  const handleCreateRequest = async (values: RequestFormValues) => {
    try {
      await createNgoRequest(values);
      toast.success("Request created.");
      await refresh();
    } catch (error: any) {
      toast.error(error.message || t("community.couldNotCreateRequest"));
    }
  };

  const handleCreateOffer = async (values: OfferFormValues) => {
    try {
      await createVolunteerOffer(values);
      toast.success("Offer created.");
      await refresh();
    } catch (error: any) {
      toast.error(error.message || t("community.couldNotCreateOffer"));
    }
  };

  const handleEdit = async (post: CommunityPost) => {
    const title = window.prompt(t("community.editTitle"), post.title);
    if (!title) return;
    const description = window.prompt(t("community.editDescription"), post.description);
    if (!description) return;

    try {
      if (post.postType === "ngo_request") {
        await updateNgoRequest(post.id, { title, description });
      } else {
        await updateVolunteerOffer(post.id, { title, description });
      }
      toast.success(t("community.updatePostSuccess"));
      await refresh();
    } catch (error: any) {
      toast.error(error.message || t("community.couldNotUpdatePost"));
    }
  };

  const handleMarkClosed = async (post: CommunityPost) => {
    try {
      if (post.postType === "ngo_request") {
        await updateNgoRequest(post.id, { status: "fulfilled" });
      } else {
        await updateVolunteerOffer(post.id, { status: "unavailable" });
      }
      toast.success(t("community.updateStatusSuccess"));
      await refresh();
    } catch (error: any) {
      toast.error(error.message || t("community.couldNotUpdateStatus"));
    }
  };

  const handleDelete = async (post: CommunityPost) => {
    const confirmed = window.confirm(t("community.deleteConfirm"));
    if (!confirmed) return;

    try {
      if (post.postType === "ngo_request") {
        await deleteNgoRequest(post.id);
      } else {
        await deleteVolunteerOffer(post.id);
      }
      toast.success(t("community.deletePostSuccess"));
      await refresh();
    } catch (error: any) {
      toast.error(error.message || t("community.couldNotDeletePost"));
    }
  };

  const canRespondTo = (post: CommunityPost) => {
    if (!profile) return false;
    if (post.ownerId === userId) return false;

    if (accountType === "ngo") return post.postType === "volunteer_offer";
    return post.postType === "ngo_request";
  };

  const handleContactNgo = async (ngo: NgoDirectoryItem) => {
    if (!effectiveRequestId) {
      toast.error("Create a request first to contact matching NGOs.");
      return;
    }

    const message = window.prompt(
      `Write a short message to ${ngo.display_name}`,
      lastRequest ? `Hi, we need support for ${lastRequest.title}.` : "Hi, we would like to connect with your team.",
    );

    if (!message) return;

    try {
      await addConnection({
        requestId: effectiveRequestId,
        receiverId: ngo.id,
        message,
      });
      toast.success(`Message sent to ${ngo.display_name}.`);
    } catch (error: any) {
      toast.error(error.message || "Could not contact this NGO.");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Community Connections</h1>
          <p className="text-sm text-muted-foreground mt-1">NGOs needing help, volunteer offers, and public collaboration feed.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {canPostRequest && <RequestFormDialog onSubmit={handleCreateRequest} triggerLabel="Request Help" />}
          {canPostOffer && <OfferFormDialog onSubmit={handleCreateOffer} triggerLabel="Offer Help" />}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <PostFilters value={filter} onChange={setFilter} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recommended for you</CardTitle>
        </CardHeader>
        <CardContent>
          {recommended.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recommendations yet. Complete your profile to improve matches.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recommended.map((item) => (
                <Badge key={`${item.postType}:${item.id}`} variant="outline">
                  {item.title}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">Loading community posts...</CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">No posts match your filters.</CardContent>
          </Card>
        ) : (
          filtered.map((post) => {
            const key = `${post.postType}:${post.id}`;
            return (
              <PostCard
                key={key}
                post={post}
                canRespond={canRespondTo(post)}
                isOwner={post.ownerId === userId}
                isSaved={savedKeys.has(key)}
                respondLabel={undefined}
                onSave={handleSave}
                onRespond={handleRespond}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onMarkClosed={handleMarkClosed}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
