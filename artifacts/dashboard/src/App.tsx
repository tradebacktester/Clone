import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { SplashScreen } from "@/components/splash-screen";
import { lazy, Suspense, useState, useCallback } from "react";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const Trades = lazy(() => import("@/pages/trades"));
const Analytics = lazy(() => import("@/pages/analytics"));
const Market = lazy(() => import("@/pages/market"));
const Regime = lazy(() => import("@/pages/regime"));
const MonteCarlo = lazy(() => import("@/pages/montecarlo"));
const Learning = lazy(() => import("@/pages/learning"));
const Backtest = lazy(() => import("@/pages/backtest"));
const Settings = lazy(() => import("@/pages/settings"));
const Quality = lazy(() => import("@/pages/quality"));
const Memory = lazy(() => import("@/pages/memory"));
const Supervisor = lazy(() => import("@/pages/supervisor"));
const Insights = lazy(() => import("@/pages/insights"));
const Reports = lazy(() => import("@/pages/reports"));
const TimePerformance = lazy(() => import("@/pages/time-performance"));
const Replay = lazy(() => import("@/pages/replay"));
const Historical = lazy(() => import("@/pages/historical"));
const ProductionReadiness = lazy(() => import("@/pages/production-readiness"));
const DeploymentManager = lazy(() => import("@/pages/deployment"));
const LiveJournal = lazy(() => import("@/pages/live-journal"));
const ReadinessChecklist = lazy(() => import("@/pages/readiness-checklist"));
const Robustness = lazy(() => import("@/pages/robustness"));
const TraderIntelligence = lazy(() => import("@/pages/trader-intelligence"));
const PaperTrading = lazy(() => import("@/pages/paper-trading"));
const Comparison = lazy(() => import("@/pages/comparison"));
const ThresholdOptimization = lazy(() => import("@/pages/threshold"));
const PilotMode = lazy(() => import("@/pages/pilot"));
const ImprovementDashboard = lazy(() => import("@/pages/improvement"));
const ContextMemory = lazy(() => import("@/pages/context-memory"));
const MemoryHealth = lazy(() => import("@/pages/memory-health"));
const LearningPatterns = lazy(() => import("@/pages/learning-patterns"));
const FeatureIntelligence = lazy(() => import("@/pages/feature-intelligence"));
const DecisionIntelligence = lazy(() => import("@/pages/decision-intelligence"));
const LearningHealth = lazy(() => import("@/pages/learning-health"));
const LearningEnhancement = lazy(() => import("@/pages/learning-enhancement"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    }
  }
});

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="text-muted-foreground font-mono text-sm animate-pulse">Loading…</div>
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/trades" component={Trades} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/market" component={Market} />
          <Route path="/regime" component={Regime} />
          <Route path="/monte-carlo" component={MonteCarlo} />
          <Route path="/learning" component={Learning} />
          <Route path="/backtest" component={Backtest} />
          <Route path="/quality" component={Quality} />
          <Route path="/memory" component={Memory} />
          <Route path="/supervisor" component={Supervisor} />
          <Route path="/insights" component={Insights} />
          <Route path="/reports" component={Reports} />
          <Route path="/time-performance" component={TimePerformance} />
          <Route path="/replay" component={Replay} />
          <Route path="/historical" component={Historical} />
          <Route path="/production-readiness" component={ProductionReadiness} />
          <Route path="/deployment" component={DeploymentManager} />
          <Route path="/live-journal" component={LiveJournal} />
          <Route path="/readiness-checklist" component={ReadinessChecklist} />
          <Route path="/robustness" component={Robustness} />
          <Route path="/trader-intelligence" component={TraderIntelligence} />
          <Route path="/paper-trading" component={PaperTrading} />
          <Route path="/comparison" component={Comparison} />
          <Route path="/threshold" component={ThresholdOptimization} />
          <Route path="/pilot" component={PilotMode} />
          <Route path="/improvement" component={ImprovementDashboard} />
          <Route path="/context-memory" component={ContextMemory} />
          <Route path="/memory-health" component={MemoryHealth} />
          <Route path="/learning/patterns" component={LearningPatterns} />
          <Route path="/feature-intelligence" component={FeatureIntelligence} />
          <Route path="/decision-intelligence" component={DecisionIntelligence} />
          <Route path="/learning-health" component={LearningHealth} />
          <Route path="/learning-enhancement" component={LearningEnhancement} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Layout>
  );
}

function App() {
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashComplete = useCallback(() => setSplashDone(true), []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {!splashDone && <SplashScreen onComplete={handleSplashComplete} />}
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
