import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Eye, MessageSquare, Trash2, Shield, User, Gift, Copy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { ReferralReward } from "@shared/schema";
import VerificationUpload from "./VerificationUpload";

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

      {user && (
        <VerificationUpload
          holderType="user"
          holderId={user.id}
          docTypes={[
            { value: "id_card", label: "Government ID" },
            { value: "selfie", label: "Selfie" },
          ]}
        />
      )}
    </div>
  );
}
