import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { CreditCard, Lock, CheckCircle, Loader2, DollarSign, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";

interface PaymentDialogProps {
  bookingId?: string;
  capacityBookingId?: string;
  amount: string;
  paymentStatus?: string;
  onPaid?: () => void;
}

function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    setSubmitting(false);

    if (error) {
      toast({
        title: "Payment failed",
        description: error.message || "Please check your card details and try again.",
        variant: "destructive",
      });
      return;
    }

    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "requires_capture")) {
      onSuccess();
    }
  };

  return (
    <div className="space-y-6">
      <PaymentElement />
      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={!stripe || submitting}
        data-testid="button-confirm-payment"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing Payment...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4 mr-2" />
            Complete Payment
          </>
        )}
      </Button>
      <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
        <Lock className="w-4 h-4" />
        <span>Secured by Stripe</span>
      </div>
    </div>
  );
}

export default function PaymentDialog({ bookingId, capacityBookingId, amount, paymentStatus, onPaid }: PaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const { toast } = useToast();
  const entityId = capacityBookingId || bookingId || "";

  const createIntentMutation = useMutation({
    mutationFn: async () => {
      const response = capacityBookingId
        ? await apiRequest("POST", `/api/capacity-bookings/${capacityBookingId}/create-payment-intent`, { amount: parseFloat(amount) })
        : await apiRequest("POST", "/api/create-payment-intent", { amount: parseFloat(amount), bookingId });
      return response.json();
    },
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
    },
    onError: (error: any) => {
      toast({
        title: "Could not start payment",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !clientSecret && !createIntentMutation.isPending) {
      createIntentMutation.mutate();
    }
    if (!next) {
      setClientSecret(null);
      setPaymentSuccess(false);
    }
  };

  const handlePaymentSuccess = () => {
    setPaymentSuccess(true);
    // Stripe's webhook (server/routes.ts /api/stripe-webhook) is the source of truth for
    // payment status; just refresh so the UI reflects it once the webhook lands.
    if (capacityBookingId) {
      onPaid?.();
    } else {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId] });
    }
    toast({
      title: "Payment submitted",
      description: "Your payment is being confirmed.",
    });
    setTimeout(() => {
      setOpen(false);
      setPaymentSuccess(false);
      setClientSecret(null);
    }, 2000);
  };

  const isPaid = paymentStatus === "captured" || paymentStatus === "succeeded" || paymentStatus === "authorized";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isPaid ? (
          <Button variant="outline" size="sm" disabled data-testid={`button-payment-${entityId}`}>
            <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
            Paid
          </Button>
        ) : (
          <Button size="sm" data-testid={`button-payment-${entityId}`}>
            <CreditCard className="w-4 h-4 mr-2" />
            Pay Now
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-accent" />
            Payment
          </DialogTitle>
          <DialogDescription>
            Secure payment powered by Stripe
          </DialogDescription>
        </DialogHeader>

        {paymentSuccess ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-500" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Payment Submitted</h3>
              <p className="text-muted-foreground">
                Your booking payment is being confirmed
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <Card className="p-6 bg-accent/5 border-accent/20">
              <div className="flex items-center justify-between mb-4">
                <span className="text-muted-foreground">Total Amount</span>
                <div className="flex items-baseline gap-1">
                  <DollarSign className="w-5 h-5 text-accent" />
                  <span className="text-3xl font-bold text-foreground">{amount}</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {capacityBookingId ? "Claim ID" : "Booking ID"}: {entityId.substring(0, 8)}
              </div>
            </Card>

            {createIntentMutation.isPending && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Preparing secure payment form...
              </div>
            )}

            {createIntentMutation.isError && (
              <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Could not start payment. Please close this dialog and try again.
              </div>
            )}

            {clientSecret && (
              <Elements stripe={getStripe()} options={{ clientSecret }}>
                <CheckoutForm onSuccess={handlePaymentSuccess} />
              </Elements>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
