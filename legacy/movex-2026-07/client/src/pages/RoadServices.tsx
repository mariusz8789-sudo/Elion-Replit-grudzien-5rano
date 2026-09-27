import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Route, Navigation, Loader2, AlertTriangle, Info, ShieldAlert, Euro, Fuel, Leaf,
  Clock, Sparkles, ShoppingCart, Send, CheckCircle, CreditCard, Lock,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getStripe } from "@/lib/stripe";

interface RouteRequirement {
  id: string;
  category: string;
  countryCode: string | null;
  title: string;
  description: string | null;
  severity: "info" | "warning" | "critical";
  isMandatory: boolean;
  estimatedCostEur: string | null;
  recommendedProductId: string | null;
}

interface CostSummary {
  breakdown: {
    totalMandatoryEur: number;
    totalOptionalEur: number;
    totalEur: number;
  };
  fuelEstimateEur: number;
  grandTotalEur: number;
  co2EstimateKg: number;
}

interface RecommendationEntry {
  id: string;
  distanceKm: number;
  durationMinutes: number;
  totalCostEur: number;
  co2EstimateKg: number;
}

interface AnalysisResponse {
  route: { id: string; countryCodes: string[]; distanceKm: string; durationMinutes: number };
  requirements: RouteRequirement[];
  costSummary: CostSummary;
  recommendations: Record<string, RecommendationEntry>;
}

interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

const VEHICLE_TYPES = [
  { value: "van", label: "Van" },
  { value: "truck_7_5t", label: "Truck 7.5t" },
  { value: "truck_12t", label: "Truck 12t" },
  { value: "truck_40t", label: "Truck 40t (articulated)" },
];

const SEVERITY_STYLE: Record<string, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "text-blue-600 dark:text-blue-400" },
  warning: { icon: AlertTriangle, className: "text-amber-600 dark:text-amber-400" },
  critical: { icon: ShieldAlert, className: "text-red-600 dark:text-red-400" },
};

const STRATEGY_LABELS: Record<string, string> = {
  cheapest: "Cheapest",
  fastest: "Fastest",
  greenest: "Greenest",
  best_profit: "Best Profit",
  lowest_risk: "Lowest Risk",
};

async function geocode(address: string): Promise<{ lat: number; lng: number }> {
  const res = await apiRequest("POST", "/api/geocode", { address });
  const data = await res.json();
  return { lat: data.lat, lng: data.lng };
}

function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: "if_required" });
    setSubmitting(false);

    if (error) {
      toast({ title: "Payment failed", description: error.message || "Please try again.", variant: "destructive" });
      return;
    }
    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "requires_capture")) {
      onSuccess();
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement />
      <Button className="w-full" onClick={handleSubmit} disabled={!stripe || submitting} data-testid="button-confirm-road-service-payment">
        {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
        {submitting ? "Processing..." : "Complete Purchase"}
      </Button>
      <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
        <Lock className="w-3 h-3" />
        <span>Secured by Stripe</span>
      </div>
    </div>
  );
}

export default function RoadServices() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [vehicleType, setVehicleType] = useState("truck_12t");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [axles, setAxles] = useState("");
  const [isAdr, setIsAdr] = useState(false);

  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [checkoutSummary, setCheckoutSummary] = useState<{ title: string; totalEur: number } | null>(null);

  const [agentInput, setAgentInput] = useState("");
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const [originCoords, destCoords] = await Promise.all([geocode(origin), geocode(destination)]);
      const res = await apiRequest("POST", "/api/road-services/routes", {
        originAddress: origin,
        destinationAddress: destination,
        waypoints: [
          { address: origin, ...originCoords },
          { address: destination, ...destCoords },
        ],
        vehicleType,
        vehicleWeightKg: weightKg ? Number(weightKg) : undefined,
        vehicleHeightCm: heightCm ? Number(heightCm) : undefined,
        vehicleAxles: axles ? Number(axles) : undefined,
        isAdr,
      });
      return (await res.json()) as { route: AnalysisResponse["route"]; requirements: RouteRequirement[]; costSummary: CostSummary; recommendations: Record<string, RecommendationEntry> };
    },
    onSuccess: (data) => {
      setAnalysis(data as AnalysisResponse);
      setAgentMessages([]);
    },
    onError: (error: any) => {
      toast({ title: "Route analysis failed", description: error.message, variant: "destructive" });
    },
  });

  const agentMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!analysis) throw new Error("Analyze a route first");
      const res = await apiRequest("POST", `/api/road-services/routes/${analysis.route.id}/agent`, {
        message,
        history: agentMessages,
      });
      return (await res.json()).data as { reply: string; items: { title: string; priceEur: number }[]; totalEur: number; offerPurchase: boolean };
    },
    onSuccess: (data, message) => {
      setAgentMessages((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: data.reply }]);
      setAgentInput("");
    },
    onError: (error: any) => {
      toast({ title: "MoveX AI agent unavailable", description: error.message, variant: "destructive" });
    },
  });

  const orderMutation = useMutation({
    mutationFn: async (req: RouteRequirement) => {
      const res = await apiRequest("POST", "/api/road-services/orders", {
        productId: req.recommendedProductId,
        routeId: analysis?.route.id,
        quantity: 1,
      });
      return (await res.json()).data as { order: { totalPriceEur: string }; clientSecret: string };
    },
    onSuccess: (data, req) => {
      setCheckoutSecret(data.clientSecret);
      setCheckoutSummary({ title: req.title, totalEur: Number(data.order.totalPriceEur) });
    },
    onError: (error: any) => {
      toast({ title: "Could not start purchase", description: error.message, variant: "destructive" });
    },
  });

  const handleAnalyze = () => {
    if (!origin || !destination) return;
    analyzeMutation.mutate();
  };

  const handleAgentSend = () => {
    if (!agentInput.trim()) return;
    agentMutation.mutate(agentInput.trim());
  };

  const purchasableRequirements = analysis?.requirements.filter((r) => r.recommendedProductId) ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-lg">
          <Route className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t("MoveX Road Services")}</h1>
          <p className="text-muted-foreground">
            {t("Vignettes, tolls, ferries, parking, fuel, insurance and driver services - detected and purchasable in one place")}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Navigation className="w-5 h-5" />
            {t("Plan your route")}
          </CardTitle>
          <CardDescription>{t("MoveX AI will detect every requirement along the way")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rs-origin">{t("From")}</Label>
              <Input id="rs-origin" data-testid="input-rs-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder={t("e.g. Warsaw, Poland")} />
            </div>
            <div>
              <Label htmlFor="rs-destination">{t("To")}</Label>
              <Input id="rs-destination" data-testid="input-rs-destination" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={t("e.g. Zagreb, Croatia")} />
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <Label>{t("Vehicle Type")}</Label>
              <Select value={vehicleType} onValueChange={setVehicleType}>
                <SelectTrigger data-testid="select-rs-vehicle"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VEHICLE_TYPES.map((v) => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rs-weight">{t("Weight (kg)")}</Label>
              <Input id="rs-weight" type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="rs-height">{t("Height (cm)")}</Label>
              <Input id="rs-height" type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="rs-axles">{t("Axles")}</Label>
              <Input id="rs-axles" type="number" value={axles} onChange={(e) => setAxles(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="rs-adr" checked={isAdr} onCheckedChange={setIsAdr} data-testid="switch-rs-adr" />
            <Label htmlFor="rs-adr">{t("Carrying ADR-classified dangerous goods")}</Label>
          </div>

          <Button className="w-full" onClick={handleAnalyze} disabled={!origin || !destination || analyzeMutation.isPending} data-testid="button-analyze-route">
            {analyzeMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("Analyzing route with MoveX AI...")}</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" />{t("Analyze Route")}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {analysis && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("Detected Requirements")}</CardTitle>
                <CardDescription>
                  {analysis.route.countryCodes.join(" -> ")} · {analysis.route.distanceKm} km · {Math.round(analysis.route.durationMinutes / 60)}h {analysis.route.durationMinutes % 60}m
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.requirements.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("No special requirements detected for this route.")}</p>
                )}
                {analysis.requirements.map((req) => {
                  const style = SEVERITY_STYLE[req.severity] ?? SEVERITY_STYLE.info;
                  const Icon = style.icon;
                  return (
                    <div key={req.id} className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted" data-testid={`requirement-${req.id}`}>
                      <div className="flex items-start gap-2 min-w-0">
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.className}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{req.title}</span>
                            {req.countryCode && <Badge variant="outline">{req.countryCode}</Badge>}
                            {req.isMandatory && <Badge variant="secondary">{t("Mandatory")}</Badge>}
                          </div>
                          {req.description && <p className="text-xs text-muted-foreground mt-1">{req.description}</p>}
                        </div>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        {req.estimatedCostEur && Number(req.estimatedCostEur) > 0 && (
                          <div className="text-sm font-semibold">EUR {Number(req.estimatedCostEur).toFixed(2)}</div>
                        )}
                        {req.recommendedProductId && (
                          <Button size="sm" variant="outline" onClick={() => orderMutation.mutate(req)} disabled={orderMutation.isPending} data-testid={`button-buy-${req.id}`}>
                            <ShoppingCart className="w-3 h-3 mr-1" />{t("Buy")}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {Object.keys(analysis.recommendations).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("AI Recommendations")}</CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-3">
                  {Object.entries(analysis.recommendations).map(([strategy, candidate]) => (
                    <div key={strategy} className="p-3 rounded-lg border" data-testid={`recommendation-${strategy}`}>
                      <div className="text-xs font-semibold text-primary mb-1">{STRATEGY_LABELS[strategy] ?? strategy}</div>
                      <div className="text-sm flex items-center gap-3 text-muted-foreground">
                        <span className="flex items-center gap-1"><Euro className="w-3 h-3" />{candidate.totalCostEur.toFixed(0)}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{Math.round(candidate.durationMinutes / 60)}h</span>
                        <span className="flex items-center gap-1"><Leaf className="w-3 h-3" />{candidate.co2EstimateKg.toFixed(0)}kg</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("Trip Cost Summary")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{t("Mandatory")}</span><span>EUR {analysis.costSummary.breakdown.totalMandatoryEur.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("Optional")}</span><span>EUR {analysis.costSummary.breakdown.totalOptionalEur.toFixed(2)}</span></div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-1"><Fuel className="w-3 h-3" />{t("Fuel estimate")}</span><span>EUR {analysis.costSummary.fuelEstimateEur.toFixed(2)}</span></div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-1"><Leaf className="w-3 h-3" />{t("CO2 estimate")}</span><span>{analysis.costSummary.co2EstimateKg.toFixed(1)} kg</span></div>
                <div className="border-t pt-2 flex justify-between font-bold text-base"><span>{t("Grand Total")}</span><span data-testid="text-grand-total">EUR {analysis.costSummary.grandTotalEur.toFixed(2)}</span></div>
              </CardContent>
            </Card>

            <Card className="flex flex-col h-[420px]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" />{t("Ask MoveX AI")}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3 overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {agentMessages.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('Ask, e.g. "What will I need for this trip?"')}</p>
                  )}
                  {agentMessages.map((m, idx) => (
                    <div key={idx} className={`text-sm p-2 rounded-lg max-w-[90%] ${m.role === "user" ? "bg-primary text-primary-foreground ml-auto" : "bg-muted"}`}>
                      {m.content}
                    </div>
                  ))}
                  {agentMutation.isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    value={agentInput}
                    onChange={(e) => setAgentInput(e.target.value)}
                    placeholder={t("Message MoveX AI...")}
                    className="min-h-[40px] resize-none"
                    data-testid="input-rs-agent"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAgentSend();
                      }
                    }}
                  />
                  <Button size="icon" onClick={handleAgentSend} disabled={agentMutation.isPending || !agentInput.trim()} data-testid="button-rs-agent-send">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                {purchasableRequirements.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={() => orderMutation.mutate(purchasableRequirements[0])} data-testid="button-purchase-all">
                    <CheckCircle className="w-3 h-3 mr-1" />{t("Purchase everything")}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog open={!!checkoutSecret} onOpenChange={(open) => { if (!open) { setCheckoutSecret(null); setCheckoutSummary(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{checkoutSummary?.title}</DialogTitle>
            <DialogDescription>{t("Total")}: EUR {checkoutSummary?.totalEur.toFixed(2)}</DialogDescription>
          </DialogHeader>
          {checkoutSecret && (
            <Elements stripe={getStripe()} options={{ clientSecret: checkoutSecret }}>
              <CheckoutForm onSuccess={() => {
                toast({ title: t("Purchase submitted"), description: t("Your order is being confirmed.") });
                setCheckoutSecret(null);
                setCheckoutSummary(null);
              }} />
            </Elements>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
