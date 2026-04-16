import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getNgoDirectory } from "@/services/impactService";

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

export default function NgoDirectory() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<NgoDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await getNgoDirectory();
      setItems(data as NgoDirectoryItem[]);
    } catch (error: any) {
      toast.error(error.message || "Could not load NGO directory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.display_name, item.location, item.details?.sector, item.details?.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">NGO Directory</h1>
        <p className="text-sm text-muted-foreground mt-1">Browse NGOs, discover causes, and connect directly.</p>
      </div>

      <Input placeholder="Search NGOs by name, location, sector..." value={query} onChange={(e) => setQuery(e.target.value)} />

      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Loading NGOs...</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No NGOs found.</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((ngo) => (
            <Card key={ngo.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{ngo.display_name}</CardTitle>
                  <Badge variant="outline">{ngo.verification_status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="font-medium">Sector:</span> {ngo.details?.sector || "Not set"}</p>
                <p><span className="font-medium">Location:</span> {ngo.location || "Not set"}</p>
                <p className="text-muted-foreground line-clamp-2">{ngo.details?.description || "No description"}</p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/profile/${ngo.id}`}>View Profile</Link>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => toast.success(`Interest sent to help ${ngo.display_name}.`)}
                  >
                    Help this NGO
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
