import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, TrendingUp, AlertCircle, User, DollarSign, ShieldCheck, Check, X, Route, Euro, ScrollText } from "lucide-react";
import { format } from "date-fns";
import type { Booking, Service, VerificationDocument, RoadServicePartnerProfile, AuditLog } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const statusColors: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  assigned: "default",
  "in-transit": "default",
  delivered: "default",
  cancelled: "destructive",
};

export default function AdminPanel() {
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const { toast } = useToast();

  const { data: bookings = [], isLoading: loadingBookings, isError: bookingsError, refetch: refetchBookings } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    queryFn: async () => {
      const response = await fetch("/api/bookings");
      if (!response.ok) throw new Error("Failed to fetch bookings");
      return response.json();
    },
  });

  const { data: services = [], isLoading: loadingServices, isError: servicesError } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: users = [], isError: usersError } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users");
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
    },
  });

  const { data: pendingDocuments = [], isError: pendingDocumentsError } = useQuery<VerificationDocument[]>({
    queryKey: ["/api/admin/verification-documents/pending"],
  });

  const reviewDocumentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const res = await apiRequest("PATCH", `/api/admin/verification-documents/${id}/review`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/verification-documents/pending"] });
      toast({ title: "Document reviewed" });
    },
    onError: (error: any) => toast({ title: "Review failed", description: error.message, variant: "destructive" }),
  });

  const drivers = users.filter(u => u.role === "driver" || u.role === "admin");

  const { data: roadServicesRevenue } = useQuery<{
    totalRevenueEur: number;
    totalCommissionEur: number;
    totalOrders: number;
    byCategory: Array<{ category: string; revenueEur: number; commissionEur: number; orders: number }>;
  }>({
    queryKey: ["/api/road-services/admin/revenue"],
  });

  const { data: roadServicePartners = [] } = useQuery<RoadServicePartnerProfile[]>({
    queryKey: ["/api/road-services/admin/partners"],
  });

  const updatePartnerStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "pending" | "active" | "suspended" }) => {
      const res = await apiRequest("PATCH", `/api/road-services/admin/partners/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/road-services/admin/partners"] });
      toast({ title: "Partner status updated" });
    },
    onError: (error: any) => toast({ title: "Update failed", description: error.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/bookings/${bookingId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Status updated",
        description: "Booking status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Unable to update status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const assignDriverMutation = useMutation({
    mutationFn: async ({ bookingId, driverId }: { bookingId: string; driverId: string }) => {
      const response = await apiRequest("PATCH", `/api/bookings/${bookingId}/driver`, { driverId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Driver assigned",
        description: "Driver has been assigned to the booking successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Assignment failed",
        description: "Unable to assign driver. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredBookings = selectedStatus === "all"
    ? bookings
    : bookings.filter((b) => b.status === selectedStatus);

  const stats = {
    total: bookings.length,
    pending: bookings.filter((b) => b.status === "pending").length,
    inTransit: bookings.filter((b) => b.status === "in-transit").length,
    delivered: bookings.filter((b) => b.status === "delivered").length,
    revenue: bookings
      .filter((b) => b.status === "delivered")
      .reduce((sum, b) => sum + parseFloat(b.totalPrice), 0),
  };

  if (loadingBookings || loadingServices) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-muted rounded w-64 animate-pulse" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (bookingsError || servicesError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Unable to load admin data</h3>
              <p className="text-muted-foreground mb-4">Something went wrong. Please try again.</p>
              <Button onClick={() => refetchBookings()} data-testid="button-retry-admin">
                Try Again
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground font-[Outfit]">Admin Panel</h1>
        <p className="text-muted-foreground mt-1">
          Manage bookings, services, and operations
        </p>
      </div>

      {(usersError || pendingDocumentsError) && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Some admin data (drivers list or pending verifications) failed to load. Other sections below are unaffected.
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Bookings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.pending}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.inTransit}</p>
                <p className="text-xs text-muted-foreground">In Transit</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.delivered}</p>
                <p className="text-xs text-muted-foreground">Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-foreground">${stats.revenue.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="bookings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bookings" data-testid="tab-bookings">Bookings</TabsTrigger>
          <TabsTrigger value="services" data-testid="tab-services">Services</TabsTrigger>
          <TabsTrigger value="drivers" data-testid="tab-drivers">Drivers</TabsTrigger>
          <TabsTrigger value="road-services" data-testid="tab-road-services">Road Services</TabsTrigger>
          <TabsTrigger value="audit-log" data-testid="tab-audit-log">Audit Log</TabsTrigger>
          <TabsTrigger value="verification" data-testid="tab-verification">
            Verification {pendingDocuments.length > 0 && <Badge className="ml-1">{pendingDocuments.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1">
              <Label htmlFor="status-filter">Filter by Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger id="status-filter" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bookings</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="in-transit">In Transit</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            {filteredBookings.length === 0 && (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No bookings found
                </CardContent>
              </Card>
            )}

            {filteredBookings.map((booking) => (
              <Card key={booking.id} data-testid={`admin-card-booking-${booking.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg">
                          #{booking.id.substring(0, 8)}
                        </CardTitle>
                        <Badge variant={statusColors[booking.status]} className="capitalize">
                          {booking.status.replace("-", " ")}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Created {format(new Date(booking.createdAt), "PPP")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-accent">${booking.totalPrice}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground mb-1">Pickup</p>
                      <p className="font-medium">{booking.pickupAddress}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Delivery</p>
                      <p className="font-medium">{booking.deliveryAddress}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Pickup Date</p>
                      <p className="font-medium">
                        {format(new Date(booking.pickupDate), "MMM d, yyyy")}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Distance</p>
                      <p className="font-medium">{booking.estimatedDistance} miles</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t flex-wrap">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                      <Label htmlFor={`status-${booking.id}`} className="text-sm">
                        Status:
                      </Label>
                      <Select
                        value={booking.status}
                        onValueChange={(status) =>
                          updateStatusMutation.mutate({ bookingId: booking.id, status })
                        }
                      >
                        <SelectTrigger
                          id={`status-${booking.id}`}
                          className="w-[140px]"
                          data-testid={`select-status-${booking.id}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="assigned">Assigned</SelectItem>
                          <SelectItem value="in-transit">In Transit</SelectItem>
                          <SelectItem value="delivered">Delivered</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                      <Label htmlFor={`driver-${booking.id}`} className="text-sm">
                        Driver:
                      </Label>
                      <Select
                        value={booking.driverId || "unassigned"}
                        onValueChange={(driverId) => {
                          if (driverId !== "unassigned") {
                            assignDriverMutation.mutate({ bookingId: booking.id, driverId });
                          }
                        }}
                      >
                        <SelectTrigger
                          id={`driver-${booking.id}`}
                          className="w-[140px]"
                          data-testid={`select-driver-${booking.id}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {drivers.map((driver) => (
                            <SelectItem key={driver.id} value={driver.id}>
                              {driver.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {services.map((service) => (
              <Card key={service.id} data-testid={`admin-card-service-${service.id}`}>
                <CardHeader>
                  <CardTitle className="text-lg">{service.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{service.description}</p>
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Base Price</p>
                      <p className="text-lg font-bold text-foreground">${service.basePrice}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Per Mile</p>
                      <p className="text-lg font-bold text-foreground">${service.pricePerMile}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="drivers" className="space-y-4">
          {drivers.length === 0 && (
            <Card>
              <CardContent className="pt-6 text-center">
                <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No drivers available</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Create driver accounts to assign them to bookings
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            {drivers.map((driver) => {
              const assignedBookings = bookings.filter(b => b.driverId === driver.id);
              const activeBookings = assignedBookings.filter(
                b => b.status === "assigned" || b.status === "in-transit"
              );
              
              return (
                <Card key={driver.id} data-testid={`admin-card-driver-${driver.id}`}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{driver.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{driver.email || driver.phone}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Jobs</p>
                        <p className="text-2xl font-bold text-foreground">{assignedBookings.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Active</p>
                        <p className="text-2xl font-bold text-primary">{activeBookings.length}</p>
                      </div>
                    </div>
                    <Badge variant={activeBookings.length > 0 ? "default" : "secondary"}>
                      {activeBookings.length > 0 ? "Busy" : "Available"}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="verification" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                Pending identity & document verification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingDocuments.length === 0 && (
                <p className="text-sm text-muted-foreground">No documents awaiting review.</p>
              )}
              {pendingDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center gap-4 p-3 border rounded-md" data-testid={`row-verification-${doc.id}`}>
                  <img src={doc.fileUrl} alt={doc.docType} className="w-16 h-16 object-cover rounded-md flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium capitalize">{doc.docType.replace(/_/g, " ")}</p>
                    <p className="text-sm text-muted-foreground">
                      {doc.holderType} · submitted {format(new Date(doc.submittedAt), "PPp")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => reviewDocumentMutation.mutate({ id: doc.id, status: "approved" })}
                      disabled={reviewDocumentMutation.isPending}
                      data-testid={`button-approve-${doc.id}`}
                    >
                      <Check className="w-4 h-4 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => reviewDocumentMutation.mutate({ id: doc.id, status: "rejected" })}
                      disabled={reviewDocumentMutation.isPending}
                      data-testid={`button-reject-${doc.id}`}
                    >
                      <X className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit-log" className="space-y-4">
          <AuditLogTab />
        </TabsContent>

        <TabsContent value="road-services" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Euro className="w-4 h-4" /> Total Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="text-rs-total-revenue">
                  EUR {(roadServicesRevenue?.totalRevenueEur ?? 0).toFixed(2)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Commission Earned
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="text-rs-total-commission">
                  EUR {(roadServicesRevenue?.totalCommissionEur ?? 0).toFixed(2)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Package className="w-4 h-4" /> Confirmed Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="text-rs-total-orders">
                  {roadServicesRevenue?.totalOrders ?? 0}
                </p>
              </CardContent>
            </Card>
          </div>

          {roadServicesRevenue && roadServicesRevenue.byCategory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue by Category</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {roadServicesRevenue.byCategory.map((c) => (
                  <div key={c.category} className="flex items-center justify-between text-sm p-2 border rounded-md">
                    <span className="capitalize">{c.category.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">{c.orders} orders</span>
                    <span className="font-medium">EUR {c.revenueEur.toFixed(2)}</span>
                    <span className="text-green-600">+EUR {c.commissionEur.toFixed(2)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Route className="w-5 h-5" /> Road Services Partners
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {roadServicePartners.length === 0 && (
                <p className="text-sm text-muted-foreground">No partner applications yet.</p>
              )}
              {roadServicePartners.map((partner) => (
                <div key={partner.id} className="flex items-center gap-4 p-3 border rounded-md" data-testid={`row-rs-partner-${partner.id}`}>
                  <div className="flex-1">
                    <p className="font-medium">{partner.categories.join(", ")}</p>
                    <p className="text-sm text-muted-foreground">
                      {partner.countryCodes.join(", ") || "All countries"} · {partner.commissionType === "percent" ? `${partner.commissionValue}%` : `EUR ${partner.commissionValue}`} commission
                    </p>
                  </div>
                  <Badge variant={partner.status === "active" ? "default" : partner.status === "suspended" ? "destructive" : "secondary"}>
                    {partner.status}
                  </Badge>
                  {partner.status !== "active" && (
                    <Button size="sm" onClick={() => updatePartnerStatusMutation.mutate({ id: partner.id, status: "active" })} disabled={updatePartnerStatusMutation.isPending} data-testid={`button-rs-approve-${partner.id}`}>
                      <Check className="w-4 h-4 mr-1" /> Activate
                    </Button>
                  )}
                  {partner.status !== "suspended" && (
                    <Button size="sm" variant="destructive" onClick={() => updatePartnerStatusMutation.mutate({ id: partner.id, status: "suspended" })} disabled={updatePartnerStatusMutation.isPending} data-testid={`button-rs-suspend-${partner.id}`}>
                      <X className="w-4 h-4 mr-1" /> Suspend
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AuditLogTab() {
  const [targetType, setTargetType] = useState("");
  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/admin/audit-logs", targetType],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audit-logs${targetType ? `?targetType=${encodeURIComponent(targetType)}` : ""}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="w-5 h-5" />
          Audit Log
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="audit-target-type" className="text-sm">Filter by target type</Label>
          <input
            id="audit-target-type"
            className="h-8 px-2 border rounded text-sm bg-background"
            placeholder="e.g. automation_rule, user, company"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            data-testid="input-audit-target-type"
          />
        </div>
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!isLoading && logs.length === 0 && <p className="text-sm text-muted-foreground">No audit log entries.</p>}
        {logs.map((log) => (
          <div key={log.id} className="p-2 border rounded text-sm" data-testid={`audit-log-${log.id}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">{log.action}</span>
              <span className="text-xs text-muted-foreground">{format(new Date(log.createdAt), "PPp")}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {log.targetType && `${log.targetType}${log.targetId ? ` · ${log.targetId.slice(0, 8)}` : ""}`}
              {log.actorUserId && ` · actor ${log.actorUserId.slice(0, 8)}`}
            </p>
            {log.metadata != null && (
              <pre className="text-xs bg-muted p-1.5 rounded mt-1 overflow-x-auto">{JSON.stringify(log.metadata)}</pre>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
