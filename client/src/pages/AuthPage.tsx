import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Truck, Mail, Phone, Lock, User, ShieldCheck } from "lucide-react";
import logoPath from "@assets/file_0000000037a86243bd21599fc142fdaa_1760057642535.png";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [, setLocation] = useLocation();
  const { login, verifyMfa, register } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === "login") {
        const result = await login(email, password);
        if (result.mfaRequired && result.challengeToken) {
          setMfaChallengeToken(result.challengeToken);
          return;
        }
        toast({
          title: "Welcome back!",
          description: "You've successfully logged in.",
        });
      } else {
        await register(name, email, phone, password);
        toast({
          title: "Account created!",
          description: "You've successfully registered.",
        });
      }
      setLocation("/");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Authentication failed",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallengeToken) return;
    setIsLoading(true);
    try {
      await verifyMfa(mfaChallengeToken, mfaCode);
      toast({ title: "Welcome back!", description: "You've successfully logged in." });
      setLocation("/");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Verification failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (mfaChallengeToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Two-Factor Verification</h1>
            <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app, or a backup code.</p>
          </div>
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mfa-code" className="text-sm font-medium">Verification code</Label>
              <Input
                id="mfa-code"
                type="text"
                placeholder="123456"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                required
                data-testid="input-mfa-code"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading || !mfaCode.trim()} data-testid="button-mfa-submit">
              {isLoading ? "Verifying..." : "Verify"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => { setMfaChallengeToken(null); setMfaCode(""); }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-center"
            data-testid="button-mfa-back"
          >
            Back to sign in
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <img src={logoPath} alt="Point to Point" className="w-12 h-12" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "login" 
              ? "Sign in to manage your bookings" 
              : "Join our logistics platform"}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Full Name
              </Label>
              <div className="relative">
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10"
                  required
                  data-testid="input-name"
                />
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email
            </Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                required
                data-testid="input-email"
              />
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium">
                Phone Number
              </Label>
              <div className="relative">
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-10"
                  required
                  data-testid="input-phone"
                />
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
                required
                data-testid="input-password"
              />
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
          </div>
          
          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading}
            data-testid="button-submit"
          >
            {isLoading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </Button>
        </form>
        
        <div className="text-center">
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-toggle-mode"
          >
            {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
        
        <div className="pt-4 border-t">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Truck className="w-3 h-3" />
            <span>Secure logistics platform</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
