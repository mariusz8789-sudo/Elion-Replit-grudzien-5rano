import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Box, Package, Maximize2, CheckCircle, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { packBin, type PackResult } from "@shared/binPacking";

interface Item {
  id: string;
  length: number;
  width: number;
  height: number;
  volume: number;
}

const VEHICLE_BINS = {
  van: { length: 250, width: 150, height: 150 },
  truck: { length: 600, width: 240, height: 240 },
  box_truck: { length: 400, width: 200, height: 200 },
};

const ITEM_COLORS = [
  "bg-blue-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400",
  "bg-violet-400", "bg-cyan-400", "bg-orange-400", "bg-lime-400",
];

export default function SmartLoad3D() {
  const { t } = useTranslation();
  const [vehicleType, setVehicleType] = useState<keyof typeof VEHICLE_BINS>("van");
  const [items, setItems] = useState<Item[]>([]);
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [result, setResult] = useState<PackResult | null>(null);
  const [activeLayer, setActiveLayer] = useState(0);

  const bin = VEHICLE_BINS[vehicleType];
  const binVolume = bin.length * bin.width * bin.height;

  const addItem = () => {
    const l = parseFloat(length);
    const w = parseFloat(width);
    const h = parseFloat(height);
    if (!l || !w || !h) return;

    setItems([...items, { id: crypto.randomUUID(), length: l, width: w, height: h, volume: l * w * h }]);
    setLength("");
    setWidth("");
    setHeight("");
  };

  const optimize = () => {
    const packed = packBin(bin, items);
    setResult(packed);
    setActiveLayer(0);
  };

  const layers = useMemo(() => {
    if (!result) return [];
    const zValues = Array.from(new Set(result.placements.map((p) => p.z))).sort((a, b) => a - b);
    return zValues.map((z) => ({
      z,
      placements: result.placements.filter((p) => p.z === z),
    }));
  }, [result]);

  const totalItemVolume = items.reduce((sum, item) => sum + item.volume, 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
          <Box className="w-8 h-8 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t("SmartLoad 3D")}</h1>
          <p className="text-muted-foreground">{t("Deterministic 3D cargo loading optimizer")}</p>
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
              <Select value={vehicleType} onValueChange={(v) => { setVehicleType(v as keyof typeof VEHICLE_BINS); setResult(null); }}>
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
                    <span className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-sm ${ITEM_COLORS[idx % ITEM_COLORS.length]}`} />
                      {item.length} × {item.width} × {item.height} cm
                    </span>
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
              {t("Calculate Loading Plan")}
            </Button>
          </CardContent>
        </Card>

        <Card className={result ? "border-blue-200 dark:border-blue-800" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="w-5 h-5" />
              {t("Loading Plan")}
            </CardTitle>
            <CardDescription>{t("Floor plan per stacking layer, computed by a real bin-packing algorithm")}</CardDescription>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="aspect-square bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20 rounded-lg flex items-center justify-center border-2 border-dashed border-blue-300 dark:border-blue-700">
                <div className="text-center text-muted-foreground">
                  <Box className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>{t("Add items and click 'Calculate Loading Plan'")}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <div className="text-2xl font-bold text-blue-600" data-testid="text-usage-percent">
                    {result.utilizationPercent.toFixed(1)}%
                  </div>
                  <p className="text-sm text-muted-foreground">{t("Space utilization")}</p>
                  {result.unplaced.length > 0 ? (
                    <div className="flex items-center gap-2 text-red-600 justify-center" data-testid="text-unplaced-warning">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm">
                        {result.unplaced.length} {t("item(s) don't fit in this vehicle")}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-green-600 justify-center">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm">{t("All items fit")}</span>
                    </div>
                  )}
                </div>

                {layers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {layers.map((layer, idx) => (
                        <Button
                          key={layer.z}
                          size="sm"
                          variant={activeLayer === idx ? "default" : "outline"}
                          onClick={() => setActiveLayer(idx)}
                          data-testid={`button-layer-${idx}`}
                        >
                          {t("Layer")} {idx + 1} ({layer.z}cm)
                        </Button>
                      ))}
                    </div>
                    <div
                      className="relative bg-muted rounded-lg border-2 border-border mx-auto"
                      style={{ width: "100%", maxWidth: 320, aspectRatio: `${bin.length} / ${bin.width}` }}
                      data-testid="floor-plan"
                    >
                      {layers[activeLayer]?.placements.map((p) => {
                        const idx = items.findIndex((it) => it.id === p.id);
                        return (
                          <div
                            key={p.id}
                            className={`absolute border border-black/20 rounded-sm ${ITEM_COLORS[idx % ITEM_COLORS.length]} flex items-center justify-center text-[10px] font-medium text-black/70`}
                            style={{
                              left: `${(p.x / bin.length) * 100}%`,
                              top: `${(p.y / bin.width) * 100}%`,
                              width: `${(p.length / bin.length) * 100}%`,
                              height: `${(p.width / bin.width) * 100}%`,
                            }}
                            title={`${p.length} × ${p.width} × ${p.height} cm @ z=${p.z}cm`}
                          >
                            {p.length}×{p.width}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between text-sm">
                    <span>{t("Placed volume")}</span>
                    <span className="font-semibold" data-testid="text-total-volume">{result.usedVolume.toLocaleString()} cm³</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{t("Vehicle capacity")}</span>
                    <span className="font-semibold">{binVolume.toLocaleString()} cm³</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{t("Remaining space")}</span>
                    <span className="font-semibold text-green-600" data-testid="text-remaining-space">
                      {(binVolume - result.usedVolume).toLocaleString()} cm³
                    </span>
                  </div>
                  {totalItemVolume > binVolume && (
                    <p className="text-xs text-muted-foreground">
                      {t("Total item volume exceeds vehicle capacity - some items were left unplaced above.")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
