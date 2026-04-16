import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getNgoDirectory, getVolunteerDirectory } from "@/services/impactService";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { getMockSession, setMockAvailability } from "@/lib/mockAuth";

interface VolunteerDirectoryItem {
  id: string;
  display_name: string;
  location: string | null;
  verification_status: string;
  details?: {
    skills: string[];
    interests: string[];
    availability: string | null;
  };
}

interface NgoOpportunityItem {
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

export default function VolunteerDirectory() {
  const { profile } = useAuthProfile();

  const [query, setQuery] = useState("");
  const [volunteers, setVolunteers] = useState<VolunteerDirectoryItem[]>([]);
  const [ngoItems, setNgoItems] = useState<NgoOpportunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableForNgo, setAvailableForNgoState] = useState(false);

  const isIndividual = profile?.role === "individual";
  const session = getMockSession();

  const refresh = async () => {
    setLoading(true);
    try {
      if (isIndividual) {
        const data = await getNgoDirectory();
        setNgoItems(data as NgoOpportunityItem[]);
      } else {
        const data = await getVolunteerDirectory();
        setVolunteers(data as VolunteerDirectoryItem[]);
      }

      setAvailableForNgoState(getMockSession()?.availableForNgo ?? false);
    } catch (error: any) {
      toast.error(error.message || "Could not load directory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [isIndividual]);

  const filteredVolunteers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return volunteers;
    return volunteers.filter((item) =>
      [
        item.display_name,
        item.location,
        item.details?.skills?.join(" "),
        item.details?.interests?.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [volunteers, query]);

  const filteredNgos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ngoItems;

    return ngoItems.filter((item) =>
      [item.display_name, item.location, item.details?.sector, item.details?.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [ngoItems, query]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {isIndividual ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold">NGO Opportunities</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Browse NGOs you can volunteer for based on your selected domain.
              </p>
            </div>
            <Button
              variant={availableForNgo ? "default" : "outline"}
              onClick={() => {
                const next = !availableForNgo;
                setMockAvailability(next);
                setAvailableForNgoState(next);
                toast.success(next ? "You are now marked available for NGOs." : "You are marked unavailable.");
              }}
            >
              {availableForNgo ? "Available for NGO" : "Mark Available for NGO"}
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6 text-sm">
              <p><span className="font-medium">Selected domain:</span> {session?.volunteeringDomain || "Not selected"}</p>
              <p className="text-muted-foreground mt-1">Status: {availableForNgo ? "Available" : "Unavailable"}</p>
            </CardContent>
          </Card>

          <Input placeholder="Search NGOs by cause, location, name..." value={query} onChange={(e) => setQuery(e.target.value)} />

          {loading ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Loading NGO opportunities...</CardContent></Card>
          ) : filteredNgos.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No NGOs found.</CardContent></Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {filteredNgos.map((ngo) => (
                <Card key={ngo.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{ngo.display_name}</CardTitle>
                      <Badge variant="outline">{ngo.verification_status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p><span className="font-medium">Domain:</span> {ngo.details?.sector || "General"}</p>
                    <p><span className="font-medium">Location:</span> {ngo.location || "Not set"}</p>
                    <p><span className="font-medium">Contact:</span> {ngo.details?.contact_info || "Not set"}</p>
                    <p className="text-muted-foreground line-clamp-2">{ngo.details?.description || "No description"}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/profile/${ngo.id}`}>View Profile</Link>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => toast.success(`You offered to help ${ngo.display_name}.`)}
                      >
                        Help this NGO
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold">Volunteer Directory</h1>
            <p className="text-sm text-muted-foreground mt-1">Find individuals by skills, location, and cause interests.</p>
          </div>

          <Input placeholder="Search volunteers by name, skill, location..." value={query} onChange={(e) => setQuery(e.target.value)} />

          {loading ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Loading volunteers...</CardContent></Card>
          ) : filteredVolunteers.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No volunteers found.</CardContent></Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {filteredVolunteers.map((volunteer) => (
                <Card key={volunteer.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{volunteer.display_name}</CardTitle>
                      <Badge variant="outline">{volunteer.verification_status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p><span className="font-medium">Location:</span> {volunteer.location || "Not set"}</p>
                    <p><span className="font-medium">Availability:</span> {volunteer.details?.availability || "Not set"}</p>
                    <p className="text-muted-foreground line-clamp-2">Skills: {(volunteer.details?.skills || []).join(", ") || "Not set"}</p>
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/profile/${volunteer.id}`}>View Profile</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
