import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Star, Trophy, Award, Shield, Crown, Medal } from "lucide-react";
import type { Company, Driver } from "@shared/schema";

const BADGE_ICONS: Record<string, typeof Trophy> = {
  super_carrier: Shield,
  premium: Star,
  elite: Crown,
  completed_100: Medal,
  completed_500: Medal,
  completed_1000: Trophy,
};

function BadgeChip({ code, name }: { code: string; name: string }) {
  const Icon = BADGE_ICONS[code] ?? Award;
  return (
    <Badge variant="secondary" className="gap-1" data-testid={`badge-${code}`}>
      <Icon className="h-3 w-3" />
      {name}
    </Badge>
  );
}

function CompanyBadges({ companyId }: { companyId: string }) {
  const { data } = useQuery<Array<{ badge: { code: string; name: string } }>>({
    queryKey: [`/api/badges/company/${companyId}`],
  });
  if (!data || data.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {data.map((a, i) => (
        <BadgeChip key={i} code={a.badge.code} name={a.badge.name} />
      ))}
    </div>
  );
}

export default function Leaderboard() {
  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/leaderboard/companies"],
  });
  const { data: drivers } = useQuery<Driver[]>({
    queryKey: ["/api/leaderboard/drivers"],
  });

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold">Leaderboard</h2>
        <p className="text-muted-foreground mt-2">
          The highest-rated moving companies and drivers on Point to Point.
        </p>
      </div>

      <Tabs defaultValue="companies">
        <TabsList className="grid w-full grid-cols-2 max-w-xs mx-auto">
          <TabsTrigger value="companies" data-testid="tab-companies">Companies</TabsTrigger>
          <TabsTrigger value="drivers" data-testid="tab-drivers">Drivers</TabsTrigger>
        </TabsList>

        <TabsContent value="companies" className="space-y-3">
          {(companies ?? []).map((company, index) => (
            <Card key={company.id} data-testid={`card-company-${company.id}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-muted-foreground w-6">#{index + 1}</span>
                  <div>
                    <CardTitle className="text-base">{company.name}</CardTitle>
                    <CompanyBadges companyId={company.id} />
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm font-medium">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  {Number(company.rating).toFixed(1)} ({company.totalReviews})
                </div>
              </CardHeader>
            </Card>
          ))}
          {companies?.length === 0 && (
            <CardContent className="text-center text-muted-foreground">No ranked companies yet.</CardContent>
          )}
        </TabsContent>

        <TabsContent value="drivers" className="space-y-3">
          {(drivers ?? []).map((driver, index) => (
            <Card key={driver.id} data-testid={`card-driver-${driver.id}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-muted-foreground w-6">#{index + 1}</span>
                  <CardTitle className="text-base">{driver.totalDeliveries ?? 0} deliveries</CardTitle>
                </div>
                <div className="flex items-center gap-1 text-sm font-medium">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  {Number(driver.rating).toFixed(1)}
                </div>
              </CardHeader>
            </Card>
          ))}
          {drivers?.length === 0 && (
            <CardContent className="text-center text-muted-foreground">No ranked drivers yet.</CardContent>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
