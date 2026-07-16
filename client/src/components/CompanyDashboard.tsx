import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Truck, Users, Package, Star, UserPlus, Send, Loader2, MapPin, Boxes, Wrench, Briefcase, X, BarChart3, Brain, Calendar as CalendarIcon } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { Company, Driver, Vehicle, Booking, CapacityPosting, CapacityBooking, WorkerProfile, Skill, WorkerSkill, CompanyService } from "@shared/schema";
import VehicleManager from "./VehicleManager";
import ReviewsSection from "./ReviewsSection";
import EntityCalendarCard from "./EntityCalendarCard";

function RegisterCompanyCard() {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", taxId: "", licenseNumber: "" });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/companies", form);
      if (!response.ok) throw new Error((await response.json()).message || "Failed to register company");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Company registered", description: "Your company account is now active." });
    },
    onError: (error: any) => {
      toast({ title: "Could not register company", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card className="max-w-xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" />Register your company</CardTitle>
        <CardDescription>Create a company account to manage vehicles, drivers, and bid on shipments.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="cd-name">Company name</Label>
          <Input id="cd-name" data-testid="input-company-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cd-email">Email</Label>
            <Input id="cd-email" type="email" data-testid="input-company-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="cd-phone">Phone</Label>
            <Input id="cd-phone" data-testid="input-company-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <div>
          <Label htmlFor="cd-address">Address</Label>
          <Input id="cd-address" data-testid="input-company-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cd-tax">Tax ID</Label>
            <Input id="cd-tax" data-testid="input-company-tax" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="cd-license">License number</Label>
            <Input id="cd-license" data-testid="input-company-license" value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
          </div>
        </div>
        <Button
          className="w-full"
          onClick={() => registerMutation.mutate()}
          disabled={!form.name || !form.email || !form.phone || registerMutation.isPending}
          data-testid="button-register-company"
        >
          {registerMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Building2 className="w-4 h-4 mr-2" />}
          Register Company
        </Button>
      </CardContent>
    </Card>
  );
}

function DriversTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; phone: string } | null>(null);

  const { data: drivers = [], isLoading } = useQuery<Driver[]>({
    queryKey: ["/api/companies", companyId, "drivers"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${companyId}/drivers`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const lookupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/lookup-for-driver-invite?phone=${encodeURIComponent(phone)}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "User not found");
      return res.json();
    },
    onSuccess: (data) => setFound(data),
    onError: (error: any) => {
      setFound(null);
      toast({ title: "Lookup failed", description: error.message, variant: "destructive" });
    },
  });

  const addDriverMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/drivers", { userId: found!.id, companyId, licenseNumber });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to add driver");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "drivers"] });
      setOpen(false);
      setPhone("");
      setLicenseNumber("");
      setFound(null);
      toast({ title: "Driver added" });
    },
    onError: (error: any) => {
      toast({ title: "Could not add driver", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Drivers</h2>
          <p className="text-sm text-muted-foreground">Invite an existing MoveX user (they must register first) as a driver for your company.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-invite-driver"><UserPlus className="w-4 h-4 mr-2" />Invite Driver</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite a driver</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Driver's phone number" value={phone} onChange={(e) => { setPhone(e.target.value); setFound(null); }} data-testid="input-driver-phone" />
                <Button variant="outline" onClick={() => lookupMutation.mutate()} disabled={!phone || lookupMutation.isPending} data-testid="button-lookup-driver">
                  Find
                </Button>
              </div>
              {found && (
                <div className="text-sm p-3 rounded-md bg-muted" data-testid="text-driver-found">
                  Found: <strong>{found.name}</strong> ({found.phone})
                </div>
              )}
              <div>
                <Label htmlFor="cd-driver-license">License number</Label>
                <Input id="cd-driver-license" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} data-testid="input-driver-license" />
              </div>
              <Button
                className="w-full"
                onClick={() => addDriverMutation.mutate()}
                disabled={!found || !licenseNumber || addDriverMutation.isPending}
                data-testid="button-confirm-add-driver"
              >
                Add Driver
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : drivers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No drivers yet.</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {drivers.map((d) => (
            <Card key={d.id} data-testid={`card-driver-${d.id}`}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">License {d.licenseNumber}</p>
                  <p className="text-sm text-muted-foreground">{Number(d.rating).toFixed(1)} rating &middot; {d.totalDeliveries} deliveries</p>
                </div>
                <Badge variant={d.available ? "default" : "secondary"}>{d.available ? "Available" : "Busy"}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function OpenBookingsTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({ queryKey: ["/api/bookings/public"] });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/vehicles?companyId=${companyId}`);
      return res.ok ? res.json() : [];
    },
  });

  const submitOfferMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await apiRequest("POST", "/api/offers", {
        bookingId,
        companyId,
        price,
        message: message || undefined,
        vehicleId: vehicles[0]?.id,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to submit offer");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Offer submitted" });
      setActiveBookingId(null);
      setPrice("");
      setMessage("");
    },
    onError: (error: any) => {
      toast({ title: "Could not submit offer", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Open Bookings</h2>
        <p className="text-sm text-muted-foreground">Submit a price to bid on a customer's posted shipment.</p>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : bookings.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No open bookings right now.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <Card key={b.id} data-testid={`card-open-booking-${b.id}`}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{b.pickupAddress} &rarr; {b.deliveryAddress}</p>
                  <p className="text-sm text-muted-foreground">{b.estimatedDistance} km &middot; customer budget ${b.totalPrice}</p>
                </div>
                <Dialog open={activeBookingId === b.id} onOpenChange={(o) => setActiveBookingId(o ? b.id : null)}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid={`button-offer-${b.id}`}><Send className="w-4 h-4 mr-2" />Submit Offer</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Submit an offer</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="cd-offer-price">Your price ($)</Label>
                        <Input id="cd-offer-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-offer-price" />
                      </div>
                      <div>
                        <Label htmlFor="cd-offer-message">Message (optional)</Label>
                        <Textarea id="cd-offer-message" value={message} onChange={(e) => setMessage(e.target.value)} data-testid="textarea-offer-message" />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => submitOfferMutation.mutate(b.id)}
                        disabled={!price || submitOfferMutation.isPending}
                        data-testid="button-confirm-offer"
                      >
                        Submit
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CompanyDashboard() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!user) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="p-8 text-center text-muted-foreground">Sign in to manage your company.</CardContent>
      </Card>
    );
  }

  if (!user.companyId) {
    return <RegisterCompanyCard />;
  }

  return <CompanyDashboardTabs companyId={user.companyId} />;
}

function CapacityTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    fromAddress: "", toAddress: "", departureWindowStart: "", departureWindowEnd: "",
    freeVolumeM3: "", freeWeightKg: "", freePalletSpaces: "", pricePerM3Eur: "", minimumPriceEur: "", isReturnLeg: false,
    temperatureControlled: false, adrCapable: false, tailLift: false, truckDimensions: "",
    isRecurring: false, recurrencePattern: "weekly",
  });

  const { data: postings = [], isLoading } = useQuery<CapacityPosting[]>({
    queryKey: ["/api/companies", companyId, "capacity-postings"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${companyId}/capacity-postings`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/capacity-postings", {
        ...form,
        freeVolumeM3: form.freeVolumeM3,
        freeWeightKg: form.freeWeightKg,
        freePalletSpaces: form.freePalletSpaces ? Number(form.freePalletSpaces) : 0,
        pricePerM3Eur: form.pricePerM3Eur || undefined,
        minimumPriceEur: form.minimumPriceEur || undefined,
        truckDimensions: form.truckDimensions || undefined,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to publish");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "capacity-postings"] });
      setOpen(false);
      toast({ title: "Spare capacity published" });
    },
    onError: (error: any) => {
      toast({ title: "Could not publish", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Spare Capacity</h2>
          <p className="text-sm text-muted-foreground">Publish leftover space on a route you're already driving - e.g. "Madrid to Paris, 8m3 free."</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-publish-capacity"><Boxes className="w-4 h-4 mr-2" />Publish Capacity</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Publish spare capacity</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>From</Label>
                  <Input value={form.fromAddress} onChange={(e) => setForm({ ...form, fromAddress: e.target.value })} placeholder="Madrid" data-testid="input-capacity-from" />
                </div>
                <div>
                  <Label>To</Label>
                  <Input value={form.toAddress} onChange={(e) => setForm({ ...form, toAddress: e.target.value })} placeholder="Paris" data-testid="input-capacity-to" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Departure window start</Label>
                  <Input type="datetime-local" value={form.departureWindowStart} onChange={(e) => setForm({ ...form, departureWindowStart: e.target.value })} data-testid="input-capacity-window-start" />
                </div>
                <div>
                  <Label>Departure window end</Label>
                  <Input type="datetime-local" value={form.departureWindowEnd} onChange={(e) => setForm({ ...form, departureWindowEnd: e.target.value })} data-testid="input-capacity-window-end" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Free volume (m³)</Label>
                  <Input type="number" step="0.1" value={form.freeVolumeM3} onChange={(e) => setForm({ ...form, freeVolumeM3: e.target.value })} data-testid="input-capacity-volume" />
                </div>
                <div>
                  <Label>Free weight (kg)</Label>
                  <Input type="number" value={form.freeWeightKg} onChange={(e) => setForm({ ...form, freeWeightKg: e.target.value })} data-testid="input-capacity-weight" />
                </div>
                <div>
                  <Label>Pallet spaces</Label>
                  <Input type="number" value={form.freePalletSpaces} onChange={(e) => setForm({ ...form, freePalletSpaces: e.target.value })} data-testid="input-capacity-pallets" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Price per m³ (EUR, optional)</Label>
                  <Input type="number" step="0.01" value={form.pricePerM3Eur} onChange={(e) => setForm({ ...form, pricePerM3Eur: e.target.value })} data-testid="input-capacity-price-per-m3" />
                </div>
                <div>
                  <Label>Minimum price (EUR, optional)</Label>
                  <Input type="number" step="0.01" value={form.minimumPriceEur} onChange={(e) => setForm({ ...form, minimumPriceEur: e.target.value })} data-testid="input-capacity-min-price" />
                </div>
              </div>
              <div>
                <Label>Truck dimensions (optional)</Label>
                <Input value={form.truckDimensions} onChange={(e) => setForm({ ...form, truckDimensions: e.target.value })} placeholder='L: 6m x W: 2.4m x H: 2.4m' data-testid="input-capacity-dimensions" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="capacity-temp">Temp. controlled</Label>
                  <Switch id="capacity-temp" checked={form.temperatureControlled} onCheckedChange={(v) => setForm({ ...form, temperatureControlled: v })} data-testid="switch-capacity-temperature" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="capacity-adr">ADR capable</Label>
                  <Switch id="capacity-adr" checked={form.adrCapable} onCheckedChange={(v) => setForm({ ...form, adrCapable: v })} data-testid="switch-capacity-adr" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="capacity-lift">Tail lift</Label>
                  <Switch id="capacity-lift" checked={form.tailLift} onCheckedChange={(v) => setForm({ ...form, tailLift: v })} data-testid="switch-capacity-tail-lift" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch id="capacity-recurring" checked={form.isRecurring} onCheckedChange={(v) => setForm({ ...form, isRecurring: v })} data-testid="switch-capacity-recurring" />
                  <Label htmlFor="capacity-recurring">Recurring route</Label>
                </div>
                {form.isRecurring && (
                  <Select value={form.recurrencePattern} onValueChange={(v) => setForm({ ...form, recurrencePattern: v })}>
                    <SelectTrigger className="w-32" data-testid="select-recurrence-pattern"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button
                className="w-full"
                onClick={() => publishMutation.mutate()}
                disabled={!form.fromAddress || !form.toAddress || !form.departureWindowStart || !form.departureWindowEnd || !form.freeVolumeM3 || !form.freeWeightKg || publishMutation.isPending}
                data-testid="button-confirm-publish-capacity"
              >
                Publish
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : postings.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No spare capacity published yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {postings.map((p) => (
            <CapacityPostingRow key={p.id} posting={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function CapacityPostingRow({ posting }: { posting: CapacityPosting }) {
  const { toast } = useToast();

  const { data: requests = [] } = useQuery<CapacityBooking[]>({
    queryKey: ["/api/capacity-postings", posting.id, "requests"],
    queryFn: async () => {
      const res = await fetch(`/api/capacity-postings/${posting.id}/requests`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "accept" | "reject" }) => {
      const res = await apiRequest("PATCH", `/api/capacity-bookings/${id}/${action}`, {});
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capacity-postings", posting.id, "requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies", posting.companyId, "capacity-postings"] });
      toast({ title: "Updated" });
    },
    onError: (error: any) => {
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
    },
  });

  const pendingRequests = requests.filter((r) => r.status === "pending");

  return (
    <Card data-testid={`card-capacity-posting-${posting.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium flex items-center gap-1"><MapPin className="w-4 h-4" />{posting.fromAddress} &rarr; {posting.toAddress}</p>
            <p className="text-sm text-muted-foreground">
              {posting.freeVolumeM3} m&sup3; free &middot; {posting.freeWeightKg} kg &middot; {posting.freePalletSpaces} pallets
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {posting.temperatureControlled && <Badge variant="outline" className="text-xs">Temp. controlled</Badge>}
              {posting.adrCapable && <Badge variant="outline" className="text-xs">ADR capable</Badge>}
              {posting.tailLift && <Badge variant="outline" className="text-xs">Tail lift</Badge>}
              {posting.truckDimensions && <Badge variant="outline" className="text-xs">{posting.truckDimensions}</Badge>}
            </div>
          </div>
          <Badge variant={posting.status === "open" ? "default" : "secondary"}>{posting.status}</Badge>
        </div>
        {pendingRequests.length > 0 && (
          <div className="space-y-2 border-t pt-2">
            {pendingRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm" data-testid={`row-capacity-request-${r.id}`}>
                <span>{r.volumeM3} m&sup3; / {r.weightKg} kg &middot; &euro;{r.priceEur}</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => respondMutation.mutate({ id: r.id, action: "accept" })} data-testid={`button-accept-capacity-${r.id}`}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => respondMutation.mutate({ id: r.id, action: "reject" })} data-testid={`button-reject-capacity-${r.id}`}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CrewMemberCard({ profile }: { profile: WorkerProfile }) {
  const { data: profileSkills = [] } = useQuery<Array<WorkerSkill & { skill: Skill }>>({
    queryKey: [`/api/worker-profiles/${profile.id}/skills`],
  });

  return (
    <div className="p-4 bg-muted rounded-lg space-y-2" data-testid={`crew-member-${profile.id}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={profile.available ? "default" : "secondary"}>{profile.available ? "Available" : "Unavailable"}</Badge>
          <span className="flex items-center gap-1 text-sm"><Star className="w-3 h-3 text-yellow-500" />{Number(profile.rating).toFixed(1)} · {profile.completedJobs} jobs</span>
        </div>
        {profile.hourlyRateEur && <span className="text-sm font-medium">€{profile.hourlyRateEur}/hr</span>}
      </div>
      {profile.bio && <p className="text-sm text-muted-foreground">{profile.bio}</p>}
      <div className="flex flex-wrap gap-1">
        {profileSkills.map((ps) => (
          <Badge key={ps.id} variant="outline" className="text-xs">
            {ps.skill.name} ({ps.experienceLevel})
          </Badge>
        ))}
        {profileSkills.length === 0 && <span className="text-xs text-muted-foreground">No skills listed yet</span>}
      </div>
    </div>
  );
}

interface MatchCrewCandidate {
  profileId: string;
  experienceLevel: string;
  yearsExperience: number | null;
  rating: number;
  completedJobs: number;
  hourlyRateEur: number | null;
  hasRequiredCertification: boolean;
  eligible: boolean;
  ineligibleReason?: string;
  score: number;
}

interface MatchCrewResponse {
  methodology: string;
  results: Record<string, { skillName: string; candidates: MatchCrewCandidate[] }>;
}

function TeamMatchingCard() {
  const { data: allSkills = [] } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [result, setResult] = useState<MatchCrewResponse | null>(null);

  const matchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/skills/match-crew", { requiredSkillIds: selectedSkillIds });
      return res.json() as Promise<MatchCrewResponse>;
    },
    onSuccess: (data) => setResult(data),
  });

  const toggleSkill = (id: string) => {
    setSelectedSkillIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Matching</CardTitle>
        <CardDescription>Pick the skills a job needs - a deterministic scoring engine ranks real, qualified workers (methodology: {result?.methodology ?? "movex-crew-match-v1"})</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
          {allSkills.map((s) => (
            <Badge
              key={s.id}
              variant={selectedSkillIds.includes(s.id) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleSkill(s.id)}
              data-testid={`skill-toggle-${s.id}`}
            >
              {s.name}
            </Badge>
          ))}
        </div>
        <Button onClick={() => matchMutation.mutate()} disabled={selectedSkillIds.length === 0 || matchMutation.isPending} data-testid="button-find-team">
          Find Team
        </Button>

        {result && (
          <div className="space-y-4 pt-2">
            {Object.entries(result.results).map(([skillId, group]) => (
              <div key={skillId} data-testid={`match-group-${skillId}`}>
                <h4 className="font-semibold text-sm mb-2">{group.skillName}</h4>
                {group.candidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No workers with this skill yet.</p>
                ) : (
                  <div className="space-y-1">
                    {group.candidates.map((c) => (
                      <div key={c.profileId} className={`flex items-center justify-between p-2 rounded text-sm ${c.eligible ? "bg-muted" : "bg-destructive/10"}`} data-testid={`candidate-${c.profileId}`}>
                        <span className="flex items-center gap-2">
                          <Badge variant={c.eligible ? "default" : "destructive"} className="text-xs">{c.eligible ? "Eligible" : "Not eligible"}</Badge>
                          {c.experienceLevel} · <Star className="w-3 h-3 text-yellow-500" />{c.rating.toFixed(1)} · {c.completedJobs} jobs
                          {c.hourlyRateEur && ` · €${c.hourlyRateEur}/hr`}
                        </span>
                        <span className="text-xs text-muted-foreground">{c.ineligibleReason || `score ${c.score}`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CrewTab({ companyId }: { companyId: string }) {
  const { data: crew = [], isLoading } = useQuery<WorkerProfile[]>({
    queryKey: [`/api/companies/${companyId}/worker-profiles`],
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wrench className="w-5 h-5" />Crew Directory</CardTitle>
          <CardDescription>Skilled workers affiliated with your company - drivers and staff build their Skills Profile from their own account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <div className="h-24 bg-muted animate-pulse rounded-lg" />}
          {!isLoading && crew.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-crew">
              No crew profiles yet. Ask your drivers and staff to set up their Skills Profile.
            </p>
          )}
          {crew.map((profile) => <CrewMemberCard key={profile.id} profile={profile} />)}
        </CardContent>
      </Card>
      <TeamMatchingCard />
    </div>
  );
}

function ServicesTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const { data: allSkills = [] } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });
  const { data: offered = [], isLoading } = useQuery<Array<CompanyService & { skill: Skill }>>({
    queryKey: [`/api/companies/${companyId}/services`],
  });
  const [skillId, setSkillId] = useState("");
  const [description, setDescription] = useState("");
  const [priceFromEur, setPriceFromEur] = useState("");

  const offeredSkillIds = new Set(offered.map((o) => o.skillId));
  const availableSkills = allSkills.filter((s) => !offeredSkillIds.has(s.id));

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/services`, {
        skillId,
        description: description || undefined,
        priceFromEur: priceFromEur || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/services`] });
      setSkillId("");
      setDescription("");
      setPriceFromEur("");
      toast({ title: "Service added", description: "Customers can now find this offering." });
    },
    onError: (error: any) => {
      toast({ title: "Could not add service", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/company-services/${id}`, {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/services`] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Briefcase className="w-5 h-5" />Professional Services</CardTitle>
        <CardDescription>Declare which professional services your company offers - customers can search and find you by service.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <div className="h-16 bg-muted animate-pulse rounded-lg" />}
        <div className="flex flex-wrap gap-2">
          {offered.map((o) => (
            <Badge key={o.id} variant="secondary" className="flex items-center gap-1 pr-1" data-testid={`offered-service-${o.id}`}>
              {o.skill.name}
              {o.priceFromEur && <span className="text-xs opacity-75">from €{o.priceFromEur}</span>}
              <button
                type="button"
                className="ml-1 rounded-full hover:bg-background/50 p-0.5"
                onClick={() => removeMutation.mutate(o.id)}
                data-testid={`button-remove-service-${o.id}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {!isLoading && offered.length === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="text-no-services">No services listed yet.</p>
          )}
        </div>

        <div className="grid md:grid-cols-4 gap-3 items-end pt-2 border-t">
          <div className="md:col-span-2">
            <Label htmlFor="service-skill">Service</Label>
            <Select value={skillId} onValueChange={setSkillId}>
              <SelectTrigger id="service-skill" data-testid="select-service-skill">
                <SelectValue placeholder="Select a service" />
              </SelectTrigger>
              <SelectContent>
                {availableSkills.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="service-price">From price (€)</Label>
            <Input id="service-price" type="number" step="0.01" value={priceFromEur} onChange={(e) => setPriceFromEur(e.target.value)} data-testid="input-service-price" />
          </div>
          <Button onClick={() => addMutation.mutate()} disabled={!skillId || addMutation.isPending} data-testid="button-add-service">
            Add Service
          </Button>
          <div className="md:col-span-4">
            <Label htmlFor="service-description">Description (optional)</Label>
            <Textarea id="service-description" value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-service-description" rows={2} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface EnterpriseDashboardData {
  crew: { totalWorkers: number; availableWorkers: number; utilizationRate: number; avgRating: number; avgCompletedJobs: number };
  fleet: { totalVehicles: number; availableVehicles: number; vehiclesInActiveUse: number; utilizationRate: number };
  environmental: { totalTrips: number; totalCo2Kg: number; totalCo2SavedKg: number; avgCo2PerTripKg: number };
  bookingRevenueEur: number;
  marketplace: { activeListings: number; totalListedValueEur: number };
  workShare: { activeListings: number; acceptedExchanges: number };
  driverProductivity: Array<{ driverId: string; name: string; totalDeliveries: number; rating: number }>;
  customerLifetimeValue: { avgLifetimeValueEur: number; topCustomers: Array<{ userId: string; name: string; totalSpentEur: number; bookingsCount: number }> };
  partnerApi: { activeKeys: number; lastUsedAt: string | null; webhookDeliveries30d: number; webhookSuccessRate30d: number | null };
}

interface RoadServicesRevenue { revenueEur: number; commissionEur: number; netEur: number; orders: number }

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-4 bg-muted rounded-lg">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function EnterpriseDashboardTab({ companyId }: { companyId: string }) {
  const { data, isLoading } = useQuery<EnterpriseDashboardData>({
    queryKey: [`/api/companies/${companyId}/enterprise-dashboard`],
  });
  const { data: roadRevenue } = useQuery<{ data: RoadServicesRevenue }>({
    queryKey: ["/api/road-services/partners/me/revenue"],
    throwOnError: false,
  });

  if (isLoading || !data) {
    return <div className="h-64 bg-muted animate-pulse rounded-lg" />;
  }

  const insights: string[] = [];
  if (data.crew.totalWorkers > 0 && data.crew.utilizationRate < 50) {
    insights.push(`Only ${data.crew.utilizationRate}% of your crew is currently available - consider recruiting or rebalancing schedules.`);
  }
  if (data.fleet.totalVehicles > 0 && data.fleet.utilizationRate < 30) {
    insights.push(`Fleet utilization is ${data.fleet.utilizationRate}% - idle vehicles could be listed on Spare Capacity or WorkShare.`);
  }
  if (data.environmental.totalCo2SavedKg >= 100) {
    insights.push(`You've saved ${Math.round(data.environmental.totalCo2SavedKg)}kg of CO2 - you likely qualify for the Green Company badge.`);
  }
  if (data.partnerApi.webhookSuccessRate30d != null && data.partnerApi.webhookSuccessRate30d < 90) {
    insights.push(`Partner API webhook success rate is ${data.partnerApi.webhookSuccessRate30d}% over the last 30 days - check your endpoint.`);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Crew Utilization</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Crew" value={String(data.crew.totalWorkers)} />
          <StatCard label="Available" value={String(data.crew.availableWorkers)} />
          <StatCard label="Utilization" value={`${data.crew.utilizationRate}%`} />
          <StatCard label="Avg Rating" value={data.crew.avgRating.toFixed(1)} sub={`${data.crew.avgCompletedJobs} avg jobs`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fleet Utilization</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Vehicles" value={String(data.fleet.totalVehicles)} />
          <StatCard label="Available" value={String(data.fleet.availableVehicles)} />
          <StatCard label="In Active Use" value={String(data.fleet.vehiclesInActiveUse)} />
          <StatCard label="Utilization" value={`${data.fleet.utilizationRate}%`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CO2 / Green Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Trips" value={String(data.environmental.totalTrips)} />
          <StatCard label="CO2 Emitted" value={`${Math.round(data.environmental.totalCo2Kg)}kg`} />
          <StatCard label="CO2 Saved" value={`${Math.round(data.environmental.totalCo2SavedKg)}kg`} />
          <StatCard label="Avg / Trip" value={`${data.environmental.avgCo2PerTripKg.toFixed(1)}kg`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>Booking revenue is gross booking value; marketplace and WorkShare figures are listed/agreed value, not confirmed platform revenue.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Booking Revenue" value={`€${data.bookingRevenueEur.toLocaleString()}`} />
          {roadRevenue?.data && (
            <StatCard label="Road Services Net" value={`€${Math.round(roadRevenue.data.netEur).toLocaleString()}`} sub={`${roadRevenue.data.orders} orders`} />
          )}
          <StatCard label="Marketplace Listed Value" value={`€${data.marketplace.totalListedValueEur.toLocaleString()}`} sub={`${data.marketplace.activeListings} active listings`} />
          <StatCard label="WorkShare Exchanges" value={String(data.workShare.acceptedExchanges)} sub={`${data.workShare.activeListings} active listings`} />
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Driver Productivity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.driverProductivity.length === 0 && <p className="text-sm text-muted-foreground">No drivers yet.</p>}
            {data.driverProductivity.map((d) => (
              <div key={d.driverId} className="flex items-center justify-between text-sm p-2 bg-muted rounded" data-testid={`driver-productivity-${d.driverId}`}>
                <span>{d.name}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {d.totalDeliveries} deliveries · <Star className="w-3 h-3 text-yellow-500" />{d.rating.toFixed(1)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer Lifetime Value</CardTitle>
            <CardDescription>Avg top-customer value: €{data.customerLifetimeValue.avgLifetimeValueEur.toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.customerLifetimeValue.topCustomers.length === 0 && <p className="text-sm text-muted-foreground">No customers yet.</p>}
            {data.customerLifetimeValue.topCustomers.map((c) => (
              <div key={c.userId} className="flex items-center justify-between text-sm p-2 bg-muted rounded" data-testid={`customer-clv-${c.userId}`}>
                <span>{c.name}</span>
                <span className="text-muted-foreground">€{c.totalSpentEur.toLocaleString()} · {c.bookingsCount} bookings</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Partner API Analytics</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Active API Keys" value={String(data.partnerApi.activeKeys)} />
          <StatCard label="Webhook Deliveries (30d)" value={String(data.partnerApi.webhookDeliveries30d)} />
          <StatCard
            label="Webhook Success Rate"
            value={data.partnerApi.webhookSuccessRate30d != null ? `${data.partnerApi.webhookSuccessRate30d}%` : "N/A"}
          />
        </CardContent>
      </Card>

      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
            <CardDescription>Deterministic insights derived from the metrics above (methodology: movex-enterprise-insights-v1)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.map((insight, i) => (
              <p key={i} className="text-sm p-2 bg-muted rounded" data-testid={`insight-${i}`}>{insight}</p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface AiOperationsRoleInfo { id: string; label: string; description: string; external?: boolean }
interface AiChatMessage { role: "user" | "assistant"; content: string }

function AiOperationsTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const { data: roles = [] } = useQuery<AiOperationsRoleInfo[]>({ queryKey: ["/api/ai-operations/roles"] });
  const [role, setRole] = useState<string>("dispatcher");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([]);

  const selectedRole = roles.find((r) => r.id === role);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/ai-operations/${role}`, {
        message,
        history: messages,
      });
      return res.json() as Promise<{ reply: string }>;
    },
    onSuccess: (data, message) => {
      setMessages((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: data.reply }]);
      setInput("");
    },
    onError: (error: any) => {
      toast({ title: "Assistant unavailable", description: error.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (!input.trim()) return;
    chatMutation.mutate(input.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Brain className="w-5 h-5" />MoveX AI Operations</CardTitle>
        <CardDescription>Ask a role-specific assistant, grounded only in your company's real data - never fabricated.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={role} onValueChange={(v) => { setRole(v); setMessages([]); }}>
          <SelectTrigger data-testid="select-ai-role">
            <SelectValue placeholder="Select an assistant" />
          </SelectTrigger>
          <SelectContent>
            {roles.filter((r) => !r.external).map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedRole && <p className="text-xs text-muted-foreground">{selectedRole.description}</p>}

        <div className="space-y-2 max-h-72 overflow-y-auto p-2 border rounded-md min-h-[80px]">
          {messages.length === 0 && <p className="text-sm text-muted-foreground">Ask a question to get started.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`text-sm p-2 rounded ${m.role === "user" ? "bg-primary/10 ml-8" : "bg-muted mr-8"}`} data-testid={`ai-message-${i}`}>
              {m.content}
            </div>
          ))}
          {chatMutation.isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask your assistant..."
            data-testid="input-ai-operations"
          />
          <Button size="icon" onClick={handleSend} disabled={chatMutation.isPending || !input.trim()} data-testid="button-ai-operations-send">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CalendarTab({ companyId }: { companyId: string }) {
  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/vehicles?companyId=${companyId}`);
      return res.ok ? res.json() : [];
    },
  });
  const { data: crew = [] } = useQuery<WorkerProfile[]>({
    queryKey: [`/api/companies/${companyId}/worker-profiles`],
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("");

  return (
    <div className="space-y-4">
      <EntityCalendarCard entityType="company" entityId={companyId} title="Company Calendar" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Truck className="w-5 h-5" />Vehicle Calendar</CardTitle>
          <CardDescription>Maintenance windows and reservations per vehicle.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
            <SelectTrigger data-testid="select-calendar-vehicle"><SelectValue placeholder="Choose a vehicle" /></SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.type} - {v.licensePlate}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      {selectedVehicleId && <EntityCalendarCard entityType="vehicle" entityId={selectedVehicleId} title="Vehicle Calendar" />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wrench className="w-5 h-5" />Crew Calendar</CardTitle>
          <CardDescription>View a crew member's schedule (they manage their own from their Skills Profile).</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
            <SelectTrigger data-testid="select-calendar-worker"><SelectValue placeholder="Choose a crew member" /></SelectTrigger>
            <SelectContent>
              {crew.map((c) => <SelectItem key={c.id} value={c.id}>{c.bio || c.id.slice(0, 8)}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      {selectedWorkerId && <EntityCalendarCard entityType="worker" entityId={selectedWorkerId} title="Crew Calendar" />}
    </div>
  );
}

function CompanyDashboardTabs({ companyId }: { companyId: string }) {
  const { data: company } = useQuery<Company>({ queryKey: ["/api/companies", companyId] });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-lg"><Building2 className="w-8 h-8 text-primary" /></div>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            {company?.name || "Company Dashboard"}
            {company?.verified && <Badge data-testid="badge-company-verified">Verified</Badge>}
          </h1>
          <p className="text-muted-foreground">{company?.subscriptionTier ?? "basic"} plan</p>
        </div>
      </div>

      <Tabs defaultValue="fleet">
        <TabsList>
          <TabsTrigger value="fleet" data-testid="tab-fleet"><Truck className="w-4 h-4 mr-2" />Fleet</TabsTrigger>
          <TabsTrigger value="drivers" data-testid="tab-drivers"><Users className="w-4 h-4 mr-2" />Drivers</TabsTrigger>
          <TabsTrigger value="bookings" data-testid="tab-open-bookings"><Package className="w-4 h-4 mr-2" />Open Bookings</TabsTrigger>
          <TabsTrigger value="capacity" data-testid="tab-capacity"><Boxes className="w-4 h-4 mr-2" />Spare Capacity</TabsTrigger>
          <TabsTrigger value="crew" data-testid="tab-crew"><Wrench className="w-4 h-4 mr-2" />Crew</TabsTrigger>
          <TabsTrigger value="services" data-testid="tab-services"><Briefcase className="w-4 h-4 mr-2" />Services</TabsTrigger>
          <TabsTrigger value="enterprise" data-testid="tab-enterprise"><BarChart3 className="w-4 h-4 mr-2" />Enterprise</TabsTrigger>
          <TabsTrigger value="ai-operations" data-testid="tab-ai-operations"><Brain className="w-4 h-4 mr-2" />AI Operations</TabsTrigger>
          <TabsTrigger value="calendar" data-testid="tab-calendar"><CalendarIcon className="w-4 h-4 mr-2" />Calendar</TabsTrigger>
          <TabsTrigger value="reviews" data-testid="tab-company-reviews"><Star className="w-4 h-4 mr-2" />Reviews</TabsTrigger>
        </TabsList>
        <TabsContent value="fleet" className="pt-4">
          <VehicleManager companyId={companyId} />
        </TabsContent>
        <TabsContent value="drivers" className="pt-4">
          <DriversTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="bookings" className="pt-4">
          <OpenBookingsTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="capacity" className="pt-4">
          <CapacityTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="crew" className="pt-4">
          <CrewTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="services" className="pt-4">
          <ServicesTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="enterprise" className="pt-4">
          <EnterpriseDashboardTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="ai-operations" className="pt-4">
          <AiOperationsTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="calendar" className="pt-4">
          <CalendarTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="reviews" className="pt-4">
          <ReviewsSection companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
