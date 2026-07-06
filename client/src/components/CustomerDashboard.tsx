import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package, MapPin, Calendar, Search, Truck, AlertCircle, Navigation } from "lucide-react";
import { format } from "date-fns";
import type { Booking } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import OffersDialog from "./OffersDialog";
import PaymentDialog from "./PaymentDialog";

const statusColors: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  assigned: "default",
  "in-transit": "default",
  delivered: "default",
  cancelled: "destructive",
};

export default function CustomerDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: bookings = [], isLoading, isError, error, refetch } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
    queryFn: async () => {
      const response = await fetch("/api/bookings");
      if (!response.ok) throw new Error("Failed to fetch bookings");
      return response.json();
    },
  });

  const cancelBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("PATCH", `/api/bookings/${bookingId}/cancel`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Booking cancelled",
        description: "Your booking has been cancelled successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Cancellation failed",
        description: error.message || "Unable to cancel booking. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredBookings = bookings.filter((booking) => {
    const matchesSearch =
      booking.pickupAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      booking.deliveryAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      booking.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  if (isLoading) {
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

  if (isError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Unable to load bookings
              </h3>
              <p className="text-muted-foreground mb-4">
                {error?.message || "Something went wrong. Please try again."}
              </p>
              <Button onClick={() => refetch()} data-testid="button-retry">
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground font-[Outfit]">My Bookings</h1>
          <p className="text-muted-foreground mt-1">
            Track and manage your moving services
          </p>
        </div>
        <Button onClick={() => (window.location.href = "/book")} data-testid="button-new-booking">
          <Package className="w-4 h-4 mr-2" />
          New Booking
        </Button>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{bookings.length}</p>
              <p className="text-sm text-muted-foreground mt-1">Total Bookings</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">
                {bookings.filter((b) => b.status === "pending").length}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">
                {bookings.filter((b) => b.status === "in-transit").length}
              </p>
              <p className="text-sm text-muted-foreground mt-1">In Transit</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">
                {bookings.filter((b) => b.status === "delivered").length}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Delivered</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by address or booking ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search"
        />
      </div>

      {filteredBookings.length === 0 && searchQuery && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No bookings found matching "{searchQuery}"
          </CardContent>
        </Card>
      )}

      {filteredBookings.length === 0 && !searchQuery && (
        <Card>
          <CardContent className="pt-6 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No bookings yet</h3>
            <p className="text-muted-foreground mb-4">
              Get started by creating your first booking
            </p>
            <Button onClick={() => (window.location.href = "/book")} data-testid="button-first-booking">
              Create Your First Booking
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {filteredBookings.map((booking) => (
          <Card key={booking.id} className="hover-elevate transition-all" data-testid={`card-booking-${booking.id}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-lg">
                      Booking #{booking.id.substring(0, 8)}
                    </CardTitle>
                    <Badge variant={statusColors[booking.status]} className="capitalize" data-testid={`badge-status-${booking.status}`}>
                      {booking.status.replace("-", " ")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(booking.createdAt), "PPP")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-accent">${booking.totalPrice}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Pickup</p>
                      <p className="text-sm font-medium text-foreground" data-testid={`text-pickup-${booking.id}`}>
                        {booking.pickupAddress}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-secondary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Delivery</p>
                      <p className="text-sm font-medium text-foreground" data-testid={`text-delivery-${booking.id}`}>
                        {booking.deliveryAddress}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {format(new Date(booking.pickupDate), "MMM d, yyyy")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {booking.estimatedDistance} miles
                  </span>
                </div>
              </div>

              <div className="flex gap-3 pt-2 flex-wrap">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setLocation(`/bookings/${booking.id}`)}
                  data-testid={`button-view-details-${booking.id}`}
                >
                  <Navigation className="w-4 h-4 mr-2" />
                  Live GPS Tracking
                </Button>
                {(booking.status === "pending" || booking.status === "posted") && (
                  <OffersDialog bookingId={booking.id} />
                )}
                {(booking.status === "pending" || booking.status === "posted" || booking.status === "accepted") && (
                  <PaymentDialog 
                    bookingId={booking.id} 
                    amount={booking.totalPrice} 
                    paymentStatus={booking.paymentStatus || undefined}
                  />
                )}
                {booking.status === "pending" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cancelBookingMutation.mutate(booking.id)}
                    disabled={cancelBookingMutation.isPending}
                    data-testid={`button-cancel-${booking.id}`}
                  >
                    {cancelBookingMutation.isPending ? "Cancelling..." : "Cancel Booking"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
