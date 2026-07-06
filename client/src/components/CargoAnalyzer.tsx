import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, AlertTriangle, Pencil, Truck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CargoItem } from "@shared/schema";

interface CargoAnalyzerProps {
  bookingId: string;
}

export default function CargoAnalyzer({ bookingId }: CargoAnalyzerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const { data: items = [] } = useQuery<CargoItem[]>({
    queryKey: [`/api/bookings/${bookingId}/cargo-items`],
  });

  const analyzeMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      const res = await apiRequest("POST", `/api/bookings/${bookingId}/cargo-items/analyze`, { imageUrl });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}/cargo-items`] });
      toast({ title: "Item analyzed", description: "AI has estimated dimensions, weight, and vehicle fit." });
    },
    onError: (error: any) => {
      toast({ title: "Analysis failed", description: error.message, variant: "destructive" });
    },
  });

  const correctMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/cargo-items/${id}/correct`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}/cargo-items`] });
      setEditingId(null);
      toast({ title: "Updated", description: "Your correction has been saved." });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      analyzeMutation.mutate(reader.result as string);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startEdit = (item: CargoItem) => {
    setEditingId(item.id);
    setEditValues({
      estimatedLengthCm: item.estimatedLengthCm ?? "",
      estimatedWidthCm: item.estimatedWidthCm ?? "",
      estimatedHeightCm: item.estimatedHeightCm ?? "",
      estimatedWeightKg: item.estimatedWeightKg ?? "",
      suggestedVehicleType: item.suggestedVehicleType ?? "",
    });
  };

  const saveEdit = (id: string) => {
    correctMutation.mutate({ id, updates: editValues });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="w-5 h-5" />
          AI Cargo Recognition
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={analyzeMutation.isPending}
            data-testid="button-analyze-cargo-photo"
          >
            {analyzeMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Camera className="w-4 h-4 mr-2" />
            )}
            Photograph an item
          </Button>
          <p className="text-xs text-muted-foreground">
            Upload a photo and AI will estimate dimensions, weight, fragility, and the right vehicle.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="input-cargo-photo"
        />

        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-4" data-testid={`card-cargo-item-${item.id}`}>
              <div className="flex gap-3">
                <img src={item.imageUrl} alt={item.detectedLabel ?? "cargo item"} className="w-20 h-20 object-cover rounded-md flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{item.detectedLabel}</span>
                    <div className="flex gap-1">
                      {item.fragile && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="w-3 h-3" /> Fragile
                        </Badge>
                      )}
                      {item.manuallyCorrected && <Badge variant="secondary">Corrected</Badge>}
                    </div>
                  </div>

                  {editingId === item.id ? (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <Label className="text-xs">Length (cm)</Label>
                        <Input value={editValues.estimatedLengthCm} onChange={(e) => setEditValues((v) => ({ ...v, estimatedLengthCm: e.target.value }))} />
                      </div>
                      <div>
                        <Label className="text-xs">Width (cm)</Label>
                        <Input value={editValues.estimatedWidthCm} onChange={(e) => setEditValues((v) => ({ ...v, estimatedWidthCm: e.target.value }))} />
                      </div>
                      <div>
                        <Label className="text-xs">Height (cm)</Label>
                        <Input value={editValues.estimatedHeightCm} onChange={(e) => setEditValues((v) => ({ ...v, estimatedHeightCm: e.target.value }))} />
                      </div>
                      <div>
                        <Label className="text-xs">Weight (kg)</Label>
                        <Input value={editValues.estimatedWeightKg} onChange={(e) => setEditValues((v) => ({ ...v, estimatedWeightKg: e.target.value }))} />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Suggested vehicle</Label>
                        <Input value={editValues.suggestedVehicleType} onChange={(e) => setEditValues((v) => ({ ...v, suggestedVehicleType: e.target.value }))} />
                      </div>
                      <div className="col-span-2 flex gap-2 mt-1">
                        <Button size="sm" onClick={() => saveEdit(item.id)} disabled={correctMutation.isPending} data-testid={`button-save-cargo-${item.id}`}>
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {item.estimatedLengthCm}×{item.estimatedWidthCm}×{item.estimatedHeightCm} cm ·{" "}
                        {item.estimatedWeightKg} kg · {item.estimatedVolumeM3} m³
                      </p>
                      <p className="text-sm flex items-center gap-1">
                        <Truck className="w-3 h-3" /> {item.suggestedVehicleType}
                      </p>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(item)} data-testid={`button-edit-cargo-${item.id}`}>
                        <Pencil className="w-3 h-3 mr-1" /> Correct
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
