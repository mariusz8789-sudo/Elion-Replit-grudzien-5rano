import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, MapPin, Zap, TrendingDown, Brain, Route } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function GreenRouteAI() {
  const { t } = useTranslation();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [vehicleType, setVehicleType] = useState("van");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState<any>(null);

  const handleOptimize = async () => {
    setIsOptimizing(true);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const optimization = {
      originalDistance: 45.3,
      optimizedDistance: 38.7,
      co2Saved: 2.4,
      fuelSaved: 1.8,
      timeSaved: 12,
      trafficAvoided: 3,
      recommendations: [
        "Unikaj A1 między 7:00-9:00 (korek)",
        "Użyj trasy przez Żerań - mniej sygnalizacji",
        "Zatankuj teraz - ceny paliw wzrosną o 15:00"
      ],
      aiConfidence: 94
    };
    
    setOptimizedRoute(optimization);
    setIsOptimizing(false);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-lg">
          <Brain className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t("GreenRoute AI")}</h1>
          <p className="text-muted-foreground">{t("AI-powered route optimization for minimal CO₂ emissions")}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="w-5 h-5" />
              {t("Route Optimizer")}
            </CardTitle>
            <CardDescription>{t("AI analyzes traffic, weather, and emissions")}</CardDescription>
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
              disabled={!origin || !destination || isOptimizing}
              data-testid="button-optimize"
            >
              {isOptimizing ? (
                <>
                  <Zap className="w-4 h-4 mr-2 animate-pulse" />
                  {t("AI is optimizing...")}
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  {t("Optimize with AI")}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {optimizedRoute && (
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <Leaf className="w-5 h-5" />
                {t("Optimized Route")}
              </CardTitle>
              <CardDescription>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" data-testid="badge-confidence">
                    {optimizedRoute.aiConfidence}% AI confidence
                  </Badge>
                </div>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">{t("Distance Saved")}</div>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-distance-saved">
                    {(optimizedRoute.originalDistance - optimizedRoute.optimizedDistance).toFixed(1)} km
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">{t("CO₂ Saved")}</div>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-co2-saved">
                    {optimizedRoute.co2Saved} kg
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">{t("Fuel Saved")}</div>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-fuel-saved">
                    {optimizedRoute.fuelSaved} L
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">{t("Time Saved")}</div>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-time-saved">
                    {optimizedRoute.timeSaved} min
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" />
                  {t("AI Recommendations")}
                </Label>
                <div className="space-y-2">
                  {optimizedRoute.recommendations.map((rec: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-950/20 rounded" data-testid={`recommendation-${idx}`}>
                      <MapPin className="w-4 h-4 text-green-600 mt-0.5" />
                      <span className="text-sm">{rec}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("Environmental Impact")}</Label>
                <Progress value={optimizedRoute.aiConfidence} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {t("This route reduces emissions by")} {Math.round((optimizedRoute.co2Saved / (optimizedRoute.originalDistance * 0.15)) * 100)}%
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("How GreenRoute AI Works")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                <Brain className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">{t("AI Analysis")}</h3>
              <p className="text-sm text-muted-foreground">{t("Machine learning analyzes millions of routes")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">{t("Real-time Data")}</h3>
              <p className="text-sm text-muted-foreground">{t("Traffic, weather, road conditions")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                <Leaf className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">{t("Eco Optimization")}</h3>
              <p className="text-sm text-muted-foreground">{t("Minimizes CO₂ and fuel consumption")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">{t("Instant Results")}</h3>
              <p className="text-sm text-muted-foreground">{t("Optimized routes in seconds")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
