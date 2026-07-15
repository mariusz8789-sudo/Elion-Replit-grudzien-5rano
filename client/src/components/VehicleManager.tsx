import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Plus, Package, Ruler, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "./ImageUpload";
import VerificationUpload from "./VerificationUpload";
import ApiKeysPanel from "./ApiKeysPanel";

interface Vehicle {
  id: string;
  type: string;
  licensePlate: string;
  capacity: string;
  capacityUnit: string;
  dimensions?: string;
  images?: string[];
  available: boolean;
}

export default function VehicleManager({ companyId }: { companyId: string }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    type: "van",
    licensePlate: "",
    capacity: "",
    capacityUnit: "cubic_meters",
    dimensions: "",
    images: [] as string[],
  });
  const { toast } = useToast();

  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles", companyId],
    queryFn: async () => {
      const response = await fetch(`/api/vehicles?companyId=${companyId}`);
      if (!response.ok) return [];
      return response.json();
    },
  });

  const createVehicleMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/vehicles", {
        ...data,
        companyId,
      });
      if (!response.ok) throw new Error("Failed to create vehicle");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", companyId] });
      setIsDialogOpen(false);
      setFormData({
        type: "van",
        licensePlate: "",
        capacity: "",
        capacityUnit: "cubic_meters",
        dimensions: "",
        images: [],
      });
      toast({
        title: "Vehicle added",
        description: "Vehicle has been successfully added to your fleet",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add vehicle",
        variant: "destructive",
      });
    },
  });

  const toggleAvailableMutation = useMutation({
    mutationFn: async ({ id, available }: { id: string; available: boolean }) => {
      const response = await apiRequest("PATCH", `/api/vehicles/${id}`, { available });
      if (!response.ok) throw new Error("Failed to update vehicle");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", companyId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update vehicle", variant: "destructive" });
    },
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/vehicles/${id}`);
      if (!response.ok) throw new Error("Failed to remove vehicle");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", companyId] });
      toast({ title: "Vehicle removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove vehicle", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.licensePlate || !formData.capacity) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    createVehicleMutation.mutate(formData);
  };

  const vehicleTypes = [
    { value: "van", label: "Van" },
    { value: "truck", label: "Truck" },
    { value: "lorry", label: "Lorry" },
    { value: "pickup", label: "Pickup" },
    { value: "box_truck", label: "Box Truck" },
  ];

  const capacityUnits = [
    { value: "cubic_meters", label: "m³ (Cubic Meters)" },
    { value: "kg", label: "kg (Kilograms)" },
    { value: "liters", label: "L (Liters)" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-[Outfit]">Fleet Management</h2>
          <p className="text-muted-foreground">Manage your vehicles and capacity</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-vehicle">
              <Plus className="w-4 h-4 mr-2" />
              Add Vehicle
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Vehicle</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Vehicle Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger id="type" data-testid="select-vehicle-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicleTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="licensePlate">License Plate</Label>
                  <Input
                    id="licensePlate"
                    value={formData.licensePlate}
                    onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value })}
                    placeholder="ABC-123"
                    required
                    data-testid="input-license-plate"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    type="number"
                    step="0.01"
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                    placeholder="15.5"
                    required
                    data-testid="input-capacity"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="capacityUnit">Unit</Label>
                  <Select
                    value={formData.capacityUnit}
                    onValueChange={(value) => setFormData({ ...formData, capacityUnit: value })}
                  >
                    <SelectTrigger id="capacityUnit" data-testid="select-capacity-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {capacityUnits.map((unit) => (
                        <SelectItem key={unit.value} value={unit.value}>
                          {unit.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dimensions">Dimensions (Optional)</Label>
                <Input
                  id="dimensions"
                  value={formData.dimensions}
                  onChange={(e) => setFormData({ ...formData, dimensions: e.target.value })}
                  placeholder="L: 4.5m x W: 2.1m x H: 2.3m"
                  data-testid="input-dimensions"
                />
              </div>

              <div className="space-y-2">
                <Label>Vehicle Photos</Label>
                <ImageUpload
                  images={formData.images}
                  onImagesChange={(images) => setFormData({ ...formData, images })}
                  maxImages={5}
                  category="vehicle"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={createVehicleMutation.isPending} data-testid="button-submit-vehicle">
                  {createVehicleMutation.isPending ? "Adding..." : "Add Vehicle"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-32 bg-muted rounded mb-4" />
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : vehicles.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Truck className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No vehicles yet</h3>
            <p className="text-muted-foreground mb-4">
              Add your first vehicle to start managing your fleet
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Vehicle
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id} className="hover-elevate" data-testid={`card-vehicle-${vehicle.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Truck className="w-5 h-5" />
                      {vehicle.type.replace("_", " ").toUpperCase()}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{vehicle.licensePlate}</p>
                  </div>
                  <Badge variant={vehicle.available ? "default" : "secondary"}>
                    {vehicle.available ? "Available" : "In Use"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {vehicle.images && vehicle.images.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {vehicle.images.slice(0, 2).map((img, idx) => (
                      <img
                        key={idx}
                        src={img}
                        alt={`Vehicle ${idx + 1}`}
                        className="w-full h-24 object-cover rounded"
                        data-testid={`img-vehicle-${vehicle.id}-${idx}`}
                      />
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Package className="w-4 h-4 text-primary" />
                  <span>
                    Capacity: <strong>{vehicle.capacity} {vehicle.capacityUnit}</strong>
                  </span>
                </div>
                {vehicle.dimensions && (
                  <div className="flex items-center gap-2 text-sm">
                    <Ruler className="w-4 h-4 text-primary" />
                    <span className="text-muted-foreground">{vehicle.dimensions}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => toggleAvailableMutation.mutate({ id: vehicle.id, available: !vehicle.available })}
                    disabled={toggleAvailableMutation.isPending}
                    data-testid={`button-toggle-vehicle-${vehicle.id}`}
                  >
                    Mark {vehicle.available ? "In Use" : "Available"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteVehicleMutation.mutate(vehicle.id)}
                    disabled={deleteVehicleMutation.isPending}
                    data-testid={`button-delete-vehicle-${vehicle.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <VerificationUpload
        holderType="company"
        holderId={companyId}
        docTypes={[
          { value: "company_registration", label: "Company Registration" },
          { value: "insurance_certificate", label: "Insurance Certificate" },
        ]}
      />

      <ApiKeysPanel companyId={companyId} />
    </div>
  );
}
