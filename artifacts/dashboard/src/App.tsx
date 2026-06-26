import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Trades from "@/pages/trades";
import Analytics from "@/pages/analytics";
import Market from "@/pages/market";
import Regime from "@/pages/regime";
import MonteCarlo from "@/pages/montecarlo";
import Learning from "@/pages/learning";
import Backtest from "@/pages/backtest";
import Settings from "@/pages/settings";
import Quality from "@/pages/quality";
import Memory from "@/pages/memory";
import Supervisor from "@/pages/supervisor";
import Insights from "@/pages/insights";
import Reports from "@/pages/reports";
import TimePerformance from "@/pages/time-performance";
import Replay from "@/pages/replay";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    }
  }
});

function Router() {
  return (
    <Layout>
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
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
