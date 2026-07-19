import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QrCode, Scan, CheckCircle, AlertCircle, Smartphone, Camera } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import type { Booking } from "@shared/schema";

function QrCodeDialog({ bookingId }: { bookingId: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(bookingId, { width: 240, margin: 1 }).then(setDataUrl);
  }, [bookingId]);

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      {dataUrl ? (
        <img src={dataUrl} alt="Job QR code" className="rounded-lg border" data-testid="img-qr-code" />
      ) : (
        <div className="w-60 h-60 bg-muted animate-pulse rounded-lg" />
      )}
      <p className="text-xs text-muted-foreground font-mono" data-testid="text-qr-value">{bookingId}</p>
    </div>
  );
}

function DispatcherView({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const { data: jobs = [], isLoading } = useQuery<Booking[]>({
    queryKey: [`/api/companies/${companyId}/dispatch-jobs`],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="w-5 h-5" />
          {t("Jobs Awaiting Driver Dispatch")}
        </CardTitle>
        <CardDescription>{t("Accepted bookings with no driver assigned yet - generate a QR code for the driver to scan on arrival")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <div className="h-24 bg-muted animate-pulse rounded-lg" />}
        {!isLoading && jobs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-jobs">
            {t("No jobs waiting for driver dispatch right now.")}
          </p>
        )}
        {jobs.map((job) => (
          <div key={job.id} className="flex items-center justify-between p-4 bg-muted rounded-lg" data-testid={`job-${job.id}`}>
            <div className="flex items-center gap-4 min-w-0">
              <QrCode className="w-8 h-8 text-orange-600 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium truncate">{job.pickupAddress} → {job.deliveryAddress}</div>
                <div className="text-sm text-muted-foreground">${job.totalPrice}</div>
              </div>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" data-testid={`button-show-qr-${job.id}`}>
                  <QrCode className="w-4 h-4 mr-2" />
                  {t("Show QR")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("Job Dispatch Code")}</DialogTitle>
                </DialogHeader>
                <QrCodeDialog bookingId={job.id} />
              </DialogContent>
            </Dialog>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

type ClaimState = { status: "idle" } | { status: "success"; booking: Booking } | { status: "error"; message: string };

function useClaimMutation(onResult: (state: ClaimState) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await apiRequest("POST", `/api/bookings/${bookingId}/claim`, {});
      return res.json() as Promise<Booking>;
    },
    onSuccess: (booking) => {
      onResult({ status: "success", booking });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${booking.companyId}/dispatch-jobs`] });
    },
    onError: (error: any) => onResult({ status: "error", message: error.message || "Could not claim this job" }),
  });
}

function CameraScanner({ onDetected }: { onDetected: (value: string) => void }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [supported] = useState(() => typeof window !== "undefined" && "BarcodeDetector" in window);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanning || !supported) return;
    let stream: MediaStream | null = null;
    let rafId: number;
    let stopped = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const DetectorCtor = (window as any).BarcodeDetector;
        const detector = new DetectorCtor({ formats: ["qr_code"] });
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              setScanning(false);
              onDetected(codes[0].rawValue);
              return;
            }
          } catch {
            // transient decode failures are expected between frames; keep scanning
          }
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      } catch (err: any) {
        setError(err.message || "Camera access denied");
        setScanning(false);
      }
    })();

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [scanning, supported, onDetected]);

  if (!supported) {
    return (
      <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground flex items-start gap-2" data-testid="text-camera-unsupported">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        {t("QR camera scanning isn't supported in this browser. Use manual entry below instead.")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="aspect-square bg-black rounded-lg overflow-hidden relative">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline data-testid="video-scanner" />
        {!scanning && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Camera className="w-16 h-16 text-white/70" />
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive" data-testid="text-camera-error">{error}</p>}
      <Button className="w-full" onClick={() => { setError(null); setScanning((s) => !s); }} data-testid="button-scan">
        <Scan className="w-4 h-4 mr-2" />
        {scanning ? t("Stop Scanning") : t("Start Scanning")}
      </Button>
    </div>
  );
}

function NfcReader({ onDetected }: { onDetected: (value: string) => void }) {
  const { t } = useTranslation();
  const [supported] = useState(() => typeof window !== "undefined" && "NDEFReader" in window);
  const [status, setStatus] = useState<"idle" | "waiting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const startScan = async () => {
    setStatus("waiting");
    setError(null);
    try {
      const reader = new (window as any).NDEFReader();
      await reader.scan();
      reader.onreading = (event: any) => {
        const decoder = new TextDecoder();
        for (const record of event.message.records) {
          if (record.recordType === "text") {
            onDetected(decoder.decode(record.data));
            setStatus("idle");
            return;
          }
        }
        onDetected(event.serialNumber);
        setStatus("idle");
      };
    } catch (err: any) {
      setError(err.message || "NFC scan failed");
      setStatus("error");
    }
  };

  if (!supported) {
    return (
      <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground flex items-start gap-2" data-testid="text-nfc-unsupported">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        {t("Web NFC isn't supported on this device/browser (Chrome on Android only).")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="aspect-square bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20 rounded-lg flex items-center justify-center border-2 border-dashed border-blue-300 dark:border-blue-700">
        <div className="text-center">
          <Smartphone className="w-16 h-16 mx-auto mb-2 text-blue-600" />
          <Badge data-testid="badge-nfc-status">
            {status === "waiting" ? t("Waiting for tap...") : t("NFC Ready")}
          </Badge>
        </div>
      </div>
      {error && <p className="text-sm text-destructive" data-testid="text-nfc-error">{error}</p>}
      <Button className="w-full" variant="outline" onClick={startScan} disabled={status === "waiting"} data-testid="button-nfc-scan">
        <Smartphone className="w-4 h-4 mr-2" />
        {status === "waiting" ? t("Waiting for tap...") : t("Start NFC Scan")}
      </Button>
    </div>
  );
}

function DriverView() {
  const { t } = useTranslation();
  const [manualId, setManualId] = useState("");
  const [claimState, setClaimState] = useState<ClaimState>({ status: "idle" });
  const claimMutation = useClaimMutation(setClaimState);

  const handleDetected = (bookingId: string) => {
    if (!bookingId) return;
    claimMutation.mutate(bookingId.trim());
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className={claimState.status === "success" ? "border-green-200 dark:border-green-800" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="w-5 h-5" />
            {t("Scan Job QR Code")}
          </CardTitle>
          <CardDescription>{t("Point your camera at the job's QR code to claim it")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {claimState.status === "success" ? (
            <div className="text-center space-y-3 p-6">
              <CheckCircle className="w-16 h-16 mx-auto text-green-600" />
              <div className="text-xl font-bold text-green-600">{t("Job Claimed!")}</div>
              <p className="text-sm text-muted-foreground" data-testid="text-claimed-job">
                {claimState.booking.pickupAddress} → {claimState.booking.deliveryAddress}
              </p>
              <Button variant="outline" onClick={() => setClaimState({ status: "idle" })} data-testid="button-scan-another">
                {t("Scan Another Job")}
              </Button>
            </div>
          ) : (
            <>
              <CameraScanner onDetected={handleDetected} />
              <div className="flex gap-2">
                <Input
                  placeholder={t("Or enter job code manually")}
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  data-testid="input-manual-code"
                />
                <Button
                  variant="secondary"
                  disabled={!manualId || claimMutation.isPending}
                  onClick={() => handleDetected(manualId)}
                  data-testid="button-submit-manual-code"
                >
                  {t("Claim")}
                </Button>
              </div>
              {claimState.status === "error" && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm" data-testid="text-claim-error">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{claimState.message}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            {t("NFC Tap Dispatch")}
          </CardTitle>
          <CardDescription>{t("Tap your phone to a job's NFC tag")}</CardDescription>
        </CardHeader>
        <CardContent>
          <NfcReader onDetected={handleDetected} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function QRDispatch() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
          <QrCode className="w-8 h-8 text-orange-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{t("QR/NFC Dispatch")}</h1>
          <p className="text-muted-foreground">{t("Instant driver-to-job pairing via real QR codes and Web NFC")}</p>
        </div>
      </div>

      {!user && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("Log in as a driver or company to use QR/NFC dispatch.")}
          </CardContent>
        </Card>
      )}

      {user?.role === "company" && user.companyId && <DispatcherView companyId={user.companyId} />}
      {user?.role === "driver" && <DriverView />}
      {user && user.role !== "company" && user.role !== "driver" && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("QR/NFC dispatch is available for company dispatchers and drivers.")}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
