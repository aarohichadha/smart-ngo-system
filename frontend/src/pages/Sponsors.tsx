import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getProfileByUserId, getSponsorMatchesForNgo, addConnection } from "@/services/impactService";
import type { NgoProfile, SponsorMatch } from "@/types/impact";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building2, Mail, Phone, MapPin, RefreshCw, Sparkles, ExternalLink, Handshake } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

function scoreTone(score: number) {
  if (score >= 80) return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  if (score >= 60) return "bg-blue-500/15 text-blue-700 border-blue-500/30";
  if (score >= 40) return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  return "bg-slate-500/15 text-slate-700 border-slate-500/30";
}

type SponsorshipRequestForm = {
  cause: string;
  fundingNeeded: string;
  previousWorkExperience: string;
  note: string;
};

const INITIAL_SPONSORSHIP_REQUEST: SponsorshipRequestForm = {
  cause: "",
  fundingNeeded: "",
  previousWorkExperience: "",
  note: "",
};

export default function Sponsors() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ngoProfile, setNgoProfile] = useState<NgoProfile | null>(null);
  const [matches, setMatches] = useState<SponsorMatch[]>([]);
  const [selectedSponsor, setSelectedSponsor] = useState<SponsorMatch | null>(null);
  const [requestForm, setRequestForm] = useState<SponsorshipRequestForm>(INITIAL_SPONSORSHIP_REQUEST);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const summary = useMemo(() => {
    const focusArea = ngoProfile?.work_area || ngoProfile?.sector || ngoProfile?.description || "your NGO profile";
    return focusArea;
  }, [ngoProfile]);

  const portalMatches = useMemo(() => matches.filter((sponsor) => sponsor.portal_status === "registered"), [matches]);
  const externalMatches = useMemo(() => matches.filter((sponsor) => sponsor.portal_status === "external"), [matches]);

  const loadMatches = async () => {
    if (!user || user.userType !== "ngo") {
      setLoading(false);
      return;
    }

    try {
      setRefreshing(true);
      const [profilePayload, sponsorMatches] = await Promise.all([
        getProfileByUserId(user.id),
        getSponsorMatchesForNgo(user.id),
      ]);

      setNgoProfile(profilePayload.ngoProfile as NgoProfile | null);
      setMatches(sponsorMatches);
    } catch (error: any) {
      console.error("Failed to load sponsor matches:", error);
      toast.error(error?.message || "Could not load sponsor matches.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.userType]);

  const openConnectForm = (sponsor: SponsorMatch) => {
    if (!sponsor.connect_available) return;
    setSelectedSponsor(sponsor);
    setRequestForm(INITIAL_SPONSORSHIP_REQUEST);
  };

  const closeConnectForm = () => {
    if (submittingRequest) return;
    setSelectedSponsor(null);
    setRequestForm(INITIAL_SPONSORSHIP_REQUEST);
  };

  const handleRequestSubmit = async () => {
    if (!selectedSponsor) return;

    const fundingNeeded = Number(requestForm.fundingNeeded);
    if (!requestForm.cause.trim() || !requestForm.previousWorkExperience.trim() || !Number.isFinite(fundingNeeded) || fundingNeeded <= 0) {
      toast.error("Please add a cause, a valid funding amount, and your previous work experience.");
      return;
    }

    setSubmittingRequest(true);
    try {
      await addConnection({
        receiverId: selectedSponsor.id,
        message: JSON.stringify(
          {
            type: "sponsorship_request",
            ngoName: ngoProfile?.ngo_name || "Our NGO",
            ngoLocation: ngoProfile?.location || "",
            ngoFocus: summary,
            cause: requestForm.cause.trim(),
            fundingNeeded,
            previousWorkExperience: requestForm.previousWorkExperience.trim(),
            note: requestForm.note.trim(),
            requestedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      });

      toast.success(`Sponsorship request sent to ${selectedSponsor.display_name}.`);
      closeConnectForm();
    } catch (error: any) {
      toast.error(error?.message || "Could not send the sponsorship request.");
    } finally {
      setSubmittingRequest(false);
    }
  };

  if (!user || user.userType !== "ngo") {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Sponsor matching is available for NGO accounts only.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-primary font-medium">
            <Handshake className="h-4 w-4" />
            {t("nav.sponsors")}
          </div>
          <h1 className="text-3xl font-bold text-foreground mt-1">{t("sponsors.title")}</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl">{t("sponsors.subtitle")}</p>
        </div>
        <Button onClick={() => void loadMatches()} disabled={loading || refreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading || refreshing ? "animate-spin" : ""}`} />
          {t("sponsors.refresh")}
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("sponsors.criteria")}
          </CardTitle>
          <Badge variant="secondary">{ngoProfile?.location || t("common.unknown")}</Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{summary || t("sponsors.noProfile")}</p>
          <p>{t("sponsors.summary")}</p>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">{t("sponsors.loading")}</CardContent>
        </Card>
      ) : matches.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">{t("sponsors.noMatches")}</CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">{t("sponsors.portalSection")}</h2>
              <Badge variant="secondary">{portalMatches.length}</Badge>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {portalMatches.map((sponsor) => (
                <SponsorCard key={sponsor.id} sponsor={sponsor} ngoProfile={ngoProfile} onConnect={openConnectForm} scoreTone={scoreTone} t={t} />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">{t("sponsors.externalSection")}</h2>
              <Badge variant="outline">{externalMatches.length}</Badge>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {externalMatches.map((sponsor) => (
                <SponsorCard key={sponsor.id} sponsor={sponsor} ngoProfile={ngoProfile} onConnect={openConnectForm} scoreTone={scoreTone} t={t} />
              ))}
            </div>
          </div>
        </div>
      )}

      <Dialog open={Boolean(selectedSponsor)} onOpenChange={(open) => (!open ? closeConnectForm() : null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request sponsorship from {selectedSponsor?.display_name || "this sponsor"}</DialogTitle>
            <DialogDescription>
              Share the context for your request so the sponsor can review it directly in their portal.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleRequestSubmit();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="sponsorship-cause">Cause for sponsorship</Label>
              <Textarea
                id="sponsorship-cause"
                value={requestForm.cause}
                onChange={(event) => setRequestForm((prev) => ({ ...prev, cause: event.target.value }))}
                placeholder="Explain the initiative or need that requires sponsorship"
                rows={3}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sponsorship-funding-needed">Fund needed</Label>
                <Input
                  id="sponsorship-funding-needed"
                  type="number"
                  min="1"
                  step="1"
                  value={requestForm.fundingNeeded}
                  onChange={(event) => setRequestForm((prev) => ({ ...prev, fundingNeeded: event.target.value }))}
                  placeholder="50000"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sponsorship-ngo">NGO</Label>
                <Input id="sponsorship-ngo" value={ngoProfile?.ngo_name || "Our NGO"} disabled />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sponsorship-experience">Previous work experiences</Label>
              <Textarea
                id="sponsorship-experience"
                value={requestForm.previousWorkExperience}
                onChange={(event) => setRequestForm((prev) => ({ ...prev, previousWorkExperience: event.target.value }))}
                placeholder="Briefly describe similar work, partnerships, or impact experience"
                rows={4}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sponsorship-note">Additional note</Label>
              <Textarea
                id="sponsorship-note"
                value={requestForm.note}
                onChange={(event) => setRequestForm((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="Optional context for the sponsor"
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeConnectForm} disabled={submittingRequest}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingRequest}>
                {submittingRequest ? "Sending..." : "Send request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SponsorCard({
  sponsor,
  onConnect,
  scoreTone,
  t,
}: {
  sponsor: SponsorMatch;
  ngoProfile: NgoProfile | null;
  onConnect: (sponsor: SponsorMatch) => void;
  scoreTone: (score: number) => string;
  t: (key: string) => string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              {sponsor.display_name}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{sponsor.organization}</p>
          </div>
          <Badge className={scoreTone(sponsor.match_score)} variant="outline">
            {sponsor.match_score}/100
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {sponsor.portal_status === "registered" ? (
            <Badge variant="secondary">{t("sponsors.portalReady")}</Badge>
          ) : (
            <Badge variant="outline">{t("sponsors.externalOnly")}</Badge>
          )}
          {sponsor.match_source === "gemini" ? <Badge variant="outline">{t("sponsors.aiSuggested")}</Badge> : null}
          <Badge variant="outline">{sponsor.location}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground/90">{sponsor.description}</p>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {sponsor.location}
          </p>
          <p className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            {sponsor.email || t("sponsors.notAvailable")}
          </p>
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            {sponsor.contact_number || t("sponsors.notAvailable")}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            {t("sponsors.focusAreas")}
          </p>
          <div className="flex flex-wrap gap-2">
            {sponsor.focus_areas.map((area) => (
              <Badge key={area} variant="outline">
                {area}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground mb-1">{t("sponsors.matchReason")}</p>
          <p className="text-muted-foreground">{sponsor.match_reason}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {sponsor.connect_available ? (
            <Button onClick={() => onConnect(sponsor)} className="gap-2">
              <ExternalLink className="h-4 w-4" />
              {t("sponsors.connect")}
            </Button>
          ) : (
            <Button variant="outline" disabled>
              {t("sponsors.detailsOnly")}
            </Button>
          )}
          {sponsor.website ? (
            <Button variant="ghost" asChild>
              <a href={sponsor.website} target="_blank" rel="noreferrer" className="gap-2 inline-flex items-center">
                <ExternalLink className="h-4 w-4" />
                {t("sponsors.website")}
              </a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
