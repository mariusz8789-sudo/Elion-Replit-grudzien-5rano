import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import ServiceSelection from "./ServiceSelection";
import QuoteForm from "./QuoteForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Phone, User } from "lucide-react";
import type { Service } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

type BookingStep = "service" | "quote" | "details" | "confirmation";

interface QuoteData {
  pickupAddress: string;
  deliveryAddress: string;
  pickupDate: Date;
  distance: number;
  estimatedPrice: number;
  vehicleType?: string;
  co2Emission?: number;
}

export default function BookingFlow() {
  const [step, setStep] = useState<BookingStep>("service");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
  const [userDetails, setUserDetails] = useState({ name: "", phone: "", email: "" });
  const [couponCode, setCouponCode] = useState("");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const createBookingMutation = useMutation({
    mutationFn: async (bookingData: any) => {
      const response = await apiRequest("POST", "/api/bookings", bookingData);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      setBookingId(data.id);
      setStep("confirmation");
      toast({
        title: "Booking confirmed!",
        description: "Your moving service has been booked successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Booking failed",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  const handleServiceSelect = (service: Service) => {
    setSelectedService(service);
    setStep("quote");
  };

  const handleQuoteNext = (data: QuoteData) => {
    setQuoteData(data);
    setStep("details");
  };

  const handleFinalBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedService || !quoteData) return;

    // If the visitor is already signed in, book under their own account. Otherwise create a
    // brand-new guest account and let the server log it in immediately (POST /api/users
    // generates and hashes a random password server-side — no password ever passes through
    // this form). If that phone number is already registered, we can't safely guess a
    // password on their behalf, so we ask them to log in instead of proceeding.
    let userId: string | null = user?.id ?? null;

    if (!userId) {
      try {
        const createResponse = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: userDetails.name,
            phone: userDetails.phone,
            email: userDetails.email || undefined,
          }),
        });

        if (createResponse.status === 409) {
          toast({
            title: "Account already exists",
            description: "This phone number is already registered. Please log in to continue with your booking.",
            variant: "destructive",
          });
          return;
        }
        if (!createResponse.ok) {
          throw new Error("Failed to create account");
        }

        const newUser = await createResponse.json();
        userId = newUser.id;
      } catch {
        toast({
          title: "User creation failed",
          description: "Please try again",
          variant: "destructive",
        });
        return;
      }
    }

    if (!userId) {
      toast({
        title: "Error",
        description: "Could not create or find user",
        variant: "destructive",
      });
      return;
    }

    const distanceKm = quoteData.distance * 1.60934;
    const emissionFactors: Record<string, number> = {
      "electric_van": 0.053,
      "hybrid_van": 0.192,
      "diesel_van": 0.271,
      "electric_truck": 0.089,
      "diesel_truck": 0.989,
      "petrol_car": 0.192,
      "default": 0.271
    };
    
    const vehicleType = quoteData.vehicleType ?? (selectedService.name.toLowerCase().includes("truck") ? "diesel_truck" : "diesel_van");
    const emissionFactor = emissionFactors[vehicleType] || emissionFactors["default"];
    const co2Emission = distanceKm * emissionFactor;

    createBookingMutation.mutate({
      userId,
      serviceId: selectedService.id,
      pickupAddress: quoteData.pickupAddress,
      deliveryAddress: quoteData.deliveryAddress,
      pickupDate: quoteData.pickupDate.toISOString(),
      estimatedDistance: quoteData.distance.toString(),
      totalPrice: quoteData.estimatedPrice.toFixed(2),
      co2Emission: co2Emission.toFixed(2),
      couponCode: couponCode.trim() || undefined,
      // Publish the request to the bidding marketplace so companies can compete for
      // it right away (server maps isPublic -> status "posted"). This is what makes
      // the booking visible in the public feed and eligible to receive offers.
      isPublic: true,
    });
  };

  if (step === "service") {
    return <ServiceSelection onSelect={handleServiceSelect} />;
  }

  if (step === "quote" && selectedService) {
    return (
      <QuoteForm
        service={selectedService}
        onNext={handleQuoteNext}
        onBack={() => setStep("service")}
      />
    );
  }

  if (step === "details" && selectedService && quoteData) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-foreground font-[Outfit] mb-2">
            Your Details
          </h2>
          <p className="text-muted-foreground">
            Just a few more details to confirm your booking
          </p>
        </div>

        <form onSubmit={handleFinalBooking} className="space-y-6">
          <Card className="p-6 border-card-border space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="name"
                  placeholder="John Doe"
                  className="pl-10"
                  value={userDetails.name}
                  onChange={(e) => setUserDetails({ ...userDetails, name: e.target.value })}
                  required
                  data-testid="input-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  className="pl-10"
                  value={userDetails.phone}
                  onChange={(e) => setUserDetails({ ...userDetails, phone: e.target.value })}
                  required
                  data-testid="input-phone"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email (Optional)</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={userDetails.email}
                onChange={(e) => setUserDetails({ ...userDetails, email: e.target.value })}
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="coupon">Coupon Code (Optional)</Label>
              <Input
                id="coupon"
                placeholder="SAVE10"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                data-testid="input-coupon-code"
              />
            </div>
          </Card>

          <Card className="p-6 bg-muted/50 border-card-border">
            <h3 className="font-semibold text-foreground mb-3">Booking Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service</span>
                <span className="font-medium">{selectedService.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">From</span>
                <span className="font-medium">{quoteData.pickupAddress}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">To</span>
                <span className="font-medium">{quoteData.deliveryAddress}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Distance</span>
                <span className="font-medium">{quoteData.distance} miles</span>
              </div>
              <div className="pt-2 mt-2 border-t border-border flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="text-2xl font-bold text-accent">${quoteData.estimatedPrice.toFixed(2)}</span>
              </div>
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("quote")}
              className="flex-1"
              data-testid="button-back"
            >
              Back
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={createBookingMutation.isPending}
              data-testid="button-confirm-booking"
            >
              {createBookingMutation.isPending ? "Booking..." : "Confirm Booking"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  if (step === "confirmation" && bookingId) {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto">
          <Check className="w-10 h-10 text-green-600 dark:text-green-500" />
        </div>
        <h2 className="text-3xl font-bold text-foreground font-[Outfit]">
          Booking Confirmed!
        </h2>
        <p className="text-muted-foreground">
          We'll send you a confirmation shortly. A driver will be assigned to your move.
        </p>

        <Card className="text-left">
          <div className="p-6 space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Booking ID</p>
              <p className="font-medium text-foreground" data-testid="text-booking-id">{bookingId.substring(0, 8)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Service</p>
              <p className="font-medium text-foreground">{selectedService?.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="font-medium text-foreground">${quoteData?.estimatedPrice.toFixed(2)}</p>
            </div>
          </div>
        </Card>

        <div className="flex gap-3 justify-center flex-wrap">
          <Button
            variant="default"
            onClick={() => window.location.href = `/track/${bookingId}`}
            data-testid="button-track-booking"
          >
            Track Your Delivery
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = "/"}
            data-testid="button-back-home"
          >
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
