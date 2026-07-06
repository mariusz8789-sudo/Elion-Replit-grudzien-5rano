import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Package, MapPin, Calendar, DollarSign, Truck } from "lucide-react";
import { format } from "date-fns";
import LiveTrackingMap from "@/components/LiveTrackingMap";
import type { Booking, TrackingUpdate } from "@shared/schema";

export default function BookingDetailPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [, setLocation] = useLocation();

  const { data: booking, isLoading: bookingLoading } = useQuery<Booking>({
    queryKey: ["/api/bookings", bookingId],
    queryFn: async () => {
      const response = await fetch(`/api/bookings/${bookingId}`);
      if (!response.ok) throw new Error("Failed to fetch booking");
      return response.json();
    },
    enabled: !!bookingId,
  });

  const { data: tracking = [], isLoading: trackingLoading } = useQuery<TrackingUpdate[]>({
    queryKey: ["/api/bookings", bookingId, "tracking"],
    queryFn: async () => {
      const response = await fetch(`/api/bookings/${bookingId}/tracking`);
      if (!response.ok) throw new Error("Failed to fetch tracking");
      return response.json();
    },
    enabled: !!bookingId,
    refetchInterval: 5000, // Refresh every 5 seconds for live updates
  });

  if (bookingLoading || trackingLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-muted-foreground">Booking not found</div>
      </div>
    );
  }

  const statusColors = {
    draft: "bg-gray-500",
    posted: "bg-blue-500",
    accepted: "bg-green-500",
    in_transit: "bg-yellow-500",
    delivered: "bg-emerald-500",
    canceled: "bg-red-500",
  };

  const pickupCoords: [number, number] = [
    parseFloat(booking.pickupLng as string),
    parseFloat(booking.pickupLat as string),
  ];
  
  const deliveryCoords: [number, number] = [
    parseFloat(booking.deliveryLng as string),
    parseFloat(booking.deliveryLat as string),
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => setLocation("/bookings")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Bookings
        </Button>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Booking Details */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Booking Details</h2>
              <Badge className={statusColors[booking.status as keyof typeof statusColors]}>
                {booking.status}
              </Badge>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Package className="w-5 h-5 text-primary mt-1" />
                <div>
                  <p className="font-medium">Booking ID</p>
                  <p className="text-sm text-muted-foreground">{booking.id}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-green-500 mt-1" />
                <div>
                  <p className="font-medium">Pickup Address</p>
                  <p className="text-sm text-muted-foreground">{booking.pickupAddress}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-accent mt-1" />
                <div>
                  <p className="font-medium">Delivery Address</p>
                  <p className="text-sm text-muted-foreground">{booking.deliveryAddress}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-primary mt-1" />
                <div>
                  <p className="font-medium">Pickup Date</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(booking.pickupDate), "PPP")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <DollarSign className="w-5 h-5 text-primary mt-1" />
                <div>
                  <p className="font-medium">Total Price</p>
                  <p className="text-sm text-muted-foreground">${booking.totalPrice}</p>
                </div>
              </div>

              {booking.cargoDescription && (
                <div className="flex items-start gap-3">
                  <Truck className="w-5 h-5 text-primary mt-1" />
                  <div>
                    <p className="font-medium">Cargo Description</p>
                    <p className="text-sm text-muted-foreground">{booking.cargoDescription}</p>
                  </div>
                </div>
              )}

              {booking.notes && (
                <div className="flex items-start gap-3">
                  <Package className="w-5 h-5 text-primary mt-1" />
                  <div>
                    <p className="font-medium">Notes</p>
                    <p className="text-sm text-muted-foreground">{booking.notes}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Tracking Timeline */}
          <Card className="p-6 space-y-4">
            <h3 className="text-xl font-semibold">Tracking Timeline</h3>
            
            {tracking.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tracking updates yet</p>
            ) : (
              <div className="space-y-3">
                {tracking.map((update, index) => (
                  <div
                    key={update.id}
                    className={`flex gap-3 pb-3 ${
                      index < tracking.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{update.note || update.status}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(update.createdAt), "PPp")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Live GPS Map */}
        {booking.pickupLat && booking.pickupLng && booking.deliveryLat && booking.deliveryLng && (
          <LiveTrackingMap
            bookingId={booking.id}
            trackingUpdates={tracking}
            pickupCoords={pickupCoords}
            deliveryCoords={deliveryCoords}
          />
        )}
      </div>
    </div>
  );
}
