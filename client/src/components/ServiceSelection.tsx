import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, Building, Truck, Package } from "lucide-react";
import type { Service } from "@shared/schema";

const iconMap: Record<string, any> = {
  home: Home,
  building: Building,
  truck: Truck,
  package: Package,
};

interface ServiceSelectionProps {
  onSelect: (service: Service) => void;
}

export default function ServiceSelection({ onSelect }: ServiceSelectionProps) {
  const { data: services, isLoading } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  if (isLoading) {
    return (
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-6 animate-pulse">
            <div className="w-12 h-12 bg-muted rounded-xl mb-4" />
            <div className="h-6 bg-muted rounded mb-2" />
            <div className="h-4 bg-muted rounded" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-foreground font-[Outfit] mb-2">
          Select Your Service
        </h2>
        <p className="text-muted-foreground">
          Choose the moving service that fits your needs
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {services?.map((service) => {
          const Icon = iconMap[service.icon] || Package;
          
          return (
            <Card
              key={service.id}
              className="p-6 hover-elevate transition-all duration-200 cursor-pointer border-card-border"
              onClick={() => onSelect(service)}
              data-testid={`service-card-${service.id}`}
            >
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {service.name}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {service.description}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-primary">
                  ${service.basePrice}
                </span>
                <span className="text-sm text-muted-foreground">base</span>
              </div>
              <Button className="w-full mt-4" data-testid={`button-select-${service.id}`}>
                Select Service
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
