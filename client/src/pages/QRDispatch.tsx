import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QrCode, Scan, CheckCircle, Clock, Zap, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function QRDispatch() {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setScanned(true);
    }, 1500);
  };

  const jobs = [
    { id: "JOB-2024-157", pickup: "Warszawa Centrum", dropoff: "Kraków", qrCode: "QR-157-2024" },
    { id: "JOB-2024-158", pickup: "Gdańsk Port", dropoff: "Poznań", qrCode: "QR-158-2024" },
    { id: "JOB-2024-159", pickup: "Wrocław", dropoff: "Łódź", qrCode: "QR-159-2024" }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
          <QrCode className="w-8 h-8 text-orange-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t("QuickP2P Connect")}</h1>
          <p className="text-muted-foreground">{t("NFC & QR instant job pairing - zero clicks")}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-600" />
              {t("Instant Pairing")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-pairing-time">&lt;2s</div>
            <p className="text-sm text-muted-foreground mt-2">{t("Average connection time")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-orange-600" />
              {t("Jobs Today")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-jobs-today">23</div>
            <p className="text-sm text-muted-foreground mt-2">{t("Available for quick dispatch")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              {t("Success Rate")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-green-600" data-testid="text-success-rate">99.8%</div>
            <p className="text-sm text-muted-foreground mt-2">{t("QR/NFC reliability")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className={scanned ? "border-green-200 dark:border-green-800" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scan className="w-5 h-5" />
              {t("Scan QR Code")}
            </CardTitle>
            <CardDescription>{t("Point camera at job QR code to accept")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="aspect-square bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/20 rounded-lg flex items-center justify-center border-2 border-dashed border-orange-300 dark:border-orange-700">
              {scanned ? (
                <div className="text-center space-y-4">
                  <CheckCircle className="w-20 h-20 mx-auto text-green-600" />
                  <div>
                    <div className="text-2xl font-bold text-green-600">{t("Job Accepted!")}</div>
                    <p className="text-sm text-muted-foreground mt-2" data-testid="text-job-id">JOB-2024-157</p>
                  </div>
                </div>
              ) : scanning ? (
                <div className="text-center space-y-4">
                  <Scan className="w-20 h-20 mx-auto text-orange-600 animate-pulse" />
                  <p className="text-sm text-muted-foreground">{t("Scanning...")}</p>
                </div>
              ) : (
                <div className="text-center">
                  <QrCode className="w-20 h-20 mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">{t("Camera view")}</p>
                  <p className="text-sm mt-2 text-muted-foreground">{t("(QR scanner will appear here)")}</p>
                </div>
              )}
            </div>

            <Button 
              className="w-full" 
              onClick={handleScan}
              disabled={scanning || scanned}
              data-testid="button-scan"
            >
              {scanning ? (
                <>{t("Scanning...")}</>
              ) : scanned ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {t("Job Accepted")}
                </>
              ) : (
                <>
                  <Scan className="w-4 h-4 mr-2" />
                  {t("Start Scanning")}
                </>
              )}
            </Button>

            {scanned && (
              <Button variant="outline" className="w-full" onClick={() => setScanned(false)} data-testid="button-scan-another">
                {t("Scan Another Job")}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5" />
              {t("NFC Tap Dispatch")}
            </CardTitle>
            <CardDescription>{t("Tap your phone to job NFC tag")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="aspect-square bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20 rounded-lg flex items-center justify-center border-2 border-dashed border-blue-300 dark:border-blue-700">
              <div className="text-center">
                <Smartphone className="w-20 h-20 mx-auto mb-4 text-blue-600" />
                <p className="text-muted-foreground mb-2">{t("NFC Ready")}</p>
                <p className="text-sm text-muted-foreground">{t("Bring phone close to NFC tag")}</p>
                <Badge className="mt-4" data-testid="badge-nfc-status">Waiting for tap...</Badge>
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <div className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-blue-600 mt-0.5" />
                <div className="text-sm">
                  <strong>{t("Ultra-fast:")}</strong> {t("Automatic job acceptance in under 1 second")}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Available Jobs (QR/NFC Ready)")}</CardTitle>
          <CardDescription>{t("Each job has a unique QR code and NFC tag")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between p-4 bg-muted rounded-lg" data-testid={`job-${job.id}`}>
              <div className="flex items-center gap-4">
                <QrCode className="w-8 h-8 text-orange-600" />
                <div>
                  <div className="font-medium">{job.id}</div>
                  <div className="text-sm text-muted-foreground">
                    {job.pickup} → {job.dropoff}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" data-testid={`qr-code-${job.id}`}>{job.qrCode}</Badge>
                <Button size="sm" data-testid={`button-show-qr-${job.id}`}>
                  <QrCode className="w-4 h-4 mr-2" />
                  {t("Show QR")}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("How QuickP2P Works")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <QrCode className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="font-semibold mb-1">{t("Scan Code")}</h3>
              <p className="text-sm text-muted-foreground">{t("Point camera at QR or tap NFC")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <Zap className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="font-semibold mb-1">{t("Auto-Pair")}</h3>
              <p className="text-sm text-muted-foreground">{t("Instant driver-job matching")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <CheckCircle className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="font-semibold mb-1">{t("Confirm")}</h3>
              <p className="text-sm text-muted-foreground">{t("Job accepted automatically")}</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="font-semibold mb-1">{t("Start")}</h3>
              <p className="text-sm text-muted-foreground">{t("Begin delivery immediately")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
