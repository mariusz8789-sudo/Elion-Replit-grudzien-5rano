import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Package, AlertTriangle, CheckCircle, DollarSign } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function InsurancePage() {
  const { t } = useTranslation();
  const [cargoValue, setCargoValue] = useState("");
  const [cargoType, setCargoType] = useState("standard");
  const [distance, setDistance] = useState("");
  const [quote, setQuote] = useState<any>(null);

  const calculateQuote = () => {
    const value = parseFloat(cargoValue) || 0;
    const dist = parseFloat(distance) || 0;
    
    const baseRate = 0.015; // 1.5% of cargo value
    const distanceMultiplier = 1 + (dist / 1000); // +0.1% per 100km
    const typeMultiplier = cargoType === "fragile" ? 1.5 : cargoType === "valuable" ? 2.0 : 1.0;
    
    const premium = value * baseRate * distanceMultiplier * typeMultiplier;
    const coverage = value * 1.2; // 120% coverage
    
    setQuote({
      premium: premium.toFixed(2),
      coverage: coverage.toFixed(2),
      riskScore: Math.min(95, 60 + (dist / 100) + (typeMultiplier * 10))
    });
  };

  const policies = [
    { id: 1, booking: "BK-2024-001", coverage: 5000, premium: 75, status: "active" },
    { id: 2, booking: "BK-2024-002", coverage: 12000, premium: 180, status: "active" },
    { id: 3, booking: "BK-2023-458", coverage: 3000, premium: 45, status: "claimed" }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
          <Shield className="w-8 h-8 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t("Insurance & Safety Layer")}</h1>
          <p className="text-muted-foreground">{t("AI-powered cargo insurance with instant quotes")}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {t("Get Insurance Quote")}
            </CardTitle>
            <CardDescription>{t("AI calculates risk based on cargo type, value, and route")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="cargo-value">{t("Cargo Value (PLN)")}</Label>
              <Input
                id="cargo-value"
                type="number"
                placeholder="10000"
                value={cargoValue}
                onChange={(e) => setCargoValue(e.target.value)}
                data-testid="input-cargo-value"
              />
            </div>

            <div>
              <Label>{t("Cargo Type")}</Label>
              <Select value={cargoType} onValueChange={setCargoType}>
                <SelectTrigger data-testid="select-cargo-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard (furniture, boxes)</SelectItem>
                  <SelectItem value="fragile">Fragile (glass, electronics)</SelectItem>
                  <SelectItem value="valuable">Valuable (art, jewelry)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="distance">{t("Distance (km)")}</Label>
              <Input
                id="distance"
                type="number"
                placeholder="250"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                data-testid="input-distance"
              />
            </div>

            <Button 
              className="w-full"
              onClick={calculateQuote}
              disabled={!cargoValue || !distance}
              data-testid="button-calculate-quote"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              {t("Calculate Quote")}
            </Button>
          </CardContent>
        </Card>

        {quote && (
          <Card className="border-blue-200 dark:border-blue-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <Shield className="w-5 h-5" />
                {t("Insurance Quote")}
              </CardTitle>
              <CardDescription>
                <Badge variant="secondary" data-testid="badge-risk-score">
                  Risk Score: {quote.riskScore.toFixed(0)}/100
                </Badge>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">{t("Premium")}</div>
                <div className="text-3xl font-bold text-blue-600" data-testid="text-premium">
                  {quote.premium} PLN
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">{t("Coverage Amount")}</div>
                <div className="text-2xl font-bold" data-testid="text-coverage">
                  {quote.coverage} PLN
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t("(120% of cargo value)")}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <span className="text-sm">{t("Damage or loss coverage")}</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <span className="text-sm">{t("24/7 claims support")}</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <span className="text-sm">{t("Fast payout (3-5 days)")}</span>
                </div>
              </div>

              <Button className="w-full" data-testid="button-buy-insurance">
                <Shield className="w-4 h-4 mr-2" />
                {t("Buy Insurance")}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("My Insurance Policies")}</CardTitle>
          <CardDescription>{t("Active and past coverage")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {policies.map((policy) => (
            <div key={policy.id} className="flex items-center justify-between p-4 bg-muted rounded-lg" data-testid={`policy-${policy.id}`}>
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="font-medium">{policy.booking}</div>
                  <div className="text-sm text-muted-foreground">Coverage: {policy.coverage.toLocaleString()} PLN</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">{t("Premium")}</div>
                  <div className="font-semibold">{policy.premium} PLN</div>
                </div>
                <Badge variant={policy.status === "active" ? "default" : "secondary"} data-testid={`policy-status-${policy.id}`}>
                  {policy.status}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("How AI Insurance Works")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-semibold mb-1">{t("AI Assessment")}</h3>
              <p className="text-sm text-muted-foreground">{t("Analyzes cargo, route, weather")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <DollarSign className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-semibold mb-1">{t("Instant Quote")}</h3>
              <p className="text-sm text-muted-foreground">{t("Fair pricing in seconds")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <Shield className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-semibold mb-1">{t("Full Coverage")}</h3>
              <p className="text-sm text-muted-foreground">{t("120% protection guarantee")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-semibold mb-1">{t("Easy Claims")}</h3>
              <p className="text-sm text-muted-foreground">{t("One-click claim filing")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
