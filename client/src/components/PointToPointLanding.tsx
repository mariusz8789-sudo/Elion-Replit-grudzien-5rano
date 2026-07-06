import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, MapPin, DollarSign, Truck, Shield, Clock, Star, ShoppingBag, Leaf, Users, BarChart3, Brain, Award, Box, Share2, TrendingUp, FileText, QrCode } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import logoPath from "@assets/file_0000000037a86243bd21599fc142fdaa_1760057642535.png";

interface PointToPointLandingProps {
  onGetQuote: () => void;
}

export default function PointToPointLanding({ onGetQuote }: PointToPointLandingProps) {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-br from-primary via-primary/95 to-accent overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLW9wYWNpdHk9Ii4xIiBzdHJva2Utd2lkdGg9IjIiLz48L2c+PC9zdmc+')] opacity-10"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-white space-y-6">
              <h1 className="text-5xl lg:text-6xl font-bold font-[Outfit] leading-tight">
                {t('hero.title')}
              </h1>
              
              <p className="text-xl text-white/90 leading-relaxed">
                {t('hero.subtitle')}
              </p>
              
              <div className="flex flex-wrap gap-4">
                <Button 
                  size="lg" 
                  className="bg-accent hover:bg-accent/90 text-white font-semibold px-8 py-6 text-lg rounded-lg shadow-xl"
                  onClick={onGetQuote}
                  data-testid="button-get-quote"
                >
                  {t('hero.getQuote')} <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-2 border-white/40 text-white hover:bg-white/10 backdrop-blur-sm font-semibold px-8 py-6 text-lg rounded-lg"
                  data-testid="button-track-order"
                >
                  {t('hero.trackOrder')}
                </Button>
              </div>
              
              <div className="flex items-center gap-6 pt-4">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  <span className="text-sm text-white/80">4.9/5 {t('hero.rating')}</span>
                </div>
                <div className="text-sm text-white/60">|</div>
                <div className="text-sm text-white/80">10,000+ {t('hero.successfulMoves')}</div>
              </div>
            </div>
            
            <div className="relative">
              <img 
                src={logoPath} 
                alt="Point to Point Moving & Transport" 
                className="w-full h-auto rounded-2xl shadow-2xl"
                data-testid="img-logo"
              />
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4 font-[Outfit]">
              {t('howItWorks.title')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('howItWorks.subtitle')}
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-8 text-center hover-elevate border-card-border">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-primary" />
              </div>
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center mx-auto mb-4 font-bold text-xl">
                1
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {t('howItWorks.step1Title')}
              </h3>
              <p className="text-muted-foreground">
                {t('howItWorks.step1Desc')}
              </p>
            </Card>
            
            <Card className="p-8 text-center hover-elevate border-card-border">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <DollarSign className="w-8 h-8 text-primary" />
              </div>
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center mx-auto mb-4 font-bold text-xl">
                2
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {t('howItWorks.step2Title')}
              </h3>
              <p className="text-muted-foreground">
                {t('howItWorks.step2Desc')}
              </p>
            </Card>
            
            <Card className="p-8 text-center hover-elevate border-card-border">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Truck className="w-8 h-8 text-primary" />
              </div>
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center mx-auto mb-4 font-bold text-xl">
                3
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {t('howItWorks.step3Title')}
              </h3>
              <p className="text-muted-foreground">
                {t('howItWorks.step3Desc')}
              </p>
            </Card>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4 font-[Outfit]">
              {t('features.title')}
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex gap-4">
              <Shield className="w-8 h-8 text-primary flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {t('features.verified')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('features.verifiedDesc')}
                </p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <Clock className="w-8 h-8 text-primary flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {t('features.instant')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('features.instantDesc')}
                </p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <Star className="w-8 h-8 text-primary flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {t('features.support')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('features.supportDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* All 38 Features */}
      <div className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4 font-[Outfit]">
              All 38 Platform Features
            </h2>
            <p className="text-lg text-muted-foreground">
              Complete logistics marketplace with advanced innovations
            </p>
          </div>
          
          <div className="grid md:grid-cols-4 gap-4">
            <Link href="/marketplace">
              <Card className="p-4 hover-elevate cursor-pointer">
                <ShoppingBag className="w-6 h-6 text-primary mb-2" />
                <h3 className="font-semibold text-sm">Marketplace</h3>
              </Card>
            </Link>
            
            <Link href="/eco">
              <Card className="p-4 hover-elevate cursor-pointer">
                <Leaf className="w-6 h-6 text-green-600 mb-2" />
                <h3 className="font-semibold text-sm">CO₂ Tracking</h3>
              </Card>
            </Link>
            
            <Link href="/carpool">
              <Card className="p-4 hover-elevate cursor-pointer">
                <Users className="w-6 h-6 text-blue-600 mb-2" />
                <h3 className="font-semibold text-sm">Carpooling</h3>
              </Card>
            </Link>
            
            <Link href="/analytics">
              <Card className="p-4 hover-elevate cursor-pointer">
                <BarChart3 className="w-6 h-6 text-indigo-600 mb-2" />
                <h3 className="font-semibold text-sm">Analytics</h3>
              </Card>
            </Link>
            
            <Link href="/greenroute">
              <Card className="p-4 hover-elevate cursor-pointer">
                <Brain className="w-6 h-6 text-primary mb-2" />
                <h3 className="font-semibold text-sm">GreenRoute AI</h3>
              </Card>
            </Link>
            
            <Link href="/ecorewards">
              <Card className="p-4 hover-elevate cursor-pointer">
                <Award className="w-6 h-6 text-green-600 mb-2" />
                <h3 className="font-semibold text-sm">EcoRewards</h3>
              </Card>
            </Link>
            
            <Link href="/smartload">
              <Card className="p-4 hover-elevate cursor-pointer">
                <Box className="w-6 h-6 text-blue-600 mb-2" />
                <h3 className="font-semibold text-sm">SmartLoad 3D</h3>
              </Card>
            </Link>
            
            <Link href="/workshare">
              <Card className="p-4 hover-elevate cursor-pointer">
                <Share2 className="w-6 h-6 text-purple-600 mb-2" />
                <h3 className="font-semibold text-sm">WorkShare HUB</h3>
              </Card>
            </Link>
            
            <Link href="/fleetpredict">
              <Card className="p-4 hover-elevate cursor-pointer">
                <TrendingUp className="w-6 h-6 text-indigo-600 mb-2" />
                <h3 className="font-semibold text-sm">FleetPredictor</h3>
              </Card>
            </Link>
            
            <Link href="/insurance">
              <Card className="p-4 hover-elevate cursor-pointer">
                <Shield className="w-6 h-6 text-blue-600 mb-2" />
                <h3 className="font-semibold text-sm">Insurance</h3>
              </Card>
            </Link>
            
            <Link href="/carbon-ledger">
              <Card className="p-4 hover-elevate cursor-pointer">
                <FileText className="w-6 h-6 text-green-600 mb-2" />
                <h3 className="font-semibold text-sm">Carbon Ledger</h3>
              </Card>
            </Link>
            
            <Link href="/qr-dispatch">
              <Card className="p-4 hover-elevate cursor-pointer">
                <QrCode className="w-6 h-6 text-orange-600 mb-2" />
                <h3 className="font-semibold text-sm">QR Dispatch</h3>
              </Card>
            </Link>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-20 bg-gradient-to-r from-primary to-accent">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-4xl font-bold text-white mb-4 font-[Outfit]">
            Ready to Move?
          </h2>
          <p className="text-xl text-white/90 mb-8">
            Get your free quote in seconds and book your move today
          </p>
          <Button 
            size="lg" 
            className="bg-white text-primary hover:bg-white/90 font-semibold px-8 py-6 text-lg rounded-lg shadow-xl"
            onClick={onGetQuote}
            data-testid="button-cta-quote"
          >
            Get Your Free Quote <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
