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
import { Badge } from "@/components/ui/badge";
import { CreditCard, Lock, CheckCircle, Loader2, DollarSign } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PaymentDialogProps {
  bookingId: string;
  amount: string;
  paymentStatus?: string;
}

export default function PaymentDialog({ bookingId, amount, paymentStatus }: PaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const { toast } = useToast();

  const createPaymentMutation = useMutation({
    mutationFn: async () => {
      // Create payment intent
      const response = await apiRequest("POST", "/api/create-payment-intent", {
        amount: parseFloat(amount),
        bookingId,
      });
      const data = await response.json();
      
      // Simulate payment success (in real app, would use Stripe Elements)
      // For demo purposes, we'll mark as paid immediately
      await apiRequest("PATCH", `/api/bookings/${bookingId}/payment`, {
        paymentIntentId: data.paymentIntentId,
        paymentStatus: "captured",
      });

      return data;
    },
    onSuccess: () => {
      setPaymentSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId] });
      toast({
        title: "Payment successful!",
        description: "Your booking has been paid for successfully.",
      });
      
      setTimeout(() => {
        setOpen(false);
        setPaymentSuccess(false);
      }, 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Payment failed",
        description: error.message || "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  const isPaid = paymentStatus === "captured" || paymentStatus === "succeeded";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isPaid ? (
          <Button variant="outline" size="sm" disabled data-testid={`button-payment-${bookingId}`}>
            <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
            Paid
          </Button>
        ) : (
          <Button size="sm" data-testid={`button-payment-${bookingId}`}>
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
              <h3 className="text-xl font-semibold text-foreground mb-2">Payment Successful!</h3>
              <p className="text-muted-foreground">
                Your booking has been confirmed and paid
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
                Booking ID: {bookingId.substring(0, 8)}
              </div>
            </Card>

            <div className="space-y-3">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-semibold text-foreground mb-2">Demo Payment</h4>
                <p className="text-sm text-muted-foreground">
                  This is a demo implementation. In production, Stripe Elements would be integrated here
                  for secure card input.
                </p>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="w-4 h-4" />
                <span>Secured by Stripe</span>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => createPaymentMutation.mutate()}
              disabled={createPaymentMutation.isPending}
              data-testid="button-confirm-payment"
            >
              {createPaymentMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing Payment...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Complete Payment ${amount}
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Your payment information is encrypted and secure
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
