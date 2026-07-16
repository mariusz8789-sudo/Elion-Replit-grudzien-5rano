import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Boxes, MapPin, Calendar, Package, Send, Loader2, Bell, X, Handshake } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { CapacityPosting, CapacityBooking, RecurringRouteSubscription } from "@shared/schema";
import PaymentDialog from "@/components/PaymentDialog";

export default function CapacityMarketplace() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [temperatureControlled, setTemperatureControlled] = useState(false);
  const [adrCapable, setAdrCapable] = useState(false);
  const [tailLift, setTailLift] = useState(false);
  const [searched, setSearched] = useState(false);

  const [activePosting, setActivePosting] = useState<CapacityPosting | null>(null);
  const [claimMode, setClaimMode] = useState(false);
  const [volumeM3, setVolumeM3] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [palletSpaces, setPalletSpaces] = useState("");

  const { data: results = [], isFetching, refetch } = useQuery<CapacityPosting[]>({
    queryKey: ["/api/capacity-postings", from, to, date, temperatureControlled, adrCapable, tailLift],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (date) params.set("date", new Date(date).toISOString());
      if (temperatureControlled) params.set("temperatureControlled", "true");
      if (adrCapable) params.set("adrCapable", "true");
      if (tailLift) params.set("tailLift", "true");
      const res = await fetch(`/api/capacity-postings?${params.toString()}`);
      return res.ok ? res.json() : [];
    },
    enabled: false,
  });

  const { data: mySubscriptions = [] } = useQuery<RecurringRouteSubscription[]>({
    queryKey: [`/api/companies/${user?.companyId}/route-subscriptions`],
    enabled: !!user?.companyId,
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/route-subscriptions", { fromAddress: from, toAddress: to });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to subscribe");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${user?.companyId}/route-subscriptions`] });
      toast({ title: t("Subscribed"), description: t("You'll be notified when a matching recurring route is published.") });
    },
    onError: (error: any) => toast({ title: t("Could not subscribe"), description: error.message, variant: "destructive" }),
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/route-subscriptions/${id}`, {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/companies/${user?.companyId}/route-subscriptions`] }),
  });

  const { data: myRequests = [] } = useQuery<CapacityBooking[]>({
    queryKey: ["/api/users", user?.id, "capacity-bookings"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user!.id}/capacity-bookings`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!user,
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      const endpoint = claimMode
        ? `/api/capacity-postings/${activePosting!.id}/claim`
        : `/api/capacity-postings/${activePosting!.id}/requests`;
      const res = await apiRequest("POST", endpoint, {
        volumeM3, weightKg, palletSpaces: palletSpaces ? Number(palletSpaces) : 0,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to request capacity");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", user?.id, "capacity-bookings"] });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${user?.companyId}/capacity-claims`] });
      setActivePosting(null);
      setVolumeM3(""); setWeightKg(""); setPalletSpaces("");
      toast({
        title: claimMode ? t("Claim sent") : t("Request sent"),
        description: claimMode ? t("The publishing company will confirm your claim.") : t("The carrier will confirm your request."),
      });
    },
    onError: (error: any) => {
      toast({ title: claimMode ? t("Could not claim capacity") : t("Could not request capacity"), description: error.message, variant: "destructive" });
    },
  });

  const { data: myClaims = [] } = useQuery<CapacityBooking[]>({
    queryKey: [`/api/companies/${user?.companyId}/capacity-claims`],
    enabled: !!user?.companyId,
  });

  const handleSearch = () => {
    setSearched(true);
    refetch();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-lg"><Boxes className="w-8 h-8 text-primary" /></div>
        <div>
          <h1 className="text-3xl font-bold">{t("Spare Capacity Marketplace")}</h1>
          <p className="text-muted-foreground">{t("Find leftover space on a route a carrier is already driving")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Search")}</CardTitle>
          <CardDescription>{t("Match your cargo to a carrier's spare capacity")}</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-4">
          <div>
            <Label>{t("From")}</Label>
            <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Barcelona" data-testid="input-search-from" />
          </div>
          <div>
            <Label>{t("To")}</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Warsaw" data-testid="input-search-to" />
          </div>
          <div>
            <Label>{t("Date")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-search-date" />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={handleSearch} disabled={isFetching} data-testid="button-search-capacity">
              {isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t("Search")}
            </Button>
          </div>
          <div className="md:col-span-4 flex flex-wrap gap-6 pt-2">
            <div className="flex items-center gap-2">
              <Switch id="filter-temp" checked={temperatureControlled} onCheckedChange={setTemperatureControlled} data-testid="switch-filter-temperature" />
              <Label htmlFor="filter-temp">{t("Temperature controlled")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="filter-adr" checked={adrCapable} onCheckedChange={setAdrCapable} data-testid="switch-filter-adr" />
              <Label htmlFor="filter-adr">{t("ADR capable")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="filter-lift" checked={tailLift} onCheckedChange={setTailLift} data-testid="switch-filter-tail-lift" />
              <Label htmlFor="filter-lift">{t("Tail lift")}</Label>
            </div>
          </div>
          {user?.companyId && (
            <div className="md:col-span-4 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => subscribeMutation.mutate()}
                disabled={!from || !to || subscribeMutation.isPending}
                data-testid="button-subscribe-route"
              >
                <Bell className="w-4 h-4 mr-2" />{t("Subscribe to this route")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {user?.companyId && mySubscriptions.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t("My Route Subscriptions")}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {mySubscriptions.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm p-2 border rounded-md" data-testid={`row-subscription-${s.id}`}>
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.fromAddress} &rarr; {s.toAddress}</span>
                <Button size="icon" variant="ghost" onClick={() => unsubscribeMutation.mutate(s.id)} data-testid={`button-unsubscribe-${s.id}`}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {searched && (
        <div className="space-y-3">
          {results.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">{t("No matching spare capacity found for this route/date.")}</CardContent></Card>
          ) : (
            results.map((p) => (
              <Card key={p.id} data-testid={`card-capacity-result-${p.id}`}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium flex items-center gap-1"><MapPin className="w-4 h-4" />{p.fromAddress} &rarr; {p.toAddress}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-3">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(p.departureWindowStart).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1"><Package className="w-3 h-3" />{p.freeVolumeM3} m&sup3; &middot; {p.freeWeightKg} kg &middot; {p.freePalletSpaces} pallets</span>
                      {p.pricePerM3Eur && <span>&euro;{p.pricePerM3Eur}/m&sup3;</span>}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.isRecurring && <Badge variant="secondary" className="text-xs">{t("Recurring")} ({p.recurrencePattern})</Badge>}
                      {p.temperatureControlled && <Badge variant="outline" className="text-xs">{t("Temp. controlled")}</Badge>}
                      {p.adrCapable && <Badge variant="outline" className="text-xs">ADR</Badge>}
                      {p.tailLift && <Badge variant="outline" className="text-xs">{t("Tail lift")}</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button size="sm" onClick={() => { setActivePosting(p); setClaimMode(false); }} data-testid={`button-request-capacity-${p.id}`}>
                      <Send className="w-4 h-4 mr-2" />{t("Request")}
                    </Button>
                    {user?.companyId && user.companyId !== p.companyId && (
                      <Button size="sm" variant="outline" onClick={() => { setActivePosting(p); setClaimMode(true); }} data-testid={`button-claim-capacity-${p.id}`}>
                        <Handshake className="w-4 h-4 mr-2" />{t("Claim for my company")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {user?.companyId && myClaims.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("My Network Claims")}</CardTitle>
            <CardDescription>{t("Return Trip Marketplace claims your company has made on other companies' spare capacity.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {myClaims.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm p-2 border rounded-md gap-2 flex-wrap" data-testid={`row-my-capacity-claim-${c.id}`}>
                <span>{c.volumeM3} m&sup3; / {c.weightKg} kg &middot; &euro;{c.priceEur}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={c.status === "accepted" ? "default" : c.status === "pending" ? "secondary" : "destructive"}>{c.status}</Badge>
                  {c.status === "accepted" && c.paymentStatus !== "captured" && (
                    <PaymentDialog
                      capacityBookingId={c.id}
                      amount={c.priceEur}
                      paymentStatus={c.paymentStatus ?? undefined}
                      onPaid={() => queryClient.invalidateQueries({ queryKey: [`/api/companies/${user.companyId}/capacity-claims`] })}
                    />
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {user && myRequests.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t("My Requests")}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {myRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm p-2 border rounded-md" data-testid={`row-my-capacity-request-${r.id}`}>
                <span>{r.volumeM3} m&sup3; / {r.weightKg} kg &middot; &euro;{r.priceEur}</span>
                <Badge variant={r.status === "accepted" ? "default" : r.status === "pending" ? "secondary" : "destructive"}>{r.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!activePosting} onOpenChange={(open) => !open && setActivePosting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{claimMode ? t("Claim capacity for my company") : t("Request capacity")}</DialogTitle>
            <DialogDescription>{activePosting?.fromAddress} &rarr; {activePosting?.toAddress}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("Volume needed (m³)")}</Label>
              <Input type="number" step="0.1" value={volumeM3} onChange={(e) => setVolumeM3(e.target.value)} data-testid="input-request-volume" />
            </div>
            <div>
              <Label>{t("Weight (kg)")}</Label>
              <Input type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} data-testid="input-request-weight" />
            </div>
            <div>
              <Label>{t("Pallet spaces")}</Label>
              <Input type="number" value={palletSpaces} onChange={(e) => setPalletSpaces(e.target.value)} data-testid="input-request-pallets" />
            </div>
            <Button
              className="w-full"
              onClick={() => requestMutation.mutate()}
              disabled={!volumeM3 || !weightKg || requestMutation.isPending}
              data-testid="button-confirm-request-capacity"
            >
              {claimMode ? t("Send Claim") : t("Send Request")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
