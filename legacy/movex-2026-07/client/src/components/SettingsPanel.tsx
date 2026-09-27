import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Bell, Eye, MessageSquare, Trash2, Shield, User, Gift, Copy, KeyRound, Download, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ReferralReward } from "@shared/schema";
import VerificationUpload from "./VerificationUpload";

function MfaSetupCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<"idle" | "setup" | "done">("idle");
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/mfa/setup", {});
      return res.json() as Promise<{ secret: string; qrCodeDataUrl: string }>;
    },
    onSuccess: (data) => { setSetupData(data); setStep("setup"); },
    onError: (error: any) => toast({ title: "Setup failed", description: error.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/mfa/confirm", { code });
      return res.json() as Promise<{ success: boolean; backupCodes: string[] }>;
    },
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: any) => toast({ title: "Invalid code", description: error.message, variant: "destructive" }),
  });

  const disableMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/auth/mfa/disable", { password: disablePassword }); },
    onSuccess: () => {
      toast({ title: "Two-factor authentication disabled" });
      setDisablePassword("");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: any) => toast({ title: "Failed to disable", description: error.message, variant: "destructive" }),
  });

  if (user?.mfaEnabled) {
    return (
      <Card className="p-6 space-y-4 border-card-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Two-Factor Authentication</h2>
            <p className="text-sm text-muted-foreground">Enabled - your account requires a code from your authenticator app to sign in.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input type="password" placeholder="Confirm password to disable" className="max-w-xs" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} data-testid="input-mfa-disable-password" />
          <Button variant="destructive" size="sm" onClick={() => disableMutation.mutate()} disabled={!disablePassword.trim() || disableMutation.isPending} data-testid="button-mfa-disable">
            Disable
          </Button>
        </div>
      </Card>
    );
  }

  if (step === "done" && backupCodes) {
    return (
      <Card className="p-6 space-y-4 border-card-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Two-Factor Authentication Enabled</h2>
            <p className="text-sm text-muted-foreground">Save these backup codes now - they're shown only once and let you sign in if you lose your device.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 font-mono text-sm p-3 bg-muted rounded" data-testid="text-backup-codes">
          {backupCodes.map((c) => <div key={c}>{c}</div>)}
        </div>
        <Button size="sm" onClick={() => setStep("idle")} data-testid="button-mfa-done">Done</Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4 border-card-border">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <KeyRound className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Two-Factor Authentication</h2>
          <p className="text-sm text-muted-foreground">Add an authenticator app code as a second step when signing in.</p>
        </div>
      </div>
      {step === "idle" && (
        <Button size="sm" onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending} data-testid="button-mfa-setup">
          Set Up Two-Factor Authentication
        </Button>
      )}
      {step === "setup" && setupData && (
        <div className="space-y-3">
          <img src={setupData.qrCodeDataUrl} alt="MFA setup QR code" className="w-40 h-40 border rounded" data-testid="img-mfa-qr" />
          <p className="text-xs text-muted-foreground">Can't scan? Enter this key manually: <span className="font-mono">{setupData.secret}</span></p>
          <div className="flex items-center gap-2">
            <Input placeholder="6-digit code" className="max-w-xs" value={code} onChange={(e) => setCode(e.target.value)} data-testid="input-mfa-confirm-code" />
            <Button size="sm" onClick={() => confirmMutation.mutate()} disabled={!code.trim() || confirmMutation.isPending} data-testid="button-mfa-confirm">
              Confirm
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function DataPrivacyCard() {
  const { toast } = useToast();
  const { logout } = useAuth();
  const [deletePassword, setDeletePassword] = useState("");

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/users/me/data-export", undefined);
      return res.json();
    },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my-movex-data.json";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Data export downloaded" });
    },
    onError: (error: any) => toast({ title: "Export failed", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/users/me/delete-account", { password: deletePassword }); },
    onSuccess: () => {
      toast({ title: "Account deleted" });
      logout();
    },
    onError: (error: any) => toast({ title: "Deletion failed", description: error.message, variant: "destructive" }),
  });

  return (
    <Card className="p-6 space-y-4 border-card-border">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Download className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Data & Privacy</h2>
          <p className="text-sm text-muted-foreground">Export your data or permanently delete your account (GDPR).</p>
        </div>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending} data-testid="button-export-data">
          Export My Data
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive" data-testid="button-delete-account-open">
              <AlertTriangle className="w-4 h-4 mr-2" />Delete Account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete your account</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This permanently removes your personal details (name, email, phone, avatar). Your booking history stays on
              file for the other party's records and legal retention requirements, but is no longer linked to you by name.
              This cannot be undone.
            </p>
            <Input type="password" placeholder="Confirm your password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} data-testid="input-delete-account-password" />
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={!deletePassword.trim() || deleteMutation.isPending} data-testid="button-delete-account-confirm">
              Permanently Delete My Account
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}

interface ReferralData {
  referralCode: string;
  rewards: ReferralReward[];
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState({
    hideOnlineStatus: false,
    disableReadReceipts: false,
    webPushEnabled: true,
    autoDelete: "30"
  });
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: referralData } = useQuery<ReferralData>({
    queryKey: [`/api/users/${user?.id}/referrals`],
    enabled: !!user?.id,
  });

  const updateSetting = (key: string, value: boolean | string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const copyReferralCode = () => {
    if (!referralData?.referralCode) return;
    navigator.clipboard.writeText(referralData.referralCode);
    toast({ title: "Copied!", description: "Referral code copied to clipboard." });
  };
  
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground font-[Outfit] mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage your privacy and security preferences</p>
      </div>
      
      <Card className="p-6 space-y-6 border-card-border">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Privacy Settings</h2>
            <p className="text-sm text-muted-foreground">Control your visibility and data</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Eye className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <Label htmlFor="online-status" className="text-sm font-medium">
                  Hide Online Status
                </Label>
                <p className="text-sm text-muted-foreground">
                  Others won't see when you're online
                </p>
              </div>
            </div>
            <Switch
              id="online-status"
              checked={settings.hideOnlineStatus}
              onCheckedChange={(checked) => updateSetting('hideOnlineStatus', checked)}
              data-testid="toggle-online-status"
            />
          </div>
          
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <MessageSquare className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <Label htmlFor="read-receipts" className="text-sm font-medium">
                  Disable Read Receipts
                </Label>
                <p className="text-sm text-muted-foreground">
                  Don't show when you've read messages
                </p>
              </div>
            </div>
            <Switch
              id="read-receipts"
              checked={settings.disableReadReceipts}
              onCheckedChange={(checked) => updateSetting('disableReadReceipts', checked)}
              data-testid="toggle-read-receipts"
            />
          </div>
          
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Bell className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <Label htmlFor="web-push" className="text-sm font-medium">
                  Web Push Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receive push notifications in your browser
                </p>
              </div>
            </div>
            <Switch
              id="web-push"
              checked={settings.webPushEnabled}
              onCheckedChange={(checked) => updateSetting('webPushEnabled', checked)}
              data-testid="toggle-web-push"
            />
          </div>
          
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Trash2 className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <Label htmlFor="auto-delete" className="text-sm font-medium">
                  Auto-Delete Messages
                </Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Automatically delete messages after a set period
                </p>
                <Select 
                  value={settings.autoDelete} 
                  onValueChange={(value) => updateSetting('autoDelete', value)}
                >
                  <SelectTrigger className="w-full max-w-xs" data-testid="select-auto-delete">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days (default)</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </Card>
      
      <Card className="p-6 space-y-4 border-card-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Refer a Friend</h2>
            <p className="text-sm text-muted-foreground">
              Share your code — you earn a reward when they complete their first booking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Input value={referralData?.referralCode ?? "..."} readOnly className="font-mono" data-testid="input-referral-code" />
          <Button variant="outline" size="icon" onClick={copyReferralCode} data-testid="button-copy-referral">
            <Copy className="h-4 w-4" />
          </Button>
        </div>

        {referralData && referralData.rewards.length > 0 && (
          <div className="text-sm text-muted-foreground">
            {referralData.rewards.filter(r => r.status === "credited").length} credited reward(s) ·{" "}
            {referralData.rewards.filter(r => r.status === "pending").length} pending
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4 border-card-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Account Actions</h2>
            <p className="text-sm text-muted-foreground">Manage blocked users and security</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" data-testid="button-blocked-users">
            View Blocked Users
          </Button>
          <Button variant="outline" className="flex-1" data-testid="button-security-log">
            Security Log
          </Button>
        </div>
      </Card>

      <MfaSetupCard />
      <DataPrivacyCard />

      {user && (
        <VerificationUpload
          holderType="user"
          holderId={user.id}
          docTypes={[
            { value: "id_card", label: "Government ID" },
            { value: "selfie", label: "Selfie" },
            { value: "passport", label: "Passport" },
            { value: "drivers_license", label: "Driving Licence" },
            { value: "work_permit", label: "Work Permit" },
            { value: "residence_permit", label: "Residence Permit" },
            { value: "medical_certificate", label: "Medical Certificate" },
          ]}
          collectExpiry
        />
      )}
    </div>
  );
}
