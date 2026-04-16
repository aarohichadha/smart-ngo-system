import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { getSavedPosts, savePost, unsavePost } from "@/services/impactService";
import { PostCard } from "@/components/community/PostCard";
import type { CommunityPost } from "@/types/impact";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Saved() {
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const { t } = useLanguage();

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await getSavedPosts();
      setPosts(data);
    } catch (error: any) {
      toast.error(error.message || t("community.noPostsMatch"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const toggleSave = async (post: CommunityPost) => {
    try {
      await unsavePost(post.postType, post.id);
      toast.success(t("community.saved"));
      refresh();
    } catch {
      await savePost(post.postType, post.id);
      refresh();
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("nav.saved")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("community.subtitle")}</p>
      </div>

      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t("common.loadingDots")}</CardContent></Card>
      ) : posts.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t("community.noPostsMatch")}</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={`${post.postType}:${post.id}`}
              post={post}
              canRespond={false}
              isSaved={true}
              onSave={toggleSave}
            />
          ))}
        </div>
      )}
    </div>
  );
}
