import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type PlanSlug = "basic" | "premium" | "enterprise";

interface CompanyUsage {
  subscriptionTier: string;
  monthlyBookingLimit: number;
  used: number;
  remaining: number | null;
}

const PLANS: { slug: PlanSlug; name: string; price: string; limit: string }[] = [
  { slug: "basic", name: "Basic", price: "49", limit: "50" },
  { slug: "premium", name: "Premium", price: "149", limit: "300" },
  { slug: "enterprise", name: "Enterprise", price: "299", limit: "1000" },
];

export default function Plans() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<PlanSlug>("basic");
  const companyId = user?.companyId;

  const { data: usage } = useQuery<CompanyUsage>({
    queryKey: [`/api/companies/${companyId}/usage`],
    enabled: !!companyId,
  });

  async function subscribe() {
    if (!companyId) {
      toast({ title: "No company account", description: "Sign in with a company account to manage a plan.", variant: "destructive" });
      return;
    }
    try {
      const res = await apiRequest("POST", `/api/companies/${companyId}/subscribe`, {
        plan: selected,
        successUrl: `${location.origin}/plans`,
        cancelUrl: location.href,
      });
      const data = await res.json();
      if (data.url) {
        location.href = data.url;
      }
    } catch (error: any) {
      toast({ title: "Checkout failed", description: error.message, variant: "destructive" });
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold">Choose Your Plan</h2>
        <p className="text-muted-foreground mt-2">
          Scale your logistics business with the right monthly booking limit.
        </p>
      </div>

      {usage && (
        <Card>
          <CardHeader>
            <CardTitle>Current usage ({usage.subscriptionTier})</CardTitle>
            <CardDescription>
              {usage.used} of {usage.monthlyBookingLimit || "unlimited"} bookings used this month
            </CardDescription>
          </CardHeader>
          <CardContent>
            {usage.monthlyBookingLimit > 0 && (
              <Progress value={Math.min((usage.used / usage.monthlyBookingLimit) * 100, 100)} />
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map(({ slug, name, price, limit }) => (
          <Card
            key={slug}
            className={cn("cursor-pointer hover:shadow-lg", selected === slug && "ring-2 ring-primary")}
            onClick={() => setSelected(slug)}
            data-testid={`card-plan-${slug}`}
          >
            <CardHeader>
              <CardTitle>{name}</CardTitle>
              <CardDescription>
                <span className="text-3xl font-bold">${price}</span>
                <span className="text-muted-foreground">/month</span>
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <div className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">{limit} bookings/month</span>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="max-w-sm mx-auto">
        <Button className="w-full" size="lg" onClick={subscribe} data-testid="button-subscribe">
          Continue to Checkout
        </Button>
      </div>
    </div>
  );
}
