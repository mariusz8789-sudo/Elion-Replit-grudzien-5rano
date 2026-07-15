import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, Route, Clock, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface RouteLeg {
  distanceKm: number;
  durationMin: number;
  co2Kg: number;
}

interface OptimizeRouteResult {
  available: boolean;
  alternativeRouteCount: number;
  hasGreenerAlternative: boolean;
  standard: RouteLeg;
  optimized: RouteLeg;
  co2SavedKg: number;
}

export default function EcoRouting() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [result, setResult] = useState<OptimizeRouteResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/eco/optimize-route", { origin: from, destination: to, vehicleType: "van" });
      return res.json() as Promise<OptimizeRouteResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setErrorMessage(null);
    },
    onError: (error: any) => {
      setResult(null);
      setErrorMessage(error.message || "Route lookup failed");
    },
  });

  return (
    <Card data-testid="card-eco-routing">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="w-5 h-5 text-accent" />
          Route Comparison
        </CardTitle>
        <CardDescription>
          Real Mapbox route data compared by CO₂ emissions - no route is shown unless Mapbox actually returns one
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="eco-route-from">From</Label>
            <Input id="eco-route-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Enter origin address" data-testid="input-eco-route-from" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="eco-route-to">To</Label>
            <Input id="eco-route-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Enter destination address" data-testid="input-eco-route-to" />
          </div>
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!from || !to || mutation.isPending}
          data-testid="button-eco-route-search"
        >
          {mutation.isPending ? "Comparing routes..." : "Compare Routes"}
        </Button>

        {errorMessage && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm" data-testid="text-eco-route-error">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            {!result.hasGreenerAlternative && (
              <p className="text-sm text-muted-foreground">
                Mapbox found no lower-emission alternative for this trip - the standard route is already the best option.
              </p>
            )}
            <div className="grid gap-3">
              <div className="border-2 rounded-lg p-4 border-border" data-testid="route-option-standard">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Standard Route</h4>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Route className="w-4 h-4" />{result.standard.distanceKm} km</span>
                  <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{result.standard.durationMin} min</span>
                  <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400 font-medium"><Leaf className="w-4 h-4" />{result.standard.co2Kg} kg CO₂</span>
                </div>
              </div>

              <div className={`border-2 rounded-lg p-4 ${result.hasGreenerAlternative ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-border"}`} data-testid="route-option-eco">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Lowest-CO₂ Route</h4>
                  {result.hasGreenerAlternative && <Badge className="bg-green-600 text-white">Lowest CO₂</Badge>}
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Route className="w-4 h-4" />{result.optimized.distanceKm} km</span>
                  <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{result.optimized.durationMin} min</span>
                  <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400 font-medium"><Leaf className="w-4 h-4" />{result.optimized.co2Kg} kg CO₂</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
