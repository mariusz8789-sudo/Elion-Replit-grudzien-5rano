import { lazy, Suspense } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "./lib/auth";
import { CallProvider } from "./lib/CallProvider";
import PointToPointLanding from "@/components/PointToPointLanding";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSelector from "@/components/LanguageSelector";
import NotificationBell from "@/components/NotificationBell";
import logoPath from "@assets/file_0000000037a86243bd21599fc142fdaa_1760057642535.png";

// Route-level code splitting: each page (and the heavy libraries it pulls in —
// mapbox-gl, recharts, stripe-js, etc.) loads on demand instead of shipping in
// the initial bundle.
const BookingFlow = lazy(() => import("@/components/BookingFlow"));
const TrackingPage = lazy(() => import("@/components/TrackingPage"));
const CustomerDashboard = lazy(() => import("@/components/CustomerDashboard"));
const CompanyDashboard = lazy(() => import("@/components/CompanyDashboard"));
const AdminPanel = lazy(() => import("@/components/AdminPanel"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const BookingDetailPage = lazy(() => import("@/pages/BookingDetailPage"));
const MarketplacePage = lazy(() => import("@/pages/MarketplacePage"));
const EcoPage = lazy(() => import("@/pages/EcoPage"));
const CarpoolPage = lazy(() => import("@/pages/CarpoolPage"));
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const GreenRouteAI = lazy(() => import("@/pages/GreenRouteAI"));
const EcoRewardPage = lazy(() => import("@/pages/EcoRewardPage"));
const SmartLoad3D = lazy(() => import("@/pages/SmartLoad3D"));
const WorkShareHub = lazy(() => import("@/pages/WorkShareHub"));
const FleetPredictor = lazy(() => import("@/pages/FleetPredictor"));
const InsurancePage = lazy(() => import("@/pages/InsurancePage"));
const CarbonLedger = lazy(() => import("@/pages/CarbonLedger"));
const QRDispatch = lazy(() => import("@/pages/QRDispatch"));
const Plans = lazy(() => import("@/pages/Plans"));
const Leaderboard = lazy(() => import("@/pages/Leaderboard"));
const DriverCalendar = lazy(() => import("@/pages/DriverCalendar"));
const RoadServices = lazy(() => import("@/pages/RoadServices"));

function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}

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
                    variant="outline"
                    onClick={() => setLocation("/company")}
                    data-testid="button-company-dashboard"
                  >
                    {t('nav.company', 'Company')}
                  </Button>
                  <NotificationBell />
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

function CompanyPage() {
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
        <CompanyDashboard />
      </div>
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
    <Suspense fallback={<RouteLoadingFallback />}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/book" component={BookPage} />
        <Route path="/track/:id" component={TrackPage} />
        <Route path="/bookings/:bookingId" component={BookingDetailPage} />
        <Route path="/bookings" component={BookingsPage} />
        <Route path="/company" component={CompanyPage} />
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
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/drivers/:driverId/calendar" component={DriverCalendar} />
        <Route path="/road-services" component={RoadServices} />

        <Route component={LandingPage} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CallProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </CallProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
