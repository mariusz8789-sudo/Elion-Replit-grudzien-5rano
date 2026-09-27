import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, DollarSign, Clock, MessageSquare, CheckCircle, Truck } from "lucide-react";
import { format } from "date-fns";
import type { Offer } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface OffersDialogProps {
  bookingId: string;
  trigger?: React.ReactNode;
}

export default function OffersDialog({ bookingId, trigger }: OffersDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: offers = [], isLoading } = useQuery<Offer[]>({
    queryKey: ["/api/bookings", bookingId, "offers"],
    enabled: open,
  });

  const acceptOfferMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const response = await apiRequest("PATCH", `/api/offers/${offerId}/accept`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Offer accepted!",
        description: "The provider will be notified and will start preparing for your delivery.",
      });
      setOpen(false);
    },
    onError: () => {
      toast({
        title: "Failed to accept offer",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  const rejectOfferMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const response = await apiRequest("PATCH", `/api/offers/${offerId}/reject`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "offers"] });
      toast({
        title: "Offer rejected",
        description: "The provider has been notified.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to reject offer",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" data-testid={`button-view-offers-${bookingId}`}>
            <DollarSign className="w-4 h-4 mr-2" />
            View Offers ({offers.length})
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-foreground">
            Service Provider Offers
          </DialogTitle>
          <DialogDescription>
            Review and accept offers from logistics providers for your booking
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-8">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : offers.length === 0 ? (
          <div className="text-center py-12">
            <Truck className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No offers yet
            </h3>
            <p className="text-muted-foreground">
              Service providers will submit offers for your booking soon
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {offers.map((offer) => {
              const isAccepted = offer.status === "accepted";
              const isRejected = offer.status === "rejected";
              const isPending = offer.status === "pending";

              return (
                <Card
                  key={offer.id}
                  className={`p-4 ${isAccepted ? "border-primary" : ""}`}
                  data-testid={`card-offer-${offer.id}`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="w-12 h-12">
                          <AvatarFallback className="bg-accent/20 text-accent font-semibold">
                            {offer.companyId?.substring(0, 2).toUpperCase() || "CO"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-foreground">
                              Provider #{offer.companyId?.substring(0, 8)}
                            </h4>
                            {isAccepted && (
                              <Badge variant="default" className="gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Accepted
                              </Badge>
                            )}
                            {isRejected && (
                              <Badge variant="secondary">Rejected</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Submitted {format(new Date(offer.createdAt), "PPp")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-accent" data-testid={`text-offer-price-${offer.id}`}>
                          ${offer.price}
                        </p>
                      </div>
                    </div>

                    {offer.estimatedPickupTime && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          Estimated pickup:{" "}
                          <span className="text-foreground font-medium">
                            {format(new Date(offer.estimatedPickupTime), "PPp")}
                          </span>
                        </span>
                      </div>
                    )}

                    {offer.message && (
                      <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                        <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <p className="text-sm text-foreground flex-1">{offer.message}</p>
                      </div>
                    )}

                    {isPending && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => acceptOfferMutation.mutate(offer.id)}
                          disabled={acceptOfferMutation.isPending}
                          data-testid={`button-accept-offer-${offer.id}`}
                        >
                          {acceptOfferMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Accepting...
                            </>
                          ) : (
                            "Accept Offer"
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => rejectOfferMutation.mutate(offer.id)}
                          disabled={rejectOfferMutation.isPending}
                          data-testid={`button-reject-offer-${offer.id}`}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
