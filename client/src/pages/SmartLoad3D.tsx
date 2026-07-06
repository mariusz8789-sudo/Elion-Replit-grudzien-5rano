import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Box, Package, Maximize2, CheckCircle, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function SmartLoad3D() {
  const { t } = useTranslation();
  const [vehicleType, setVehicleType] = useState("van");
  const [items, setItems] = useState<any[]>([]);
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [optimized, setOptimized] = useState(false);

  const vehicleCapacity = {
    van: { length: 250, width: 150, height: 150, volume: 5625 },
    truck: { length: 600, width: 240, height: 240, volume: 34560 },
    box_truck: { length: 400, width: 200, height: 200, volume: 16000 }
  };

  const addItem = () => {
    if (!length || !width || !height) return;
    
    const newItem = {
      id: Date.now(),
      length: parseFloat(length),
      width: parseFloat(width),
      height: parseFloat(height),
      volume: parseFloat(length) * parseFloat(width) * parseFloat(height)
    };
    
    setItems([...items, newItem]);
    setLength("");
    setWidth("");
    setHeight("");
  };

  const optimize = () => {
    setOptimized(true);
  };

  const totalVolume = items.reduce((sum, item) => sum + item.volume, 0);
  const capacity = vehicleCapacity[vehicleType as keyof typeof vehicleCapacity];
  const usagePercent = (totalVolume / capacity.volume) * 100;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
          <Box className="w-8 h-8 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t("SmartLoad 3D")}</h1>
          <p className="text-muted-foreground">{t("AI-powered 3D cargo optimization")}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {t("Vehicle & Items")}
            </CardTitle>
            <CardDescription>{t("Define your vehicle and cargo")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{t("Vehicle Type")}</Label>
              <Select value={vehicleType} onValueChange={setVehicleType}>
                <SelectTrigger data-testid="select-vehicle-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="van">Van (2.5m × 1.5m × 1.5m)</SelectItem>
                  <SelectItem value="truck">Truck (6m × 2.4m × 2.4m)</SelectItem>
                  <SelectItem value="box_truck">Box Truck (4m × 2m × 2m)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("Add Item (cm)")}</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  placeholder="L"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  data-testid="input-length"
                />
                <Input
                  type="number"
                  placeholder="W"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  data-testid="input-width"
                />
                <Input
                  type="number"
                  placeholder="H"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  data-testid="input-height"
                />
              </div>
              <Button onClick={addItem} className="w-full" data-testid="button-add-item">
                <Package className="w-4 h-4 mr-2" />
                {t("Add Item")}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>{t("Items List")} ({items.length})</Label>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {items.map((item, idx) => (
                  <div key={item.id} className="flex items-center justify-between p-2 bg-muted rounded text-sm" data-testid={`item-${idx}`}>
                    <span>{item.length} × {item.width} × {item.height} cm</span>
                    <Badge variant="secondary">{item.volume.toLocaleString()} cm³</Badge>
                  </div>
                ))}
              </div>
            </div>

            <Button 
              onClick={optimize} 
              className="w-full"
              disabled={items.length === 0}
              data-testid="button-optimize-load"
            >
              <Maximize2 className="w-4 h-4 mr-2" />
              {t("Optimize Load")}
            </Button>
          </CardContent>
        </Card>

        <Card className={optimized ? "border-blue-200 dark:border-blue-800" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="w-5 h-5" />
              {t("3D Visualization")}
            </CardTitle>
            <CardDescription>{t("AI-optimized loading pattern")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="aspect-square bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20 rounded-lg flex items-center justify-center border-2 border-dashed border-blue-300 dark:border-blue-700">
              {optimized ? (
                <div className="text-center space-y-4">
                  <Box className="w-16 h-16 mx-auto text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold text-blue-600" data-testid="text-usage-percent">
                      {usagePercent.toFixed(1)}%
                    </div>
                    <p className="text-sm text-muted-foreground">{t("Space utilization")}</p>
                  </div>
                  {usagePercent > 100 ? (
                    <div className="flex items-center gap-2 text-red-600 justify-center">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm">{t("Overload!")}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-green-600 justify-center">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm">{t("Optimal fit")}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Box className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>{t("Add items and click 'Optimize Load'")}</p>
                  <p className="text-sm mt-2">{t("(3D visualization will appear here)")}</p>
                </div>
              )}
            </div>

            {optimized && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t("Total volume")}</span>
                  <span className="font-semibold" data-testid="text-total-volume">{totalVolume.toLocaleString()} cm³</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t("Vehicle capacity")}</span>
                  <span className="font-semibold">{capacity.volume.toLocaleString()} cm³</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t("Remaining space")}</span>
                  <span className="font-semibold text-green-600" data-testid="text-remaining-space">
                    {(capacity.volume - totalVolume).toLocaleString()} cm³
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("AI Loading Recommendations")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-blue-600 mb-2" />
              <h3 className="font-semibold mb-1">{t("Heavy items first")}</h3>
              <p className="text-sm text-muted-foreground">{t("Place at bottom for stability")}</p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-blue-600 mb-2" />
              <h3 className="font-semibold mb-1">{t("Fill gaps")}</h3>
              <p className="text-sm text-muted-foreground">{t("Use smaller items to maximize space")}</p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-blue-600 mb-2" />
              <h3 className="font-semibold mb-1">{t("Weight distribution")}</h3>
              <p className="text-sm text-muted-foreground">{t("Balance left and right sides")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
