import { Shield, Send, Lock, Zap, Database, Code } from "lucide-react";
import { Card } from "@/components/ui/card";

const features = [
  {
    icon: Shield,
    title: "End-to-End Encryption",
    description: "Signal Protocol with X3DH key exchange ensures your messages are always encrypted."
  },
  {
    icon: Send,
    title: "Sealed Sender",
    description: "Server doesn't know who sent the message—only the encrypted routing tag."
  },
  {
    icon: Lock,
    title: "Zero-Knowledge",
    description: "We never see your plaintext. Not your messages, not your files, not your metadata."
  },
  {
    icon: Zap,
    title: "Post-Quantum Ready",
    description: "Hybrid encryption with Kyber support for future-proof security."
  },
  {
    icon: Database,
    title: "Self-Hosted",
    description: "Deploy on your infrastructure. Full control over your data and privacy."
  },
  {
    icon: Code,
    title: "Open Source",
    description: "Auditable code, transparent security. Trust through verification."
  }
];

export default function FeaturesGrid() {
  return (
    <div className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-foreground mb-4 font-[Outfit]">
            Built for Security Professionals
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Enterprise-grade security features designed for those who can't compromise on privacy
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card 
              key={index}
              className="p-6 hover-elevate transition-all duration-200 border-card-border"
              data-testid={`card-feature-${index}`}
            >
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
