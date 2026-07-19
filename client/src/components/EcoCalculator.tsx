import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Leaf, AlertTriangle, Info } from "lucide-react";
import { EMISSION_FACTORS_KG_PER_KM, type CanonicalVehicleClass } from "@shared/environmentalCalculation";

interface EcoCalculatorProps {
  distance?: number;
  onCalculate?: (co2kg: number, vehicleType: string) => void;
}

// Same canonical factor table used by bookings, Road Services, and GreenRoute - no separate
// client-only numbers, so a "0.256 kg/km van" here always means the same thing everywhere.
const VEHICLE_LABELS: Record<CanonicalVehicleClass, { label: string; description: string }> = {
  electric: { label: "Electric Vehicle", description: "Zero emissions - battery powered" },
  hybrid: { label: "Hybrid Vehicle", description: "Reduced emissions vs. a standard van" },
  car: { label: "Car", description: "Standard passenger car" },
  van: { label: "Standard Van", description: "Medium commercial van" },
  truck_light: { label: "Light Truck", description: "Light-duty cargo truck (~7.5t)" },
  truck_medium: { label: "Medium Truck", description: "Standard cargo truck" },
  truck_heavy: { label: "Heavy Truck/Lorry", description: "Heavy goods vehicle" },
  motorcycle: { label: "Motorcycle", description: "Two-wheel transport" },
  bicycle: { label: "Bicycle", description: "Zero emissions - pedal powered" },
};

export default function EcoCalculator({ distance: initialDistance, onCalculate }: EcoCalculatorProps) {
  const [distance, setDistance] = useState<number>(initialDistance || 0);
  const [vehicleType, setVehicleType] = useState<CanonicalVehicleClass>("van");

  const factor = EMISSION_FACTORS_KG_PER_KM[vehicleType];
  const selectedVehicle = { factor, ...VEHICLE_LABELS[vehicleType] };
  const co2kg = Number((distance * factor).toFixed(2));
  
  const getImpactLevel = (co2: number): { level: string; color: string; icon: any } => {
    if (co2 < 5) return { level: "Low", color: "bg-green-500", icon: Leaf };
    if (co2 < 20) return { level: "Moderate", color: "bg-yellow-500", icon: Info };
    return { level: "High", color: "bg-red-500", icon: AlertTriangle };
  };

  const impact = getImpactLevel(co2kg);
  const trees = Math.ceil(co2kg / 0.021);

  const handleCalculate = () => {
    if (onCalculate) {
      onCalculate(co2kg, vehicleType);
    }
  };

  return (
    <Card data-testid="card-eco-calculator">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Leaf className="w-5 h-5 text-green-600" />
              CO₂ Emissions Calculator
            </CardTitle>
            <CardDescription>
              Calculate environmental impact of your transport
            </CardDescription>
          </div>
          <Badge className={`${impact.color} text-white`}>
            <impact.icon className="w-3 h-3 mr-1" />
            {impact.level} Impact
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="distance">Distance (km)</Label>
            <Input
              id="distance"
              type="number"
              value={distance}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setDistance(val);
                handleCalculate();
              }}
              placeholder="Enter distance"
              data-testid="input-eco-distance"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="vehicle">Vehicle Type</Label>
            <Select value={vehicleType} onValueChange={(val) => {
              setVehicleType(val as CanonicalVehicleClass);
              handleCalculate();
            }}>
              <SelectTrigger id="vehicle" data-testid="select-eco-vehicle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(VEHICLE_LABELS).map(([key, data]) => (
                  <SelectItem key={key} value={key}>
                    {data.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{selectedVehicle.description}</p>
          </div>
        </div>

        <div className="p-4 bg-muted rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total CO₂ Emissions:</span>
            <span className="text-2xl font-bold text-accent" data-testid="text-co2-total">
              {co2kg} kg
            </span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Emission Factor:</span>
            <span className="font-mono">{selectedVehicle.factor} kg/km</span>
          </div>

          <div className="pt-3 border-t border-border">
            <div className="flex items-center gap-2 text-sm">
              <Leaf className="w-4 h-4 text-green-600" />
              <span className="text-muted-foreground">
                Equivalent to {trees} tree{trees !== 1 ? 's' : ''} needed to offset
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 pl-6">
              Based on average tree absorbing ~21g CO₂/day
            </p>
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Leaf className="w-4 h-4 text-green-600 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-medium text-green-900 dark:text-green-100">Eco-Friendly Tips:</p>
              <ul className="list-disc list-inside text-green-700 dark:text-green-300 space-y-0.5">
                <li>Choose electric vehicles to reduce emissions by up to 70%</li>
                <li>Consolidate shipments to minimize trips</li>
                <li>Consider carpooling or shared transport options</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
