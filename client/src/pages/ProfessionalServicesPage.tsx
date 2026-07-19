import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, Star, BadgeCheck, Search } from "lucide-react";
import type { Skill, CompanyService, Company } from "@shared/schema";

const CATEGORY_LABELS: Record<string, string> = {
  moving: "Moving",
  installation: "Installation",
  trades: "Trades (licensed)",
  specialty_transport: "Specialty Transport",
  relocation: "Relocation",
  cleaning: "Cleaning",
};

export default function ProfessionalServicesPage() {
  const { data: allSkills = [] } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });
  const [category, setCategory] = useState<string>("all");
  const [skillId, setSkillId] = useState<string>("");
  const [searched, setSearched] = useState(false);

  const categories = Array.from(new Set(allSkills.map((s) => s.category)));
  const skillsInCategory = category === "all" ? allSkills : allSkills.filter((s) => s.category === category);

  const { data: results = [], isFetching, refetch } = useQuery<Array<CompanyService & { skill: Skill; company: Company }>>({
    queryKey: ["/api/professional-services/search", skillId, category],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (skillId) params.set("skillId", skillId);
      else if (category !== "all") params.set("category", category);
      const res = await fetch(`/api/professional-services/search?${params.toString()}`);
      return res.ok ? res.json() : [];
    },
    enabled: false,
  });

  const handleSearch = () => {
    setSearched(true);
    refetch();
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold font-[Outfit] flex items-center gap-2">
            <Briefcase className="w-7 h-7" />Professional Services
          </h1>
          <p className="text-muted-foreground mt-1">
            Find companies offering furniture assembly, installations, licensed trades, specialty transport and relocation services
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-wrap gap-4 items-end">
            <div className="min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">Category</label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setSkillId(""); }}>
                <SelectTrigger data-testid="select-service-category">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[240px]">
              <label className="text-sm font-medium mb-1 block">Service (optional)</label>
              <Select value={skillId} onValueChange={setSkillId}>
                <SelectTrigger data-testid="select-service-skill">
                  <SelectValue placeholder="Any service in this category" />
                </SelectTrigger>
                <SelectContent>
                  {skillsInCategory.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSearch} disabled={isFetching} data-testid="button-search-services">
              <Search className="w-4 h-4 mr-2" />Search
            </Button>
          </CardContent>
        </Card>

        {isFetching && (
          <div className="grid md:grid-cols-2 gap-4">
            {[1, 2].map((i) => <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />)}
          </div>
        )}

        {!isFetching && searched && results.length === 0 && (
          <Card className="p-12 text-center">
            <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No companies found</h3>
            <p className="text-muted-foreground">Try a different category or service.</p>
          </Card>
        )}

        {!isFetching && results.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            {results.map((r) => (
              <Card key={r.id} data-testid={`card-service-offering-${r.id}`}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-lg">
                    <span className="flex items-center gap-2">
                      {r.company.name}
                      {r.company.verified && <BadgeCheck className="w-4 h-4 text-primary" data-testid={`badge-verified-${r.id}`} />}
                    </span>
                    <span className="flex items-center gap-1 text-sm font-normal">
                      <Star className="w-3 h-3 text-yellow-500" />{Number(r.company.rating).toFixed(1)}
                    </span>
                  </CardTitle>
                  <CardDescription>{r.skill.name}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                  {r.priceFromEur && (
                    <Badge variant="outline">From €{r.priceFromEur}</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
