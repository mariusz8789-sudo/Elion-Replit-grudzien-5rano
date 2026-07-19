import { Shield, Lock, Globe, Server } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingHero() {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-primary via-primary/90 to-accent overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLW9wYWNpdHk9Ii4xIiBzdHJva2Utd2lkdGg9IjIiLz48L2c+PC9zdmc+')] opacity-20"></div>
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-white space-y-8">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full border border-white/20">
              <Lock className="w-4 h-4" />
              <span className="text-sm font-medium">End-to-End Encrypted</span>
            </div>
            
            <h1 className="text-5xl lg:text-6xl font-bold font-[Outfit] leading-tight">
              Military-Grade Encryption for Everyone
            </h1>
            
            <p className="text-xl text-white/90 leading-relaxed">
              Twierdza Security delivers zero-knowledge messaging with sealed-sender privacy. 
              Your conversations stay yours—even we can't read them.
            </p>
            
            <div className="flex flex-wrap gap-4">
              <Button 
                size="lg" 
                className="bg-accent hover:bg-accent/90 text-white font-semibold px-8 py-6 text-lg rounded-lg shadow-xl hover-elevate active-elevate-2"
                data-testid="button-start-chat"
              >
                Start Secure Chat
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-2 border-white/40 text-white hover:bg-white/10 backdrop-blur-sm font-semibold px-8 py-6 text-lg rounded-lg"
                data-testid="button-security-audit"
              >
                View Security Audit
              </Button>
            </div>
            
            <div className="flex items-center gap-6 pt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-sm text-white/80">E2E Encryption Active</span>
              </div>
              <div className="text-sm text-white/60">|</div>
              <div className="text-sm text-white/80">Zero-Knowledge Architecture</div>
            </div>
          </div>
          
          <div className="relative">
            <div className="relative bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-8 shadow-2xl">
              <div className="absolute -top-4 -right-4 bg-accent text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg flex items-center gap-2">
                <Shield className="w-4 h-4" />
                PQC Ready
              </div>
              
              <div className="space-y-6">
                <div className="flex items-center gap-3 text-white">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-mono text-xs text-white/60">Signal Protocol</div>
                    <div className="text-sm font-medium">X3DH + Double Ratchet</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 text-white">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-mono text-xs text-white/60">Sealed Sender</div>
                    <div className="text-sm font-medium">Server-Blind Routing</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 text-white">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                    <Server className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="font-mono text-xs text-white/60">Self-Hosted</div>
                    <div className="text-sm font-medium">Full Control & Privacy</div>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 pt-6 border-t border-white/10">
                <div className="font-mono text-xs text-white/60 mb-2">Sample Encrypted Payload</div>
                <div className="bg-black/20 rounded-lg p-3 font-mono text-xs text-accent break-all">
                  0x7A3F9B2E...8D4C1A6F
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
