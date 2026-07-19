import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Shield, Lock, Mail } from "lucide-react";

interface AuthFormProps {
  mode: "login" | "register";
  onSubmit?: (data: { email?: string; alias?: string; password: string }) => void;
}

export default function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [alias, setAlias] = useState("");
  const [password, setPassword] = useState("");
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.({ email: email || undefined, alias: alias || undefined, password });
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8 space-y-6 border-card-border">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground font-[Outfit]">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "login" 
              ? "Sign in to your secure messenger" 
              : "Join the most secure messenger platform"}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="alias" className="text-sm font-medium">
                Username (Alias)
              </Label>
              <div className="relative">
                <Input
                  id="alias"
                  type="text"
                  placeholder="anonymous_user"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  className="pl-10"
                  data-testid="input-alias"
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email (Optional)
            </Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                data-testid="input-email"
              />
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              data-testid="input-password"
            />
          </div>
          
          <Button 
            type="submit" 
            className="w-full" 
            size="lg"
            data-testid="button-submit"
          >
            {mode === "login" ? "Sign In" : "Create Account"}
          </Button>
        </form>
        
        <div className="text-center text-sm">
          <span className="text-muted-foreground">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button 
            className="text-primary font-medium hover:underline"
            data-testid="link-switch-mode"
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </div>
        
        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Lock className="w-3 h-3" />
            <span>Protected by end-to-end encryption</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
