import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Leaf, Route, Clock, TrendingDown } from "lucide-react";

interface RouteOption {
  id: string;
  name: string;
  distance: number;
  duration: number;
  co2kg: number;
  type: "fastest" | "eco" | "balanced";
}

interface EcoRoutingProps {
  from: string;
  to: string;
  onSelectRoute?: (route: RouteOption) => void;
}

export default function EcoRouting({ from, to, onSelectRoute }: EcoRoutingProps) {
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [routes, setRoutes] = useState<RouteOption[]>([]);

  useEffect(() => {
    const baseDistance = Math.random() * 50 + 20;
    const baseDuration = baseDistance * 1.5;
    
    const routeOptions: RouteOption[] = [
      {
        id: "eco",
        name: "Eco-Friendly Route",
        distance: baseDistance * 1.08,
        duration: baseDuration * 1.15,
        co2kg: baseDistance * 0.15,
        type: "eco",
      },
      {
        id: "fastest",
        name: "Fastest Route",
        distance: baseDistance * 0.95,
        duration: baseDuration * 0.85,
        co2kg: baseDistance * 0.22,
        type: "fastest",
      },
      {
        id: "balanced",
        name: "Balanced Route",
        distance: baseDistance,
        duration: baseDuration,
        co2kg: baseDistance * 0.18,
        type: "balanced",
      },
    ];

    setRoutes(routeOptions);
    setSelectedRoute(routeOptions[0].id);
  }, [from, to]);

  const handleSelectRoute = (route: RouteOption) => {
    setSelectedRoute(route.id);
    if (onSelectRoute) {
      onSelectRoute(route);
    }
  };

  const getRouteColor = (type: string) => {
    switch (type) {
      case "eco": return "border-green-500 bg-green-50 dark:bg-green-950/20";
      case "fastest": return "border-blue-500 bg-blue-50 dark:bg-blue-950/20";
      case "balanced": return "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20";
      default: return "border-border";
    }
  };

  const getRouteBadge = (type: string) => {
    switch (type) {
      case "eco": return { label: "Lowest CO₂", className: "bg-green-600 text-white" };
      case "fastest": return { label: "Fastest", className: "bg-blue-600 text-white" };
      case "balanced": return { label: "Recommended", className: "bg-yellow-600 text-white" };
      default: return { label: "", className: "" };
    }
  };

  if (routes.length === 0) {
    return null;
  }

  return (
    <Card data-testid="card-eco-routing">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="w-5 h-5 text-accent" />
          Route Options
        </CardTitle>
        <CardDescription>
          Choose the best route for your journey from {from} to {to}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {routes.map((route) => {
          const isSelected = selectedRoute === route.id;
          const badge = getRouteBadge(route.type);
          
          return (
            <div
              key={route.id}
              className={`relative border-2 rounded-lg p-4 transition-all ${
                isSelected ? getRouteColor(route.type) : "border-border hover-elevate"
              }`}
              data-testid={`route-option-${route.type}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{route.name}</h4>
                    {badge.label && (
                      <Badge className={badge.className}>{badge.label}</Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Route className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {route.distance.toFixed(1)} km
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {Math.round(route.duration)} min
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Leaf className="w-4 h-4 text-green-600" />
                      <span className="font-medium text-green-700 dark:text-green-400">
                        {route.co2kg.toFixed(2)} kg CO₂
                      </span>
                    </div>
                  </div>

                  {route.type === "eco" && (
                    <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                      <TrendingDown className="w-3 h-3" />
                      <span>Reduces emissions by 30% compared to fastest route</span>
                    </div>
                  )}
                </div>

                <Button
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSelectRoute(route)}
                  data-testid={`button-select-route-${route.type}`}
                >
                  {isSelected ? "Selected" : "Select"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
