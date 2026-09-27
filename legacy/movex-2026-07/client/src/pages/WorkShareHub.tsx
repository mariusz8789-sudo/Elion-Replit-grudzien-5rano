import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Users, Truck, Building2, Share2, UserPlus, Clock, DollarSign, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

interface StaffSharing {
  id: string;
  lenderCompanyId: string;
  borrowerCompanyId: string | null;
  driverId: string | null;
  staffType: string;
  availability: string;
  hourlyRate: string | null;
  minHours: number | null;
  maxHours: number | null;
  notes: string | null;
  status: string;
  createdAt: string;
}

interface ResourceSharing {
  id: string;
  providerCompanyId: string;
  requesterCompanyId: string | null;
  resourceType: string;
  title: string;
  availability: string | null;
  pricePerDay: string | null;
  description: string | null;
  status: string;
  createdAt: string;
}

export default function WorkShareHub() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false);
  const [isResourceDialogOpen, setIsResourceDialogOpen] = useState(false);

  // Staff form state
  const [staffType, setStaffType] = useState("");
  const [staffAvailability, setStaffAvailability] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [minHours, setMinHours] = useState("");
  const [maxHours, setMaxHours] = useState("");
  const [staffDescription, setStaffDescription] = useState("");

  // Resource form state
  const [resourceType, setResourceType] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [resourceAvailability, setResourceAvailability] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");

  const { data: staffSharing = [] } = useQuery<StaffSharing[]>({
    queryKey: ["/api/staff-sharing"],
  });

  const { data: resourceSharing = [] } = useQuery<ResourceSharing[]>({
    queryKey: ["/api/resource-sharing"],
  });

  const createStaffMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/staff-sharing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-sharing"] });
      toast({
        title: t("Success"),
        description: t("Staff availability posted successfully"),
      });
      setIsStaffDialogOpen(false);
      resetStaffForm();
    },
    onError: () => {
      toast({
        title: t("Error"),
        description: t("Failed to post staff availability"),
        variant: "destructive",
      });
    },
  });

  const createResourceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/resource-sharing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resource-sharing"] });
      toast({
        title: t("Success"),
        description: t("Resource posted successfully"),
      });
      setIsResourceDialogOpen(false);
      resetResourceForm();
    },
    onError: () => {
      toast({
        title: t("Error"),
        description: t("Failed to post resource"),
        variant: "destructive",
      });
    },
  });

  const requestStaffMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/staff-sharing/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "requested" }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-sharing"] });
      toast({
        title: t("Request Sent"),
        description: t("Staff request has been sent to the provider"),
      });
    },
  });

  const requestResourceMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/resource-sharing/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "requested" }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resource-sharing"] });
      toast({
        title: t("Request Sent"),
        description: t("Resource request has been sent to the provider"),
      });
    },
  });

  const staffStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await fetch(`/api/staff-sharing/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error((await response.json()).message);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-sharing"] });
      toast({ title: t("Updated") });
    },
    onError: (error: any) => {
      toast({ title: t("Error"), description: error.message, variant: "destructive" });
    },
  });

  const resourceStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await fetch(`/api/resource-sharing/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error((await response.json()).message);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resource-sharing"] });
      toast({ title: t("Updated") });
    },
    onError: (error: any) => {
      toast({ title: t("Error"), description: error.message, variant: "destructive" });
    },
  });

  const resetStaffForm = () => {
    setStaffType("");
    setStaffAvailability("");
    setHourlyRate("");
    setMinHours("");
    setMaxHours("");
    setStaffDescription("");
  };

  const resetResourceForm = () => {
    setResourceType("");
    setResourceName("");
    setResourceAvailability("");
    setDailyRate("");
    setResourceDescription("");
  };

  const handleStaffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.companyId) {
      toast({
        title: t("Error"),
        description: t("You must be associated with a company to share staff"),
        variant: "destructive",
      });
      return;
    }

    const parsedMinHours = parseInt(minHours);
    const parsedMaxHours = maxHours ? parseInt(maxHours) : null;

    if (isNaN(parsedMinHours) || parsedMinHours <= 0) {
      toast({
        title: t("Error"),
        description: t("Please enter a valid minimum hours"),
        variant: "destructive",
      });
      return;
    }

    if (parsedMaxHours !== null && (isNaN(parsedMaxHours) || parsedMaxHours < parsedMinHours)) {
      toast({
        title: t("Error"),
        description: t("Maximum hours must be greater than minimum hours"),
        variant: "destructive",
      });
      return;
    }

    createStaffMutation.mutate({
      staffType,
      availability: staffAvailability,
      hourlyRate,
      minHours: parsedMinHours,
      maxHours: parsedMaxHours,
      notes: staffDescription || null,
    });
  };

  const handleResourceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.companyId) {
      toast({
        title: t("Error"),
        description: t("You must be associated with a company to share resources"),
        variant: "destructive",
      });
      return;
    }

    createResourceMutation.mutate({
      resourceType,
      title: resourceName,
      availability: resourceAvailability,
      pricePerDay: dailyRate,
      description: resourceDescription || null,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "requested": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "booked": return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
      default: return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  const availableStaff = staffSharing.filter(s => s.status === "available");
  const availableResources = resourceSharing.filter(r => r.status === "available");

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
          <Share2 className="w-8 h-8 text-purple-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t("WorkShare HUB")}</h1>
          <p className="text-muted-foreground">{t("Share fleet, warehouse, and workers between companies")}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              {t("Available Drivers")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-available-drivers">
              {availableStaff.filter(s => s.staffType === "driver").length}
            </div>
            <p className="text-sm text-muted-foreground mt-2">{t("Ready to book now")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-purple-600" />
              {t("Available Vehicles")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-available-vehicles">
              {availableResources.filter(r => r.resourceType === "vehicle").length}
            </div>
            <p className="text-sm text-muted-foreground mt-2">{t("Fleet sharing pool")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-600" />
              {t("Warehouses")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-available-warehouses">
              {availableResources.filter(r => r.resourceType === "warehouse").length}
            </div>
            <p className="text-sm text-muted-foreground mt-2">{t("Storage spaces available")}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="browse" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="browse" data-testid="tab-browse">{t("Browse Resources")}</TabsTrigger>
          <TabsTrigger value="shared" data-testid="tab-shared">{t("My Shared Resources")}</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-4">
          <div className="flex gap-4">
            <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-offer-staff">
                  <Users className="w-4 h-4 mr-2" />
                  {t("Offer Staff")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>{t("Share Your Staff")}</DialogTitle>
                  <DialogDescription>
                    {t("List available workforce for other companies to request")}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleStaffSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="staffType">{t("Staff Type")}</Label>
                    <Select value={staffType} onValueChange={setStaffType} required>
                      <SelectTrigger id="staffType" data-testid="select-staff-type">
                        <SelectValue placeholder={t("Select staff type")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="driver">{t("Driver")}</SelectItem>
                        <SelectItem value="loader">{t("Loader/Handler")}</SelectItem>
                        <SelectItem value="warehouse">{t("Warehouse Staff")}</SelectItem>
                        <SelectItem value="dispatcher">{t("Dispatcher")}</SelectItem>
                        <SelectItem value="admin">{t("Administrative")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="staffAvailability">{t("Availability")}</Label>
                    <Input
                      id="staffAvailability"
                      value={staffAvailability}
                      onChange={(e) => setStaffAvailability(e.target.value)}
                      placeholder="e.g., Mon-Fri 9am-5pm"
                      required
                      data-testid="input-availability"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="hourlyRate">{t("Hourly Rate ($)")}</Label>
                      <Input
                        id="hourlyRate"
                        type="number"
                        step="0.01"
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(e.target.value)}
                        placeholder="25.00"
                        required
                        data-testid="input-hourly-rate"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="minHours">{t("Min Hours")}</Label>
                      <Input
                        id="minHours"
                        type="number"
                        value={minHours}
                        onChange={(e) => setMinHours(e.target.value)}
                        placeholder="4"
                        required
                        data-testid="input-min-hours"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxHours">{t("Max Hours (optional)")}</Label>
                    <Input
                      id="maxHours"
                      type="number"
                      value={maxHours}
                      onChange={(e) => setMaxHours(e.target.value)}
                      placeholder="40"
                      data-testid="input-max-hours"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="staffDescription">{t("Description")}</Label>
                    <Textarea
                      id="staffDescription"
                      value={staffDescription}
                      onChange={(e) => setStaffDescription(e.target.value)}
                      placeholder={t("Any additional details...")}
                      rows={3}
                      data-testid="input-description"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={createStaffMutation.isPending} data-testid="button-submit-staff">
                    {createStaffMutation.isPending ? t("Posting...") : t("Post Availability")}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isResourceDialogOpen} onOpenChange={setIsResourceDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-offer-resource">
                  <Truck className="w-4 h-4 mr-2" />
                  {t("Offer Resource")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>{t("Share Your Resource")}</DialogTitle>
                  <DialogDescription>
                    {t("List available vehicles or warehouses for other companies")}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleResourceSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="resourceType">{t("Resource Type")}</Label>
                    <Select value={resourceType} onValueChange={setResourceType} required>
                      <SelectTrigger id="resourceType" data-testid="select-resource-type">
                        <SelectValue placeholder={t("Select resource type")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vehicle">{t("Vehicle")}</SelectItem>
                        <SelectItem value="warehouse">{t("Warehouse")}</SelectItem>
                        <SelectItem value="equipment">{t("Equipment")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="resourceName">{t("Name/Model")}</Label>
                    <Input
                      id="resourceName"
                      value={resourceName}
                      onChange={(e) => setResourceName(e.target.value)}
                      placeholder="e.g., Mercedes Sprinter"
                      required
                      data-testid="input-resource-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="resourceAvailability">{t("Availability")}</Label>
                    <Input
                      id="resourceAvailability"
                      value={resourceAvailability}
                      onChange={(e) => setResourceAvailability(e.target.value)}
                      placeholder="e.g., Weekends only"
                      required
                      data-testid="input-resource-availability"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dailyRate">{t("Daily Rate ($)")}</Label>
                    <Input
                      id="dailyRate"
                      type="number"
                      step="0.01"
                      value={dailyRate}
                      onChange={(e) => setDailyRate(e.target.value)}
                      placeholder="80.00"
                      required
                      data-testid="input-daily-rate"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="resourceDescription">{t("Description")}</Label>
                    <Textarea
                      id="resourceDescription"
                      value={resourceDescription}
                      onChange={(e) => setResourceDescription(e.target.value)}
                      placeholder={t("Any additional details...")}
                      rows={3}
                      data-testid="input-resource-description"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={createResourceMutation.isPending} data-testid="button-submit-resource">
                    {createResourceMutation.isPending ? t("Posting...") : t("Post Resource")}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-4">
            {staffSharing.length === 0 && resourceSharing.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Share2 className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    {t("No resources available yet")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {staffSharing.map((staff) => (
                  <Card key={staff.id} className="hover-elevate" data-testid={`card-staff-${staff.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg capitalize flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            {t(staff.staffType)}
                          </CardTitle>
                          <CardDescription>{staff.availability}</CardDescription>
                        </div>
                        <Badge className={getStatusColor(staff.status)}>
                          {t(staff.status)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          <span>${staff.hourlyRate}/hr</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span>{staff.minHours}+ hrs</span>
                        </div>
                      </div>
                      
                      {staff.notes && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {staff.notes}
                        </p>
                      )}

                      {staff.status === "available" && (
                        <Button 
                          className="w-full" 
                          onClick={() => requestStaffMutation.mutate(staff.id)}
                          disabled={requestStaffMutation.isPending}
                          data-testid={`button-request-staff-${staff.id}`}
                        >
                          <Briefcase className="w-4 h-4 mr-2" />
                          {t("Request Staff")}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {resourceSharing.map((resource) => (
                  <Card key={resource.id} className="hover-elevate" data-testid={`card-resource-${resource.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            {resource.resourceType === "vehicle" && <Truck className="w-5 h-5" />}
                            {resource.resourceType === "warehouse" && <Building2 className="w-5 h-5" />}
                            {resource.title}
                          </CardTitle>
                          <CardDescription>{t(resource.resourceType)} - {resource.availability}</CardDescription>
                        </div>
                        <Badge className={getStatusColor(resource.status)}>
                          {t(resource.status)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-2 text-sm">
                        <DollarSign className="w-4 h-4 text-muted-foreground" />
                        <span>${resource.pricePerDay}/day</span>
                      </div>
                      
                      {resource.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {resource.description}
                        </p>
                      )}

                      {resource.status === "available" && (
                        <Button 
                          className="w-full" 
                          onClick={() => requestResourceMutation.mutate(resource.id)}
                          disabled={requestResourceMutation.isPending}
                          data-testid={`button-request-resource-${resource.id}`}
                        >
                          <UserPlus className="w-4 h-4 mr-2" />
                          {t("Request Resource")}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="shared" className="space-y-4">
          {(() => {
            const myStaff = staffSharing.filter((s) => user?.companyId && (s.lenderCompanyId === user.companyId || s.borrowerCompanyId === user.companyId));
            const myResources = resourceSharing.filter((r) => user?.companyId && (r.providerCompanyId === user.companyId || r.requesterCompanyId === user.companyId));

            if (!user?.companyId) {
              return <p className="text-muted-foreground text-center py-8">{t("A company account is required.")}</p>;
            }
            if (myStaff.length === 0 && myResources.length === 0) {
              return <p className="text-muted-foreground text-center py-8">{t("Your shared resources will appear here")}</p>;
            }

            return (
              <div className="space-y-4">
                {myStaff.map((s) => {
                  const isLender = s.lenderCompanyId === user.companyId;
                  return (
                    <Card key={s.id} data-testid={`card-my-staff-${s.id}`}>
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium">{s.staffType} &middot; {isLender ? t("You are lending") : t("You requested")}</p>
                          <p className="text-sm text-muted-foreground">{s.availability}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge>{s.status}</Badge>
                          {isLender && s.status === "requested" && (
                            <>
                              <Button size="sm" onClick={() => staffStatusMutation.mutate({ id: s.id, status: "booked" })} data-testid={`button-accept-staff-${s.id}`}>{t("Accept")}</Button>
                              <Button size="sm" variant="outline" onClick={() => staffStatusMutation.mutate({ id: s.id, status: "available" })} data-testid={`button-reject-staff-${s.id}`}>{t("Reject")}</Button>
                            </>
                          )}
                          {s.status === "booked" && (
                            <Button size="sm" onClick={() => staffStatusMutation.mutate({ id: s.id, status: "completed" })} data-testid={`button-complete-staff-${s.id}`}>{t("Mark Complete")}</Button>
                          )}
                          {(s.status === "requested" || s.status === "booked") && (
                            <Button size="sm" variant="destructive" onClick={() => staffStatusMutation.mutate({ id: s.id, status: "cancelled" })} data-testid={`button-cancel-staff-${s.id}`}>{t("Cancel")}</Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {myResources.map((r) => {
                  const isProvider = r.providerCompanyId === user.companyId;
                  return (
                    <Card key={r.id} data-testid={`card-my-resource-${r.id}`}>
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium">{r.title} &middot; {isProvider ? t("You are providing") : t("You requested")}</p>
                          <p className="text-sm text-muted-foreground">{r.availability}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge>{r.status}</Badge>
                          {isProvider && r.status === "requested" && (
                            <>
                              <Button size="sm" onClick={() => resourceStatusMutation.mutate({ id: r.id, status: "booked" })} data-testid={`button-accept-resource-${r.id}`}>{t("Accept")}</Button>
                              <Button size="sm" variant="outline" onClick={() => resourceStatusMutation.mutate({ id: r.id, status: "available" })} data-testid={`button-reject-resource-${r.id}`}>{t("Reject")}</Button>
                            </>
                          )}
                          {r.status === "booked" && (
                            <Button size="sm" onClick={() => resourceStatusMutation.mutate({ id: r.id, status: "completed" })} data-testid={`button-complete-resource-${r.id}`}>{t("Mark Complete")}</Button>
                          )}
                          {(r.status === "requested" || r.status === "booked") && (
                            <Button size="sm" variant="destructive" onClick={() => resourceStatusMutation.mutate({ id: r.id, status: "cancelled" })} data-testid={`button-cancel-resource-${r.id}`}>{t("Cancel")}</Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>{t("How WorkShare HUB Works")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <Share2 className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-semibold mb-1">{t("Share")}</h3>
              <p className="text-sm text-muted-foreground">{t("List your idle resources")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-semibold mb-1">{t("Connect")}</h3>
              <p className="text-sm text-muted-foreground">{t("Other companies book instantly")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <Truck className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-semibold mb-1">{t("Use")}</h3>
              <p className="text-sm text-muted-foreground">{t("Collaborate on deliveries")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <Building2 className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-semibold mb-1">{t("Earn")}</h3>
              <p className="text-sm text-muted-foreground">{t("Get paid for shared time")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
