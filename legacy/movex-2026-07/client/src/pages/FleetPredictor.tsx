import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, BarChart3, MapPin, Clock, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface WeekdayStat {
  day: string;
  avgBookings: number;
  avgRevenue: number;
  totalBookings: number;
}

interface HourlyStat {
  hour: string;
  bookingCount: number;
  sharePercent: number;
  avgRevenue: number;
}

interface FleetPredictorData {
  hasData: boolean;
  totalBookingsAnalyzed: number;
  observedFrom?: string;
  observedTo?: string;
  weekdayStats?: WeekdayStat[];
  peakWeekday?: string;
  trendPercent?: number | null;
  hourlyStats?: HourlyStat[];
  topLocations?: { address: string; count: number }[];
  methodology: string;
}

export default function FleetPredictor() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery<FleetPredictorData>({
    queryKey: ["/api/fleet-predictor"],
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-100 dark:bg-indigo-900/20 rounded-lg">
          <BarChart3 className="w-8 h-8 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t("FleetPredictor")}</h1>
          <p className="text-muted-foreground">{t("Historical demand statistics from your own booking data")}</p>
        </div>
      </div>

      {isLoading && (
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      )}

      {!isLoading && data && !data.hasData && (
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <Info className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">
              {t("Not enough booking history yet to compute reliable statistics")} ({data.totalBookingsAnalyzed} {t("bookings so far")}).
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && data?.hasData && (
        <>
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {data.trendPercent != null && data.trendPercent >= 0 ? (
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-indigo-600" />
                  )}
                  {t("Last 4 Weeks vs Prior 4")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-indigo-600" data-testid="text-trend">
                  {data.trendPercent == null ? t("N/A") : `${data.trendPercent > 0 ? "+" : ""}${data.trendPercent}%`}
                </div>
                <p className="text-sm text-muted-foreground mt-2">{t("Actual booking volume change")}</p>
                <Badge variant="secondary" className="mt-2" data-testid="badge-sample-size">
                  {data.totalBookingsAnalyzed} {t("bookings analyzed")}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  {t("Busiest Weekday")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold" data-testid="text-peak-day">{data.peakWeekday}</div>
                <p className="text-sm text-muted-foreground mt-2">
                  {t("Highest average bookings per occurrence")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-indigo-600" />
                  {t("Top Pickup Location")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold truncate" data-testid="text-hot-zone" title={data.topLocations?.[0]?.address}>
                  {data.topLocations?.[0]?.address || t("N/A")}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {data.topLocations?.[0]?.count || 0} {t("bookings")}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("Average Bookings by Weekday")}</CardTitle>
              <CardDescription>
                {t("Average number of bookings observed on each weekday")} ({data.observedFrom?.slice(0, 10)} — {data.observedTo?.slice(0, 10)})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.weekdayStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="avgBookings" fill="#6366f1" name={t("Avg bookings") as string} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  {t("Top Pickup Locations")}
                </CardTitle>
                <CardDescription>{t("Ranked by real booking volume")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.topLocations?.map((loc, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted rounded-lg" data-testid={`zone-${idx}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="font-medium truncate" title={loc.address}>{loc.address}</span>
                    </div>
                    <Badge>{loc.count} {t("bookings")}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  {t("Booking Distribution by Time of Day")}
                </CardTitle>
                <CardDescription>{t("Share of pickups and average revenue per time window")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.hourlyStats?.map((hour, idx) => (
                  <div key={idx} className="p-3 bg-muted rounded-lg" data-testid={`peak-hour-${idx}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{hour.hour}</span>
                      <span className="text-sm text-muted-foreground">{hour.sharePercent}% {t("of bookings")}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">{t("Avg. booking value")}</div>
                      <div className="text-lg font-bold text-green-600">${hour.avgRevenue}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
