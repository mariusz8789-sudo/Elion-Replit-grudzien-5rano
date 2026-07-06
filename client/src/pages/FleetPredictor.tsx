import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Brain, BarChart3, MapPin, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function FleetPredictor() {
  const { t } = useTranslation();

  const demandForecast = [
    { day: "Mon", demand: 45, predicted: 48 },
    { day: "Tue", demand: 52, predicted: 50 },
    { day: "Wed", demand: 38, predicted: 40 },
    { day: "Thu", demand: 61, predicted: 58 },
    { day: "Fri", demand: 75, predicted: 72 },
    { day: "Sat", demand: 42, predicted: 45 },
    { day: "Sun", demand: 28, predicted: 30 }
  ];

  const hotZones = [
    { zone: "Warszawa Centrum", demand: 92, trend: "up" },
    { zone: "Kraków Stare Miasto", demand: 78, trend: "up" },
    { zone: "Gdańsk Port", demand: 65, trend: "stable" },
    { zone: "Wrocław Biznes", demand: 54, trend: "down" }
  ];

  const peakHours = [
    { hour: "8-10", probability: 85, revenue: 450 },
    { hour: "12-14", probability: 72, revenue: 380 },
    { hour: "16-18", probability: 91, revenue: 520 },
    { hour: "20-22", probability: 45, revenue: 210 }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-100 dark:bg-indigo-900/20 rounded-lg">
          <Brain className="w-8 h-8 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t("AI FleetPredictor")}</h1>
          <p className="text-muted-foreground">{t("Machine learning demand forecasting & route optimization")}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              {t("Next 7 Days")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-indigo-600" data-testid="text-avg-demand">+18%</div>
            <p className="text-sm text-muted-foreground mt-2">{t("Demand increase predicted")}</p>
            <Badge className="mt-2" data-testid="badge-confidence">96% confidence</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              {t("Peak Day")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-peak-day">Friday</div>
            <p className="text-sm text-muted-foreground mt-2">{t("Expected 75+ deliveries")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-600" />
              {t("Hot Zone")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-hot-zone">Warszawa Centrum</div>
            <p className="text-sm text-muted-foreground mt-2">{t("92% demand score")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Demand Forecast (AI Prediction)")}</CardTitle>
          <CardDescription>{t("Historical data vs ML predictions")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={demandForecast}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="demand" stroke="#6366f1" name="Actual" strokeWidth={2} />
              <Line type="monotone" dataKey="predicted" stroke="#10b981" name="AI Predicted" strokeWidth={2} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              {t("Hot Zones by Demand")}
            </CardTitle>
            <CardDescription>{t("AI-analyzed high-demand areas")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hotZones.map((zone, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-muted rounded-lg" data-testid={`zone-${idx}`}>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-600" />
                  <span className="font-medium">{zone.zone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={zone.trend === "up" ? "default" : zone.trend === "stable" ? "secondary" : "outline"}>
                    {zone.trend === "up" ? "↑" : zone.trend === "stable" ? "→" : "↓"} {zone.demand}%
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {t("Peak Hours Prediction")}
            </CardTitle>
            <CardDescription>{t("Best times for maximum revenue")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {peakHours.map((hour, idx) => (
              <div key={idx} className="p-3 bg-muted rounded-lg" data-testid={`peak-hour-${idx}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{hour.hour}</span>
                  <span className="text-sm text-muted-foreground">{hour.probability}% probability</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">{t("Est. revenue")}</div>
                  <div className="text-lg font-bold text-green-600">{hour.revenue} PLN</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("AI Recommendations")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg">
              <Brain className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div>
                <h3 className="font-semibold">{t("Increase fleet by 3 vehicles on Friday")}</h3>
                <p className="text-sm text-muted-foreground">{t("AI predicts 18% demand spike - potential +1,200 PLN revenue")}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg">
              <MapPin className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div>
                <h3 className="font-semibold">{t("Deploy drivers to Warszawa Centrum 16-18")}</h3>
                <p className="text-sm text-muted-foreground">{t("91% probability of high demand - position vehicles early")}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div>
                <h3 className="font-semibold">{t("Optimize Sunday routes")}</h3>
                <p className="text-sm text-muted-foreground">{t("Low demand detected - consolidate deliveries to reduce costs by 35%")}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
