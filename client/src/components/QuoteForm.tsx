import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, Calendar as CalendarIcon, DollarSign, Loader2, Navigation } from "lucide-react";
import { format } from "date-fns";
import type { Service } from "@shared/schema";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const quoteFormSchema = z.object({
  pickupAddress: z.string().min(5, "Pickup address is required"),
  deliveryAddress: z.string().min(5, "Delivery address is required"),
  pickupDate: z.date({
    required_error: "Please select a pickup date",
  }),
  distance: z.number().min(0.1, "Distance must be at least 0.1 miles"),
});

type QuoteFormData = z.infer<typeof quoteFormSchema>;

interface QuoteFormProps {
  service: Service;
  onNext: (data: QuoteFormData & { estimatedPrice: number }) => void;
  onBack: () => void;
}

export default function QuoteForm({ service, onNext, onBack }: QuoteFormProps) {
  const [date, setDate] = useState<Date>();
  const [distance, setDistance] = useState<number>(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null);
  const [deliveryCoords, setDeliveryCoords] = useState<[number, number] | null>(null);
  const { toast } = useToast();
  
  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      pickupAddress: "",
      deliveryAddress: "",
      distance: 0,
    },
  });

  const pickupAddress = form.watch("pickupAddress");
  const deliveryAddress = form.watch("deliveryAddress");

  // Geocode addresses and calculate distance
  useEffect(() => {
    const calculateDistance = async () => {
      if (!pickupAddress || pickupAddress.length < 5 || !deliveryAddress || deliveryAddress.length < 5) {
        return;
      }

      setIsCalculating(true);

      try {
        // Geocode pickup address
        const pickupRes = await apiRequest("POST", "/api/geocode", { address: pickupAddress });
        const pickupData = await pickupRes.json();

        if (!pickupData.coordinates) {
          toast({
            title: "Invalid pickup address",
            description: "Could not find the pickup location. Please check the address.",
            variant: "destructive",
          });
          setIsCalculating(false);
          return;
        }

        setPickupCoords(pickupData.coordinates);

        // Geocode delivery address
        const deliveryRes = await apiRequest("POST", "/api/geocode", { address: deliveryAddress });
        const deliveryData = await deliveryRes.json();

        if (!deliveryData.coordinates) {
          toast({
            title: "Invalid delivery address",
            description: "Could not find the delivery location. Please check the address.",
            variant: "destructive",
          });
          setIsCalculating(false);
          return;
        }

        setDeliveryCoords(deliveryData.coordinates);

        // Calculate route distance
        const routeRes = await apiRequest("POST", "/api/calculate-route", {
          pickupLng: pickupData.coordinates[0],
          pickupLat: pickupData.coordinates[1],
          deliveryLng: deliveryData.coordinates[0],
          deliveryLat: deliveryData.coordinates[1],
        });
        const routeData = await routeRes.json();

        if (routeData.distance) {
          // Distance is already in miles from the server
          setDistance(Number(routeData.distance.toFixed(1)));
          form.setValue("distance", Number(routeData.distance.toFixed(1)));
        }
      } catch (error) {
        toast({
          title: "Error calculating route",
          description: "Please check your addresses and try again.",
          variant: "destructive",
        });
      } finally {
        setIsCalculating(false);
      }
    };

    // Debounce the calculation
    const timeoutId = setTimeout(() => {
      if (pickupAddress.length >= 5 && deliveryAddress.length >= 5) {
        calculateDistance();
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [pickupAddress, deliveryAddress, form, toast]);

  const calculatePrice = () => {
    const basePrice = parseFloat(service.basePrice);
    const pricePerMile = parseFloat(service.pricePerMile);
    return basePrice + (distance * pricePerMile);
  };

  const estimatedPrice = calculatePrice();

  const onSubmit = (data: QuoteFormData) => {
    if (distance === 0) {
      toast({
        title: "Invalid route",
        description: "Please enter valid pickup and delivery addresses.",
        variant: "destructive",
      });
      return;
    }
    onNext({ ...data, estimatedPrice });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-foreground font-[Outfit] mb-2">
          Get Your Quote
        </h2>
        <p className="text-muted-foreground">
          Service: <span className="text-accent font-semibold">{service.name}</span>
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card className="p-6 border-card-border space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pickupAddress">Pickup Address</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="pickupAddress"
                placeholder="Enter pickup location (e.g., 123 Main St, City, State)"
                className="pl-10"
                {...form.register("pickupAddress")}
                data-testid="input-pickup-address"
              />
              {isCalculating && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-accent" />
              )}
            </div>
            {form.formState.errors.pickupAddress && (
              <p className="text-sm text-destructive">{form.formState.errors.pickupAddress.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="deliveryAddress">Delivery Address</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="deliveryAddress"
                placeholder="Enter delivery location (e.g., 456 Oak Ave, City, State)"
                className="pl-10"
                {...form.register("deliveryAddress")}
                data-testid="input-delivery-address"
              />
            </div>
            {form.formState.errors.deliveryAddress && (
              <p className="text-sm text-destructive">{form.formState.errors.deliveryAddress.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Pickup Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                  data-testid="button-pickup-date"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(newDate) => {
                    if (newDate) {
                      setDate(newDate);
                      form.setValue("pickupDate", newDate);
                    }
                  }}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {form.formState.errors.pickupDate && (
              <p className="text-sm text-destructive">{form.formState.errors.pickupDate.message}</p>
            )}
          </div>

          {distance > 0 && (
            <div className="flex items-center gap-2 p-3 bg-accent/5 rounded-lg border border-accent/20">
              <Navigation className="w-4 h-4 text-accent" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Route Distance</p>
                <p className="text-xs text-muted-foreground">
                  {distance.toFixed(1)} miles calculated via Mapbox
                </p>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6 bg-accent/5 border-accent/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Estimated Total</p>
              <div className="flex items-baseline gap-2">
                <DollarSign className="w-6 h-6 text-accent" />
                <span className="text-4xl font-bold text-foreground" data-testid="text-estimated-price">
                  ${estimatedPrice.toFixed(2)}
                </span>
              </div>
              {distance > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Base ${service.basePrice} + {distance.toFixed(1)} miles × ${service.pricePerMile}/mi
                </p>
              )}
            </div>
          </div>
        </Card>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="flex-1"
            data-testid="button-back"
          >
            Back
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={isCalculating || distance === 0}
            data-testid="button-get-quote"
          >
            {isCalculating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Calculating...
              </>
            ) : (
              "Continue to Booking"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
