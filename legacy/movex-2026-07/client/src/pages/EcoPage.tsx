import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EcoCalculator from "@/components/EcoCalculator";
import EcoRouting from "@/components/EcoRouting";
import { Leaf, TrendingDown, Award, Building2 } from "lucide-react";

interface CompanyEcoStats {
  id: string;
  name: string;
  totalTrips: number;
  totalCO2kg: number;
  totalCO2SavedKg: number;
  avgCO2PerTrip: number;
}

export default function EcoPage() {
  const { data: ecoCompanies = [] } = useQuery<CompanyEcoStats[]>({
    queryKey: ["/api/eco/companies"],
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold font-[Outfit] flex items-center gap-2">
            <Leaf className="w-8 h-8 text-green-600" />
            Eco-Friendly Transport
          </h1>
          <p className="text-muted-foreground mt-1">
            Calculate emissions, choose eco routes, and find green companies
          </p>
        </div>

        <Tabs defaultValue="calculator" className="space-y-6">
          <TabsList className="grid w-full md:w-auto md:inline-grid grid-cols-3">
            <TabsTrigger value="calculator">Calculator</TabsTrigger>
            <TabsTrigger value="routing">Eco Routing</TabsTrigger>
            <TabsTrigger value="companies">Green Companies</TabsTrigger>
          </TabsList>

          <TabsContent value="calculator" className="space-y-6">
            <EcoCalculator distance={150} />
            
            <Card>
              <CardHeader>
                <CardTitle>Why Track CO₂ Emissions?</CardTitle>
                <CardDescription>Understanding environmental impact</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <TrendingDown className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Reduce Your Carbon Footprint</h4>
                    <p className="text-sm text-muted-foreground">
                      Make informed decisions about transport methods and contribute to a cleaner environment
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Award className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Support Sustainable Companies</h4>
                    <p className="text-sm text-muted-foreground">
                      Choose logistics partners committed to eco-friendly practices and electric vehicles
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="routing" className="space-y-6">
            <EcoRouting />
          </TabsContent>

          <TabsContent value="companies" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Eco-Friendly Companies
                </CardTitle>
                <CardDescription>
                  Ranked by real, persisted CO₂ savings across completed bookings (each booking's estimate is recomputed against a standard-van baseline once a vehicle is assigned)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {ecoCompanies.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No completed bookings with CO₂ data yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {ecoCompanies.map((company, index) => (
                      <Card key={company.id} className="hover-elevate">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted font-bold">
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                <h4 className="font-semibold">{company.name}</h4>
                                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                  <span>{company.totalTrips.toLocaleString()} trips</span>
                                  <span>Avg {company.avgCO2PerTrip.toFixed(1)} kg CO₂/trip</span>
                                </div>
                              </div>
                            </div>
                            <Badge className="bg-green-600 text-white text-base px-3 py-1">
                              {company.totalCO2SavedKg.toFixed(0)} kg saved
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
