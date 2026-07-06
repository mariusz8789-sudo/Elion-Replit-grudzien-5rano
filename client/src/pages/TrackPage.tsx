import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin, Package, Clock, MessageCircle, Send } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import LiveTrackingMap from "@/components/LiveTrackingMap";
import type { Booking, TrackingUpdate } from "@shared/schema";

interface SupportMessage {
  id: string;
  bookingId: string;
  userId?: string;
  message: string;
  sender: "customer" | "support";
  createdAt: string;
}

export default function TrackPage() {
  const { id: bookingId } = useParams<{ id: string }>();
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  const { data: booking } = useQuery<Booking>({
    queryKey: ["/api/bookings", bookingId],
    enabled: !!bookingId,
  });

  const { data: tracking = [] } = useQuery<TrackingUpdate[]>({
    queryKey: ["/api/bookings", bookingId, "tracking"],
    enabled: !!bookingId,
    refetchInterval: 5000,
  });

  const { data: messages = [], refetch: refetchMessages } = useQuery<SupportMessage[]>({
    queryKey: ["/api/support", bookingId, "messages"],
    queryFn: async () => {
      const response = await fetch(`/api/support/${bookingId}/messages`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!bookingId,
    refetchInterval: 3000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiRequest("POST", "/api/support/messages", {
        bookingId,
        message: text,
        sender: "customer",
      });
      if (!response.ok) throw new Error("Failed to send message");
      return response.json();
    },
    onSuccess: () => {
      setMessage("");
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: ["/api/support", bookingId, "messages"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send message",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMessageMutation.mutate(message);
  };

  const latestLocation = tracking && tracking.length > 0 
    ? tracking[tracking.length - 1] 
    : null;

  const pickupCoords: [number, number] = booking
    ? [parseFloat(booking.pickupLng as string), parseFloat(booking.pickupLat as string)]
    : [0, 0];

  const deliveryCoords: [number, number] = booking
    ? [parseFloat(booking.deliveryLng as string), parseFloat(booking.deliveryLat as string)]
    : [0, 0];

  const driverCoords: [number, number] = latestLocation
    ? [parseFloat(latestLocation.lng as string), parseFloat(latestLocation.lat as string)]
    : pickupCoords;

  if (!booking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-bold mb-2">Tracking Not Available</h2>
          <p className="text-muted-foreground">Unable to load booking details.</p>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    draft: "bg-gray-500",
    posted: "bg-blue-500",
    accepted: "bg-green-500",
    in_transit: "bg-yellow-500",
    delivered: "bg-emerald-500",
    canceled: "bg-red-500",
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-[Outfit]">Track Your Delivery</h1>
            <p className="text-muted-foreground mt-1">Booking #{booking.id.slice(0, 8)}</p>
          </div>
          <Badge className={statusColors[booking.status]} data-testid="badge-status">
            {booking.status.replace("_", " ").toUpperCase()}
          </Badge>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Live Tracking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[400px] rounded-lg overflow-hidden">
                  <LiveTrackingMap
                    bookingId={booking.id}
                    trackingUpdates={tracking}
                    pickupCoords={pickupCoords}
                    deliveryCoords={deliveryCoords}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Delivery Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-2" />
                    <div className="flex-1">
                      <p className="font-medium">Pickup Location</p>
                      <p className="text-sm text-muted-foreground">{booking.pickupAddress}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(booking.pickupDate), "MMM d, yyyy HH:mm")}
                      </p>
                    </div>
                  </div>

                  {tracking.map((update, index) => (
                    <div key={update.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                      <div className="flex-1">
                        <p className="font-medium capitalize">{update.status ? update.status.replace("_", " ") : "Update"}</p>
                        {update.note && (
                          <p className="text-sm text-muted-foreground">{update.note}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(update.createdAt), "MMM d, yyyy HH:mm")}
                        </p>
                      </div>
                    </div>
                  ))}

                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-muted mt-2" />
                    <div className="flex-1">
                      <p className="font-medium">Delivery Location</p>
                      <p className="text-sm text-muted-foreground">{booking.deliveryAddress}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Support Chat
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-[300px] overflow-y-auto space-y-3 p-3 bg-muted/30 rounded-lg">
                  {messages.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-8">
                      No messages yet. Start the conversation!
                    </p>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${
                          msg.sender === "customer" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] p-3 rounded-lg ${
                            msg.sender === "customer"
                              ? "bg-primary text-primary-foreground"
                              : "bg-card border"
                          }`}
                        >
                          <p className="text-sm">{msg.message}</p>
                          <p className="text-xs opacity-70 mt-1">
                            {format(new Date(msg.createdAt), "HH:mm")}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message..."
                    disabled={sendMessageMutation.isPending}
                    data-testid="input-support-message"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!message.trim() || sendMessageMutation.isPending}
                    data-testid="button-send-message"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Need help?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Our support team is available 24/7 to assist you with any questions about your delivery.
                </p>
                <Button variant="outline" className="w-full" data-testid="button-contact-support">
                  Contact Support
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
