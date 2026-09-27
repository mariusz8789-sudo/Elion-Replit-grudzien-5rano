import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Leaf, Download, FileText, TrendingDown, Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function CarbonLedger() {
  const { t } = useTranslation();

  const monthlyData = [
    { month: "Jan", co2: 145, saved: 23 },
    { month: "Feb", co2: 132, saved: 31 },
    { month: "Mar", co2: 118, saved: 45 },
    { month: "Apr", co2: 95, saved: 62 },
    { month: "May", co2: 87, saved: 71 },
    { month: "Jun", co2: 76, saved: 85 }
  ];

  const esgMetrics = [
    { category: "Emissions Reduction", score: 92, target: 95 },
    { category: "Electric Fleet %", score: 35, target: 50 },
    { category: "Route Optimization", score: 88, target: 85 },
    { category: "Carbon Offsetting", score: 78, target: 80 }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
          <Leaf className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t("Carbon Ledger")}</h1>
          <p className="text-muted-foreground">{t("Blockchain-ready ESG reporting & carbon credits")}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Leaf className="w-5 h-5 text-green-600" />
              {t("Total CO₂ Saved")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-green-600" data-testid="text-total-saved">317 kg</div>
            <p className="text-sm text-muted-foreground mt-2">{t("This year")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-green-600" />
              {t("Reduction Rate")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-green-600" data-testid="text-reduction">-47%</div>
            <p className="text-sm text-muted-foreground mt-2">{t("vs. last year")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-500" />
              {t("Carbon Credits")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-credits">12.5</div>
            <p className="text-sm text-muted-foreground mt-2">{t("Tokens earned")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {t("ESG Score")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-blue-600" data-testid="text-esg-score">A+</div>
            <p className="text-sm text-muted-foreground mt-2">{t("Compliance rating")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("Emissions Trend")}</CardTitle>
            <CardDescription>{t("Monthly CO₂ emissions and savings")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="co2" stroke="#ef4444" name="Emissions (kg)" strokeWidth={2} />
                <Line type="monotone" dataKey="saved" stroke="#10b981" name="Saved (kg)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("ESG Performance")}</CardTitle>
            <CardDescription>{t("Environmental, Social, Governance metrics")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={esgMetrics} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="category" type="category" width={120} />
                <Tooltip />
                <Legend />
                <Bar dataKey="score" fill="#10b981" name="Current" />
                <Bar dataKey="target" fill="#94a3b8" name="Target" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-green-200 dark:border-green-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {t("ESG Reports & Certificates")}
          </CardTitle>
          <CardDescription>{t("Download compliance documentation")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-green-600" />
              <div>
                <div className="font-medium">{t("Q2 2025 ESG Report")}</div>
                <div className="text-sm text-muted-foreground">{t("Blockchain verified")}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" data-testid="badge-verified">Verified</Badge>
              <Button variant="outline" size="sm" data-testid="button-download-q2">
                <Download className="w-4 h-4 mr-2" />
                {t("PDF")}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-green-600" />
              <div>
                <div className="font-medium">{t("Carbon Offset Certificate")}</div>
                <div className="text-sm text-muted-foreground">{t("317 kg CO₂ reduced")}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" data-testid="badge-blockchain">Blockchain</Badge>
              <Button variant="outline" size="sm" data-testid="button-download-cert">
                <Download className="w-4 h-4 mr-2" />
                {t("PDF")}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <Award className="w-5 h-5 text-yellow-500" />
              <div>
                <div className="font-medium">{t("Carbon Credits Summary")}</div>
                <div className="text-sm text-muted-foreground">{t("12.5 tokens - tradeable")}</div>
              </div>
            </div>
            <Button variant="outline" size="sm" data-testid="button-trade-credits">
              {t("Trade")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Blockchain Integration")}</CardTitle>
          <CardDescription>{t("Immutable carbon tracking on distributed ledger")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <Leaf className="w-6 h-6 text-green-600 mb-2" />
              <h3 className="font-semibold mb-1">{t("Verified Data")}</h3>
              <p className="text-sm text-muted-foreground">{t("All emissions recorded on blockchain")}</p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <Award className="w-6 h-6 text-green-600 mb-2" />
              <h3 className="font-semibold mb-1">{t("Smart Contracts")}</h3>
              <p className="text-sm text-muted-foreground">{t("Automatic carbon credit issuance")}</p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <FileText className="w-6 h-6 text-green-600 mb-2" />
              <h3 className="font-semibold mb-1">{t("Audit Trail")}</h3>
              <p className="text-sm text-muted-foreground">{t("Transparent, tamper-proof records")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
