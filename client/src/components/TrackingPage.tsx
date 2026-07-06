import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Package, MapPin, Clock, CheckCircle2, Truck, User } from "lucide-react";
import { format } from "date-fns";
import type { Booking } from "@shared/schema";
import BookingChat from "./BookingChat";

interface StatusStep {
  status: string;
  label: string;
  icon: any;
  description: string;
}

const statusSteps: StatusStep[] = [
  {
    status: "pending",
    label: "Booking Confirmed",
    icon: CheckCircle2,
    description: "Your booking has been confirmed and assigned",
  },
  {
    status: "assigned",
    label: "Driver Assigned",
    icon: User,
    description: "A driver has been assigned to your delivery",
  },
  {
    status: "in-transit",
    label: "In Transit",
    icon: Truck,
    description: "Your items are on the way",
  },
  {
    status: "delivered",
    label: "Delivered",
    icon: Package,
    description: "Delivery completed successfully",
  },
];

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500",
  assigned: "bg-blue-500",
  "in-transit": "bg-primary",
  delivered: "bg-green-500",
  cancelled: "bg-red-500",
};

function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = statusSteps.findIndex((s) => s.status === currentStatus);

  return (
    <div className="space-y-6">
      {statusSteps.map((step, index) => {
        const Icon = step.icon;
        const isCompleted = index <= currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <div key={step.status} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`rounded-full p-2 ${
                  isCompleted ? statusColors[step.status] : "bg-muted"
                } transition-colors`}
              >
                <Icon className={`w-5 h-5 ${isCompleted ? "text-white" : "text-muted-foreground"}`} />
              </div>
              {index < statusSteps.length - 1 && (
                <div
                  className={`w-0.5 h-12 ${
                    isCompleted ? "bg-primary" : "bg-muted"
                  } transition-colors`}
                />
              )}
            </div>
            <div className="flex-1 pb-8">
              <h3
                className={`font-semibold ${
                  isCurrent ? "text-foreground" : isCompleted ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TrackingPage() {
  const [, params] = useRoute("/track/:id");
  const bookingId = params?.id;

  const { data: booking, isLoading } = useQuery<Booking>({
    queryKey: ["/api/bookings", bookingId],
    queryFn: async () => {
      const response = await fetch(`/api/bookings/${bookingId}`);
      if (!response.ok) throw new Error("Failed to fetch booking");
      return response.json();
    },
    enabled: !!bookingId,
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="space-y-4">
          <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
          <div className="h-32 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Booking not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const estimatedDeliveryDate = new Date(booking.pickupDate);
  estimatedDeliveryDate.setHours(estimatedDeliveryDate.getHours() + 
    Math.ceil(parseFloat(booking.estimatedDistance) / 50)); // Rough estimate: 50 miles per hour

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground font-[Outfit]">Track Your Delivery</h1>
            <p className="text-muted-foreground mt-1">Booking ID: {booking.id.substring(0, 8)}</p>
          </div>
          <Badge
            className="capitalize"
            variant={booking.status === "delivered" ? "default" : "secondary"}
            data-testid={`badge-status-${booking.status}`}
          >
            {booking.status.replace("-", " ")}
          </Badge>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="w-5 h-5 text-primary" />
              Pickup Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground" data-testid="text-pickup-address">{booking.pickupAddress}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="w-5 h-5 text-secondary" />
              Delivery Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground" data-testid="text-delivery-address">{booking.deliveryAddress}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="w-5 h-5 text-primary" />
              Pickup Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground" data-testid="text-pickup-date">
              {format(new Date(booking.pickupDate), "PPP 'at' p")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="w-5 h-5 text-secondary" />
              Estimated Delivery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground" data-testid="text-estimated-delivery">
              {format(estimatedDeliveryDate, "PPP 'at' p")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-[Outfit]">Delivery Status</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusTimeline currentStatus={booking.status} />
        </CardContent>
      </Card>

      {booking.notes && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Special Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground" data-testid="text-notes">{booking.notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="mt-6">
        <BookingChat bookingId={bookingId!} />
      </div>

      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <div className="flex items-start gap-3">
          <Package className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <p className="font-medium text-foreground">Need help?</p>
            <p className="text-sm text-muted-foreground mt-1">
              Contact our support team at support@pointtopoint.com or call 1-800-MOVE-NOW
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
