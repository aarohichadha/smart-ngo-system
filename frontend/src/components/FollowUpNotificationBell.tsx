import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addConnection, getConnectionsForMe, updateConnectionStatus } from "@/services/impactService";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import type { ConnectionResponse } from "@/types/impact";

type FollowUpPayload = {
  type?: string;
  parentConnectionId?: string;
  question?: string;
  sponsorName?: string;
  sentAt?: string;
};

const parseFollowUpPayload = (message: string) => {
  try {
    const payload = JSON.parse(message) as FollowUpPayload;
    if (payload.type === "sponsorship_follow_up") {
      return payload;
    }
  } catch {
    return null;
  }
  return null;
};

export function FollowUpNotificationBell() {
  const { profile, userId } = useAuthProfile();
  const [connections, setConnections] = useState<ConnectionResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedFollowUp, setSelectedFollowUp] = useState<{ connection: ConnectionResponse; payload: FollowUpPayload | null } | null>(null);
  const [responseMessage, setResponseMessage] = useState("");
  const [sendingResponse, setSendingResponse] = useState(false);

  const accountType = profile ? ("user_type" in profile ? profile.user_type : (profile as { role?: string }).role) : null;
  const isNgo = accountType === "ngo";

  const refresh = async () => {
    if (!isNgo) return;
    setLoading(true);
    try {
      const rows = await getConnectionsForMe();
      setConnections(rows as ConnectionResponse[]);
    } catch (error: any) {
      toast.error(error.message || "Could not load follow-up notifications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [isNgo]);

  const followUps = useMemo(
    () =>
      connections
        .filter((connection) => connection.receiver_id === userId)
        .map((connection) => ({
          connection,
          payload: parseFollowUpPayload(connection.message),
        }))
        .filter(({ payload }) => Boolean(payload)),
    [connections, userId],
  );

  const unreadCount = followUps.filter(({ connection }) => connection.status === "pending").length;

  const openRespondDialog = (connection: ConnectionResponse, payload: FollowUpPayload | null) => {
    const starter = payload?.question ? `Thanks for your question. ${payload.question}\n\nHere are the details:` : "Thanks for your question. Here are more details:";
    setSelectedFollowUp({ connection, payload });
    setResponseMessage(starter);
  };

  const closeRespondDialog = () => {
    if (sendingResponse) return;
    setSelectedFollowUp(null);
    setResponseMessage("");
  };

  const submitResponse = async () => {
    if (!selectedFollowUp || !responseMessage.trim()) {
      toast.error("Please add your response before sending.");
      return;
    }

    const { connection, payload } = selectedFollowUp;

    setSendingResponse(true);
    try {
      await addConnection({
        requestId: connection.request_id || undefined,
        offerId: connection.offer_id || undefined,
        receiverId: connection.sender_id,
        message: JSON.stringify(
          {
            type: "sponsorship_follow_up_response",
            parentConnectionId: payload?.parentConnectionId || null,
            followUpConnectionId: connection.id,
            response: responseMessage.trim(),
            respondedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      });

      await updateConnectionStatus(connection.id, "completed");
      toast.success("Response sent to sponsor.");
      closeRespondDialog();
      await refresh();
    } catch (error: any) {
      toast.error(error.message || "Could not send response.");
    } finally {
      setSendingResponse(false);
    }
  };

  if (!isNgo) return null;

  return (
    <>
      <Popover open={open} onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          void refresh();
        }
      }}>
        <PopoverTrigger asChild>
          <Button size="icon" variant="outline" className="relative h-9 w-9" aria-label="Follow-up notifications">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[360px] p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Sponsor follow-ups</p>
            <Badge variant="outline">{followUps.length}</Badge>
          </div>

          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading notifications...</p>
          ) : followUps.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No follow-up questions yet.</p>
          ) : (
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {followUps.map(({ connection, payload }) => (
                <div key={connection.id} className="rounded-md border bg-card p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">{payload?.sponsorName || "Sponsor"}</p>
                    <Badge variant="secondary" className="text-[10px]">{connection.status}</Badge>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-line">{payload?.question || connection.message}</p>
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" onClick={() => openRespondDialog(connection, payload || null)}>
                      Respond
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={Boolean(selectedFollowUp)} onOpenChange={(nextOpen) => (!nextOpen ? closeRespondDialog() : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Respond to sponsor follow-up</DialogTitle>
            <DialogDescription>
              Share details or clarifications requested by the sponsor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="ngo-follow-up-response">Your response</Label>
            <Textarea
              id="ngo-follow-up-response"
              value={responseMessage}
              onChange={(event) => setResponseMessage(event.target.value)}
              rows={6}
              placeholder="Add timelines, milestones, or additional context"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeRespondDialog} disabled={sendingResponse}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitResponse()} disabled={sendingResponse}>
              {sendingResponse ? "Sending..." : "Send response"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
