import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "./lib/auth";
import PointToPointLanding from "@/components/PointToPointLanding";
import BookingFlow from "@/components/BookingFlow";
import TrackingPage from "@/components/TrackingPage";
import CustomerDashboard from "@/components/CustomerDashboard";
import AdminPanel from "@/components/AdminPanel";
import AuthPage from "@/pages/AuthPage";
import BookingDetailPage from "@/pages/BookingDetailPage";
import MarketplacePage from "@/pages/MarketplacePage";
import EcoPage from "@/pages/EcoPage";
import CarpoolPage from "@/pages/CarpoolPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import GreenRouteAI from "@/pages/GreenRouteAI";
import EcoRewardPage from "@/pages/EcoRewardPage";
import SmartLoad3D from "@/pages/SmartLoad3D";
import WorkShareHub from "@/pages/WorkShareHub";
import FleetPredictor from "@/pages/FleetPredictor";
import InsurancePage from "@/pages/InsurancePage";
import CarbonLedger from "@/pages/CarbonLedger";
import QRDispatch from "@/pages/QRDispatch";
import Plans from "@/pages/Plans";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSelector from "@/components/LanguageSelector";
import logoPath from "@assets/file_0000000037a86243bd21599fc142fdaa_1760057642535.png";

function LandingPage() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  
  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <img src={logoPath} alt="Point to Point" className="h-12 w-auto" />
            </div>
            <div className="flex items-center gap-3">
              <LanguageSelector />
              <ThemeToggle />
              {user ? (
                <>
                  <Button 
                    variant="outline" 
                    onClick={() => setLocation("/bookings")}
                    data-testid="button-view-bookings"
                  >
                    {t('nav.myBookings')}
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => logout()}
                    data-testid="button-logout"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <Button 
                  onClick={() => setLocation("/auth")}
                  data-testid="button-login"
                >
                  {t('nav.signIn')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </nav>
      
      <PointToPointLanding onGetQuote={() => setLocation("/book")} />
    </div>
  );
}

function BookPage() {
  const [, setLocation] = useLocation();
  
  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button 
              onClick={() => setLocation("/")}
              className="flex items-center hover-elevate px-2 py-1 rounded"
            >
              <img src={logoPath} alt="Point to Point" className="h-12 w-auto" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </nav>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <BookingFlow />
      </div>
    </div>
  );
}

function BookingsPage() {
  const [, setLocation] = useLocation();
  
  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button 
              onClick={() => setLocation("/")}
              className="flex items-center hover-elevate px-2 py-1 rounded"
            >
              <img src={logoPath} alt="Point to Point" className="h-12 w-auto" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </nav>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <CustomerDashboard />
      </div>
    </div>
  );
}

function TrackPage() {
  const [, setLocation] = useLocation();
  
  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button 
              onClick={() => setLocation("/")}
              className="flex items-center hover-elevate px-2 py-1 rounded"
            >
              <img src={logoPath} alt="Point to Point" className="h-12 w-auto" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </nav>
      
      <TrackingPage />
    </div>
  );
}

function AdminPage() {
  const [, setLocation] = useLocation();
  
  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button 
              onClick={() => setLocation("/")}
              className="flex items-center hover-elevate px-2 py-1 rounded"
            >
              <img src={logoPath} alt="Point to Point" className="h-12 w-auto" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </nav>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <AdminPanel />
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/book" component={BookPage} />
      <Route path="/track/:id" component={TrackPage} />
      <Route path="/bookings/:bookingId" component={BookingDetailPage} />
      <Route path="/bookings" component={BookingsPage} />
      <Route path="/marketplace" component={MarketplacePage} />
      <Route path="/eco" component={EcoPage} />
      <Route path="/carpool" component={CarpoolPage} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route path="/admin" component={AdminPage} />
      
      {/* New features - 31-38 */}
      <Route path="/greenroute" component={GreenRouteAI} />
      <Route path="/ecorewards" component={EcoRewardPage} />
      <Route path="/smartload" component={SmartLoad3D} />
      <Route path="/workshare" component={WorkShareHub} />
      <Route path="/fleetpredict" component={FleetPredictor} />
      <Route path="/insurance" component={InsurancePage} />
      <Route path="/carbon-ledger" component={CarbonLedger} />
      <Route path="/qr-dispatch" component={QRDispatch} />
      <Route path="/plans" component={Plans} />

      <Route component={LandingPage} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
