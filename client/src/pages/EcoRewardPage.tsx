import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Award, Leaf, Trophy, Star, Gift, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function EcoRewardPage() {
  const { t } = useTranslation();
  const [userPoints] = useState(2450);
  const [userLevel] = useState("Gold");
  const [certificates] = useState([
    { id: 1, name: "Eco Champion", co2Saved: 500, date: "2025-09-15" },
    { id: 2, name: "Green Driver", co2Saved: 1000, date: "2025-08-01" }
  ]);

  const rewards = [
    { id: 1, name: "10% discount", points: 500, icon: Gift, available: true },
    { id: 2, name: "Free delivery", points: 1000, icon: Trophy, available: true },
    { id: 3, name: "Premium month", points: 2000, icon: Star, available: true },
    { id: 4, name: "Electric van upgrade", points: 5000, icon: Leaf, available: false }
  ];

  const achievements = [
    { title: "First Green Route", description: "Used eco-optimized route", earned: true },
    { title: "100 kg CO₂ Saved", description: "Environmental hero", earned: true },
    { title: "Zero Emissions Week", description: "7 days electric only", earned: false },
    { title: "Eco Ambassador", description: "Refer 10 drivers", earned: false }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
          <Award className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t("EcoReward System")}</h1>
          <p className="text-muted-foreground">{t("Earn points and certificates for eco-friendly driving")}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="border-green-200 dark:border-green-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              {t("Your Points")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-green-600" data-testid="text-user-points">{userPoints}</div>
            <Badge className="mt-2" data-testid="badge-user-level">{userLevel} Member</Badge>
            <Progress value={65} className="mt-4" />
            <p className="text-sm text-muted-foreground mt-2">{t("550 points to Platinum level")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Leaf className="w-5 h-5 text-green-600" />
              {t("CO₂ Impact")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-co2-saved">1,247 kg</div>
            <p className="text-sm text-muted-foreground mt-2">{t("Total CO₂ saved this year")}</p>
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <TrendingUp className="w-4 h-4 text-green-600 inline mr-2" />
              <span className="text-sm">{t("Equal to planting")} <strong>62 trees</strong></span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              {t("Certificates")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-certificate-count">{certificates.length}</div>
            <p className="text-sm text-muted-foreground mt-2">{t("Eco certificates earned")}</p>
            <Button variant="outline" className="w-full mt-4" data-testid="button-view-certificates">
              {t("View All")}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rewards" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rewards" data-testid="tab-rewards">{t("Rewards")}</TabsTrigger>
          <TabsTrigger value="achievements" data-testid="tab-achievements">{t("Achievements")}</TabsTrigger>
          <TabsTrigger value="certificates" data-testid="tab-certificates">{t("Certificates")}</TabsTrigger>
        </TabsList>

        <TabsContent value="rewards" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {rewards.map((reward) => {
              const Icon = reward.icon;
              return (
                <Card key={reward.id} className={!reward.available ? "opacity-50" : ""}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5" />
                        {reward.name}
                      </div>
                      <Badge variant="secondary" data-testid={`reward-points-${reward.id}`}>
                        {reward.points} pts
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      className="w-full" 
                      disabled={!reward.available || userPoints < reward.points}
                      data-testid={`button-redeem-${reward.id}`}
                    >
                      {userPoints >= reward.points ? t("Redeem") : t("Not enough points")}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="achievements" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {achievements.map((achievement, idx) => (
              <Card key={idx} className={achievement.earned ? "border-green-200 dark:border-green-800" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {achievement.earned ? (
                      <Award className="w-5 h-5 text-green-600" />
                    ) : (
                      <Award className="w-5 h-5 text-muted-foreground" />
                    )}
                    {achievement.title}
                  </CardTitle>
                  <CardDescription>{achievement.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant={achievement.earned ? "default" : "secondary"} data-testid={`achievement-${idx}`}>
                    {achievement.earned ? t("Earned") : t("Locked")}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="certificates" className="space-y-4">
          {certificates.map((cert) => (
            <Card key={cert.id} className="border-green-200 dark:border-green-800">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-green-600" />
                    {cert.name}
                  </div>
                  <Badge variant="secondary" data-testid={`cert-date-${cert.id}`}>{cert.date}</Badge>
                </CardTitle>
                <CardDescription>
                  {t("For saving")} {cert.co2Saved} kg CO₂
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" data-testid={`button-download-cert-${cert.id}`}>
                  {t("Download Certificate")}
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>{t("How to Earn Points")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="text-center p-4">
              <div className="text-2xl font-bold text-green-600">+50</div>
              <p className="text-sm mt-2">{t("Use green route")}</p>
            </div>
            <div className="text-center p-4">
              <div className="text-2xl font-bold text-green-600">+100</div>
              <p className="text-sm mt-2">{t("Electric vehicle")}</p>
            </div>
            <div className="text-center p-4">
              <div className="text-2xl font-bold text-green-600">+200</div>
              <p className="text-sm mt-2">{t("Carpool delivery")}</p>
            </div>
            <div className="text-center p-4">
              <div className="text-2xl font-bold text-green-600">+500</div>
              <p className="text-sm mt-2">{t("Zero emissions week")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
