import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Users, MapPin, Calendar, DollarSign, Leaf, Plus } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SharedRide } from "@shared/schema";
import { insertSharedRideSchema } from "@shared/schema";

const formSchema = insertSharedRideSchema.extend({
  departureTime: z.string(),
  pricePerSeat: z.string(),
});

export default function CarpoolPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [bookingRideId, setBookingRideId] = useState<string | null>(null);
  const [seatsBooked, setSeatsBooked] = useState("1");
  const { toast } = useToast();

  const { data: rides = [], isLoading } = useQuery<SharedRide[]>({
    queryKey: ["/api/carpool"],
    queryFn: async () => {
      const response = await fetch("/api/carpool");
      if (!response.ok) throw new Error("Failed to fetch rides");
      return response.json();
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fromAddress: "",
      toAddress: "",
      departureTime: "",
      availableSeats: 1,
      pricePerSeat: "",
      vehicleInfo: "",
      isRecurring: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await apiRequest("POST", "/api/carpool", {
        ...data,
        departureTime: new Date(data.departureTime).toISOString(),
        pricePerSeat: parseFloat(data.pricePerSeat),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carpool"] });
      toast({
        title: "Ride created!",
        description: "Your carpool ride is now available for booking.",
      });
      form.reset();
      setIsCreateOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create ride",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    await createMutation.mutateAsync(data);
  };

  const bookRideMutation = useMutation({
    mutationFn: async ({ rideId, seats }: { rideId: string; seats: number }) => {
      const response = await apiRequest("POST", `/api/carpool/${rideId}/book`, { seatsBooked: seats });
      if (!response.ok) throw new Error((await response.json()).message || "Failed to book ride");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carpool"] });
      toast({ title: "Seat booked!", description: "Your carpool seat has been reserved." });
      setBookingRideId(null);
      setSeatsBooked("1");
    },
    onError: (error: any) => {
      toast({ title: "Could not book ride", description: error.message, variant: "destructive" });
    },
  });

  const filteredRides = rides.filter((ride) => 
    ride.fromAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ride.toAddress.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold font-[Outfit] flex items-center gap-2">
              <Users className="w-8 h-8 text-accent" />
              Carpooling & Shared Rides
            </h1>
            <p className="text-muted-foreground mt-1">
              Share rides, split costs, reduce emissions
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-ride">
            <Plus className="w-4 h-4 mr-2" />
            Offer a Ride
          </Button>
        </div>

        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by origin or destination..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-rides"
          />
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredRides.length === 0 ? (
          <Card className="p-12 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No rides available</h3>
            <p className="text-muted-foreground">
              {searchQuery ? "Try adjusting your search" : "Be the first to offer a ride"}
            </p>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {filteredRides.map((ride) => (
              <Card key={ride.id} className="hover-elevate" data-testid={`card-ride-${ride.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span className="font-semibold">{ride.fromAddress}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <div className="w-4 h-4 flex items-center justify-center">→</div>
                        <span>{ride.toAddress}</span>
                      </div>
                    </div>
                    {ride.isRecurring && (
                      <Badge variant="outline" className="shrink-0">Recurring</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>{format(new Date(ride.departureTime), "MMM d, HH:mm")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span>{ride.availableSeats} seats</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-accent" />
                      <span className="font-semibold">${ride.pricePerSeat}/seat</span>
                    </div>
                    {ride.co2Saved && (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <Leaf className="w-4 h-4" />
                        <span className="text-xs">{ride.co2Saved}kg CO₂ saved</span>
                      </div>
                    )}
                  </div>
                  
                  {ride.vehicleInfo && (
                    <p className="text-sm text-muted-foreground border-t pt-2">
                      Vehicle: {ride.vehicleInfo}
                    </p>
                  )}

                  <Dialog open={bookingRideId === ride.id} onOpenChange={(open) => { setBookingRideId(open ? ride.id : null); setSeatsBooked("1"); }}>
                    <DialogTrigger asChild>
                      <Button className="w-full" size="sm" disabled={ride.availableSeats < 1} data-testid={`button-book-${ride.id}`}>
                        {ride.availableSeats < 1 ? "Fully booked" : "Book Ride"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Book {ride.fromAddress} &rarr; {ride.toAddress}</DialogTitle>
                        <DialogDescription>{ride.availableSeats} seat(s) available at ${ride.pricePerSeat}/seat</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                        <Input
                          type="number"
                          min={1}
                          max={ride.availableSeats}
                          value={seatsBooked}
                          onChange={(e) => setSeatsBooked(e.target.value)}
                          data-testid={`input-seats-${ride.id}`}
                        />
                        <Button
                          className="w-full"
                          onClick={() => bookRideMutation.mutate({ rideId: ride.id, seats: Number(seatsBooked) })}
                          disabled={!seatsBooked || Number(seatsBooked) < 1 || bookRideMutation.isPending}
                          data-testid={`button-confirm-book-${ride.id}`}
                        >
                          Confirm Booking (${(Number(seatsBooked || 0) * Number(ride.pricePerSeat)).toFixed(2)})
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Offer a Shared Ride</DialogTitle>
            <DialogDescription>
              Help others save money and reduce carbon emissions
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="fromAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Origin address"
                          {...field}
                          data-testid="input-from-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="toAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>To</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Destination address"
                          {...field}
                          data-testid="input-to-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="departureTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Departure Time</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          {...field}
                          data-testid="input-departure-time"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="availableSeats"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Available Seats</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                          data-testid="input-available-seats"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pricePerSeat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price per Seat ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          data-testid="input-price-per-seat"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="vehicleInfo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle Info (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Toyota Camry 2020, Blue"
                        value={field.value || ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        data-testid="input-vehicle-info"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  data-testid="button-cancel-ride"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-submit-ride"
                >
                  {createMutation.isPending ? "Creating..." : "Create Ride"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
