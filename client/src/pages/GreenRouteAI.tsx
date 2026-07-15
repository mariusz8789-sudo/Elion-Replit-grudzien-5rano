import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, MapPin, Zap, TrendingDown, Route, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
  vehicleType: string;
  standard: RouteLeg;
  optimized: RouteLeg;
  distanceSavedKm: number;
  timeSavedMin: number;
  co2SavedKg: number;
  fuelSavedLiters: number;
}

export default function GreenRouteAI() {
  const { t } = useTranslation();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [vehicleType, setVehicleType] = useState("van");
  const [result, setResult] = useState<OptimizeRouteResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/eco/optimize-route", { origin, destination, vehicleType });
      return res.json() as Promise<OptimizeRouteResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setErrorMessage(null);
    },
    onError: (error: any) => {
      setResult(null);
      setErrorMessage(error.message || "Route calculation failed");
    },
  });

  const handleOptimize = () => {
    setErrorMessage(null);
    optimizeMutation.mutate();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-lg">
          <Leaf className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t("GreenRoute")}</h1>
          <p className="text-muted-foreground">{t("Real Mapbox route comparison for lower CO₂ emissions")}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="w-5 h-5" />
              {t("Route Comparison")}
            </CardTitle>
            <CardDescription>{t("Compares real Mapbox route alternatives by CO₂ emissions")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="origin">{t("From")}</Label>
              <Input
                id="origin"
                data-testid="input-origin"
                placeholder={t("Enter origin address")}
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="destination">{t("To")}</Label>
              <Input
                id="destination"
                data-testid="input-destination"
                placeholder={t("Enter destination address")}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>

            <div>
              <Label>{t("Vehicle Type")}</Label>
              <Select value={vehicleType} onValueChange={setVehicleType}>
                <SelectTrigger data-testid="select-vehicle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="van">Van (diesel)</SelectItem>
                  <SelectItem value="truck">Truck (diesel)</SelectItem>
                  <SelectItem value="electric">Electric Van</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              onClick={handleOptimize}
              disabled={!origin || !destination || optimizeMutation.isPending}
              data-testid="button-optimize"
            >
              {optimizeMutation.isPending ? (
                <>
                  <Zap className="w-4 h-4 mr-2 animate-pulse" />
                  {t("Calculating routes...")}
                </>
              ) : (
                <>
                  <Route className="w-4 h-4 mr-2" />
                  {t("Compare Routes")}
                </>
              )}
            </Button>

            {errorMessage && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm" data-testid="text-error">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <Leaf className="w-5 h-5" />
                {result.hasGreenerAlternative ? t("Greener Route Found") : t("Route Comparison")}
              </CardTitle>
              <CardDescription>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" data-testid="badge-route-count">
                    {result.alternativeRouteCount} {t("route(s) from Mapbox")}
                  </Badge>
                </div>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!result.hasGreenerAlternative && (
                <p className="text-sm text-muted-foreground">
                  {t("Mapbox found no lower-emission alternative for this trip - the standard route is already the best option.")}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">{t("Distance Saved")}</div>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-distance-saved">
                    {result.distanceSavedKm.toFixed(1)} km
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">{t("CO₂ Saved")}</div>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-co2-saved">
                    {result.co2SavedKg} kg
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">{t("Fuel Saved")}</div>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-fuel-saved">
                    {result.fuelSavedLiters} L
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">{t("Time Saved")}</div>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-time-saved">
                    {result.timeSavedMin} min
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" />
                  {t("Route Details")}
                </Label>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2 p-2 bg-muted rounded">
                    <MapPin className="w-4 h-4 mt-0.5" />
                    <span>
                      {t("Standard route")}: {result.standard.distanceKm} km, {result.standard.durationMin} min, {result.standard.co2Kg} kg CO₂
                    </span>
                  </div>
                  <div className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-950/20 rounded">
                    <MapPin className="w-4 h-4 text-green-600 mt-0.5" />
                    <span>
                      {t("Lowest-CO₂ route")}: {result.optimized.distanceKm} km, {result.optimized.durationMin} min, {result.optimized.co2Kg} kg CO₂
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("How GreenRoute Works")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                <Route className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">{t("Real Routing")}</h3>
              <p className="text-sm text-muted-foreground">{t("Fetches real alternative routes from Mapbox Directions")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                <Leaf className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">{t("Shared CO₂ Methodology")}</h3>
              <p className="text-sm text-muted-foreground">{t("Uses the same emission factors as bookings and the eco dashboard")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                <TrendingDown className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">{t("Honest Results")}</h3>
              <p className="text-sm text-muted-foreground">{t("Shows no savings when no greener alternative actually exists")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
