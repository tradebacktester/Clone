import { useState, useMemo } from "react";
import { X, Search, ChevronDown, ChevronRight, Zap, BarChart3, BookOpen, Settings, Shield, Brain, FlaskConical, TrendingUp, Activity, Globe2, Clock, Dices, Layers, FileText, Radar, ShieldCheck, Rewind, Database, Lightbulb, ShieldAlert, Server, ClipboardCheck, ListOrdered, Scale, History } from "lucide-react";

interface Section {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  items: GuideItem[];
}

interface GuideItem {
  name: string;
  path?: string;
  summary: string;
  buttons?: { label: string; desc: string }[];
  tabs?: { label: string; desc: string }[];
  tips?: string[];
}

const GUIDE_SECTIONS: Section[] = [
  {
    id: "start",
    title: "Getting Started",
    icon: Zap,
    color: "text-yellow-400",
    items: [
      {
        name: "What is Krytos?",
        summary:
          "Krytos is an algorithmic trading bot platform built on Smart Money Concepts (SMC), Supply & Demand zones, and the AMD (Accumulation / Manipulation / Distribution) strategy. It trades EUR/USD, GBP/USD, and USD/JPY during London and New York sessions — all in paper (simulated) mode by default. No real money is ever moved until you explicitly complete the Go-Live Pipeline.",
        tips: [
          "Always start with Paper Trading to validate the bot's performance before going live.",
          "The sidebar groups pages logically — top rows are monitoring & analysis, the Go-Live Pipeline section at the bottom is the path to real trading.",
          "Every trade the bot takes is stored, reviewable, and exportable.",
        ],
      },
      {
        name: "Quick-Start Flow",
        summary:
          "Follow these steps to get up and running in minutes:",
        tips: [
          "1. Go to Settings → configure your risk limits (max daily loss, max drawdown, lot size).",
          "2. Go to Paper Trading → click START to begin the simulation.",
          "3. Watch signals appear in the Signal Log tab as the market analysis runs every 10 minutes.",
          "4. Review trades using the 'Review' button on each row in the Trade Log tab.",
          "5. Check Analytics and Dashboard for overall performance.",
          "6. When satisfied, follow the Go-Live Pipeline (Production Readiness → Live Readiness → Pilot Mode → Live).",
        ],
      },
    ],
  },
  {
    id: "core",
    title: "Core Pages",
    icon: Activity,
    color: "text-primary",
    items: [
      {
        name: "Dashboard",
        path: "/",
        summary:
          "The main overview page. Shows live bot status, open paper positions, active signals, recent trades, and key performance metrics at a glance.",
        buttons: [
          { label: "Start Bot", desc: "Starts the paper trading engine and the 10-minute market analysis loop." },
          { label: "Stop Bot", desc: "Stops all trading activity. Open positions remain tracked but no new trades are entered." },
          { label: "Pause Bot", desc: "Pauses new trade entries while keeping the analysis loop running." },
          { label: "Resume", desc: "Resumes trade entries after a pause." },
        ],
        tips: [
          "The status badge (OFFLINE / RUNNING / PAUSED) in the top bar reflects the true bot state from the database.",
          "Metric cards auto-refresh every 30 seconds.",
        ],
      },
      {
        name: "Paper Trading Workspace",
        path: "/paper-trading",
        summary:
          "The most important page. A dedicated workspace for the full paper trading experience: real-time signal monitoring, complete trade storage, and trader review tools. All trades here are 100% simulated — no real money is ever at risk.",
        buttons: [
          { label: "START", desc: "Activates the bot in paper mode. Signals are generated from live market analysis." },
          { label: "PAUSE", desc: "Halts new entries but keeps positions monitored." },
          { label: "RESUME", desc: "Re-enables new trade entries." },
          { label: "Refresh", desc: "Manually refreshes all stats, positions, and logs." },
          { label: "CSV", desc: "Downloads the full trade log as a CSV file for spreadsheet analysis." },
          { label: "JSON", desc: "Downloads the full trade log as JSON for programmatic use." },
          { label: "Review", desc: "Opens the Trader Review modal for any trade in the log. You can agree or disagree with the bot's decision, add a reason, confidence score, and notes." },
        ],
        tabs: [
          { label: "Live Positions", desc: "Shows every currently open paper trade with entry price, current distance to Stop Loss and Take Profit, and unrealized P&L." },
          { label: "Trade Log", desc: "Full history of all closed paper trades. Filter by status (win/loss) or review state (reviewed/unreviewed). Click any row to expand and see full detail: entry/exit, spread, slippage, news status, session, AMD phase, supply/demand zone, and rule evaluation." },
          { label: "Signal Log", desc: "Every signal generated by the bot is logged here — even signals that were skipped. Shows the skip reason (e.g. 'max open trades reached', 'high-impact news', 'confidence too low') so you understand exactly why the bot did or didn't trade." },
          { label: "Analytics", desc: "Equity curve chart, per-trade P&L bar chart, and a performance summary table." },
        ],
        tips: [
          "The header row shows 8 key stats: Total Trades, Win Rate, Profit Factor, Agreement Rate, Bot Mistakes, My Mistakes, Daily P&L, and Weekly P&L.",
          "Agreement Rate = % of reviewed trades where you agreed with the bot. Below 70% is a warning sign.",
          "Bot Mistakes = trades you disagreed with. My Mistakes = trades where you disagreed but the bot was actually correct.",
          "'REAL TRADES BLOCKED' badge confirms paper mode is active at all times.",
        ],
      },
      {
        name: "Journal",
        path: "/trades",
        summary:
          "Full trade history across all modes. Filter by pair, session, result, and date range. Each row shows AMD pattern, zone type, R:R ratio, P&L, and entry/exit prices.",
        buttons: [
          { label: "Filter controls", desc: "Narrow down trades by pair (EUR/USD, GBP/USD, USD/JPY), session (London/New York), result (win/loss/open), and date range." },
          { label: "Export", desc: "Export filtered results to CSV." },
        ],
        tips: [
          "Use the Journal to spot which pairs and sessions are most profitable.",
          "The AMD column tells you which phase of the Smart Money cycle the trade was entered in.",
        ],
      },
      {
        name: "Analytics",
        path: "/analytics",
        summary:
          "Deep performance analytics: equity curve, monthly P&L breakdown, max drawdown chart, win rate by pair and session, and profit factor over time.",
        tabs: [
          { label: "Equity Curve", desc: "Running account balance over time. A healthy curve should trend upward with controlled drawdowns." },
          { label: "Monthly P&L", desc: "Bar chart of monthly returns. Identifies which months are consistently profitable." },
          { label: "Drawdown", desc: "Peak-to-trough loss chart. Helps set realistic max-drawdown limits in Settings." },
          { label: "Win Rate Breakdown", desc: "Win rate split by pair, session, and supply/demand zone type." },
        ],
      },
      {
        name: "Settings",
        path: "/settings",
        summary:
          "Configure the bot's core behaviour, risk management rules, and broker account connections.",
        tabs: [
          { label: "Bot Config", desc: "Set the trading pairs, sessions, max open trades, minimum signal confidence threshold, and lot size." },
          { label: "Risk Management", desc: "Set daily loss limit (%), weekly loss limit (%), max drawdown (%), and per-trade stop-loss pips." },
          { label: "Broker Accounts", desc: "Add OANDA, MT5, or TradeLocker API keys. Keys are stored encrypted in the database — never in environment variables." },
        ],
        tips: [
          "Start with conservative risk settings: 1% daily loss limit, 3% weekly, 10% max drawdown.",
          "Broker keys are only needed when transitioning from paper to live trading.",
        ],
      },
    ],
  },
  {
    id: "market",
    title: "Market Intelligence",
    icon: Globe2,
    color: "text-cyan-400",
    items: [
      {
        name: "Market",
        path: "/market",
        summary:
          "Displays the current supply and demand zones detected for each pair across all timeframes (15m, 1h, 4h, 1d), the active market regime, and any live signals.",
        tips: [
          "Zones are colour-coded: green = demand (buy) zones, red = supply (sell) zones.",
          "Zones are recalculated every 10 minutes when the analysis scheduler runs.",
          "A signal is only generated when price reaches a high-quality zone on the correct AMD phase.",
        ],
      },
      {
        name: "Regimes",
        path: "/regime",
        summary:
          "Shows the current detected market regime for each pair and timeframe. Krytos identifies 4 regimes: Trending, Ranging, Volatile, and Low Volatility. Trading rules adapt based on regime.",
        tips: [
          "In 'Volatile' regime, the bot may reduce position sizes or skip entries entirely.",
          "In 'Low Volatility', expect fewer signals — the AMD cycle is not fully formed.",
          "Confidence % shows how strongly the algorithm classifies the current regime.",
        ],
      },
      {
        name: "Monte Carlo",
        path: "/monte-carlo",
        summary:
          "Runs 10,000 simulated equity curve paths using your actual trade history as the input. Calculates worst-case drawdown, Value at Risk (VaR), Sharpe Ratio, and expected return distribution.",
        buttons: [
          { label: "Run Simulation", desc: "Executes 10,000 Monte Carlo paths in ~70ms and renders the results." },
        ],
        tips: [
          "If the 5th-percentile outcome (worst 5% of scenarios) still shows a positive balance, your strategy is considered robust.",
          "Use this before increasing lot sizes to understand downside risk.",
        ],
      },
      {
        name: "V2 Insights",
        path: "/insights",
        summary:
          "Advanced multi-timeframe analysis view. Aggregates signals across 15m, 1h, 4h, and 1d to compute a Trade Quality Index (TQI) and correlation scores between pairs.",
        tips: [
          "TQI above 70 means multiple timeframes agree — high confidence trade setup.",
          "Correlation scores help avoid taking simultaneous trades on strongly correlated pairs (e.g. EUR/USD and GBP/USD).",
        ],
      },
      {
        name: "Time Performance",
        path: "/time-performance",
        summary:
          "Heatmap and chart showing P&L by hour of the day and day of the week. Identifies the most and least profitable trading times.",
        tips: [
          "London session (07:00–12:00 UTC) typically shows the most active price action.",
          "Avoid entries in the last hour of the New York session — low liquidity increases slippage.",
        ],
      },
    ],
  },
  {
    id: "bot",
    title: "Bot Management",
    icon: Brain,
    color: "text-purple-400",
    items: [
      {
        name: "Learning",
        path: "/learning",
        summary:
          "Tracks the Reinforcement Learning (RL) agent that continuously learns from completed trades. Shows episode count, exploration rate (epsilon), cumulative reward, and setup quality scores by pattern.",
        tips: [
          "Epsilon decreases over time as the agent moves from exploration to exploitation.",
          "Higher cumulative reward = the RL agent is improving its entry decisions.",
          "Setup quality scores show which AMD patterns (e.g. 'Manipulation Wick + Demand Zone') perform best.",
        ],
      },
      {
        name: "Memory",
        path: "/memory",
        summary:
          "The Trade Memory Engine clusters past trades by market condition fingerprint and uses them to adjust future signal confidence. Shows cluster stats and top-ranking setups.",
        tips: [
          "Clusters with high 'cluster confidence' mean the bot has seen this type of setup many times and knows how it typically plays out.",
          "Memory improves accuracy over time — the more paper trades logged, the better.",
        ],
      },
      {
        name: "Quality",
        path: "/quality",
        summary:
          "Setup quality scoring dashboard. Rates each detected signal on a 0–100 scale using 8 criteria: zone freshness, HTF confluence, AMD phase alignment, spread, session, news status, risk-reward, and regime fit.",
        tips: [
          "Only signals scoring above the threshold set in Settings will be executed.",
          "Adjust the threshold in Settings → Bot Config to increase or decrease trade frequency.",
        ],
      },
      {
        name: "Supervisor",
        path: "/supervisor",
        summary:
          "The autonomous health monitor. Runs every 60 seconds and checks: daily/weekly loss limits, drawdown limits, win rate, profit factor, price feed health, and analysis feed freshness. Triggers automatic bot pause if any limit is breached.",
        tips: [
          "If the Supervisor shows a 'critical' status, check which check failed — it will tell you exactly why.",
          "Price Feed 'critical' means no live price data is coming in. Check your network or broker connection.",
          "'Analysis Feed warning' means the last market analysis ran more than 20 minutes ago.",
        ],
      },
      {
        name: "Reports",
        path: "/reports",
        summary:
          "Auto-generated strategy performance reports covering a selected date range. Includes trade summary, regime breakdown, session performance, and zone type analysis.",
        buttons: [
          { label: "Generate Report", desc: "Runs the full report computation for the selected date range and renders a printable summary." },
        ],
      },
    ],
  },
  {
    id: "backtest",
    title: "Backtesting & Validation",
    icon: History,
    color: "text-orange-400",
    items: [
      {
        name: "Backtest",
        path: "/backtest",
        summary:
          "Run historical simulations of the AMD/SMC strategy on past market data. Configure the pair, date range, and starting balance, then view results: total trades, win rate, profit factor, and equity curve.",
        buttons: [
          { label: "Run Backtest", desc: "Starts a server-side backtest simulation. Results are stored in the database and appear in the results list below." },
          { label: "View Result", desc: "Loads a previous backtest result from the database." },
        ],
        tips: [
          "Backtest results use simulated synthetic price data by default. Connect a real historical data provider for higher accuracy.",
          "Compare multiple backtest runs (different pairs or date ranges) to identify the best performing configuration.",
        ],
      },
      {
        name: "Replay",
        path: "/replay",
        summary:
          "Step-by-step strategy replay viewer. Re-runs the full signal detection algorithm on a past time window and lets you step forward candle by candle to see exactly what the bot 'saw' and why it did or didn't trade.",
        buttons: [
          { label: "Load Replay", desc: "Fetches the candle sequence for the selected pair and time window." },
          { label: "Step Forward", desc: "Advances one candle at a time." },
          { label: "Play", desc: "Auto-advances through candles at 1-second intervals." },
          { label: "Detect Bias", desc: "Runs the bias detection algorithm on the replay session to check for look-ahead or data leakage." },
        ],
      },
      {
        name: "Historical",
        path: "/historical",
        summary:
          "Configure and test external historical data providers. Supports pluggable providers for backtesting. Shows provider status, last sync time, and data coverage.",
      },
      {
        name: "Robustness",
        path: "/robustness",
        summary:
          "Stress-tests the strategy across 7 adversarial conditions: slippage spikes, spread widening, news events, low-liquidity sessions, high volatility, correlated losses, and execution delays. Produces a robustness score.",
        buttons: [
          { label: "Run Stress Test", desc: "Executes all 7 stress engines and generates a robustness report." },
        ],
        tips: [
          "A robustness score above 70 means the strategy holds up under realistic adverse conditions.",
          "If 'Execution Stress' is the weakest point, increase your minimum spread filter in Settings.",
        ],
      },
    ],
  },
  {
    id: "golive",
    title: "Go-Live Pipeline",
    icon: Shield,
    color: "text-green-400",
    items: [
      {
        name: "Production Readiness",
        path: "/production-readiness",
        summary:
          "Automated checklist of 8 safety conditions that must all pass before live trading is enabled: broker connectivity, risk limits set, minimum paper trade count, minimum win rate, drawdown within limits, RL agent trained, supervisor healthy, and news filter active.",
        tips: [
          "You must complete at least 100 paper trades before this page will allow you to proceed.",
          "Each check shows its current value vs. the required threshold.",
        ],
      },
      {
        name: "Live Readiness",
        path: "/readiness-checklist",
        summary:
          "Manual checklist page where you confirm human-reviewed items before going live: strategy understanding, risk acknowledgment, broker account funded, and emergency stop plan.",
        tips: [
          "This is a one-time manual confirmation — check each box only when you genuinely understand and agree.",
        ],
      },
      {
        name: "Deployment",
        path: "/deployment",
        summary:
          "Configure deployment settings for running Krytos as a persistent cloud service. Set server region, environment variables, and health check endpoints.",
      },
      {
        name: "Live Journal",
        path: "/live-journal",
        summary:
          "The trade journal for real (live) trades — separate from the paper trading log. Only populated once live trading is enabled and a broker is connected.",
        tips: [
          "All real trades are stored here with full entry/exit detail, screenshots, and rule evaluations — identical to the paper workspace.",
        ],
      },
      {
        name: "Bot vs Manual",
        path: "/comparison",
        summary:
          "Side-by-side comparison of bot performance vs. your manually reviewed decisions. Shows where the bot outperformed your judgment and vice versa.",
        tips: [
          "This page is powered by the Review data from the Paper Trading Workspace — the more you review, the richer this comparison becomes.",
        ],
      },
      {
        name: "Thresholds",
        path: "/threshold",
        summary:
          "Optimisation tool for the signal confidence threshold. Sweeps the threshold from 50–95 and shows how win rate, trade count, and profit factor change at each level.",
        buttons: [
          { label: "Optimise", desc: "Runs the threshold sweep using all historical paper trades and plots the results." },
        ],
        tips: [
          "The sweet spot is usually where profit factor peaks — often around 70–80% confidence threshold.",
        ],
      },
      {
        name: "Pilot Mode",
        path: "/pilot",
        summary:
          "An intermediate step between paper and full live trading. Executes real trades but with a dramatically reduced lot size (0.01 lots) to validate broker connectivity and execution quality with minimal real risk.",
        buttons: [
          { label: "Enable Pilot", desc: "Activates pilot mode. Requires all Production Readiness and Live Readiness checks to pass first." },
          { label: "Disable Pilot", desc: "Returns to paper mode." },
        ],
        tips: [
          "Run pilot mode for at least 2 weeks before enabling full live trading.",
        ],
      },
      {
        name: "Improvement",
        path: "/improvement",
        summary:
          "Tracks improvement actions: areas where the bot is underperforming, suggested parameter tweaks, and a log of changes made with before/after performance comparison.",
      },
    ],
  },
  {
    id: "advanced",
    title: "Advanced",
    icon: Lightbulb,
    color: "text-amber-400",
    items: [
      {
        name: "Trader Intelligence",
        path: "/trader-intelligence",
        summary:
          "The Vasu Decision Model — an AI advisory layer that analyses your past review decisions (agrees/disagrees) and the bot's trade outcomes to build a model of your trading psychology. Advisory only: it does not control the bot.",
        tips: [
          "The model identifies your personal bias patterns (e.g. 'You tend to disagree with long EUR/USD trades during London session even when they win').",
          "Score-vector similarity compares your decision pattern to the bot's optimal decision pattern.",
          "Use this to improve your own discretionary trading, not to override the bot.",
        ],
      },
    ],
  },
];

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GuideModal({ isOpen, onClose }: GuideModalProps) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleSection = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return GUIDE_SECTIONS;
    return GUIDE_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.summary.toLowerCase().includes(q) ||
          item.buttons?.some(
            (b) => b.label.toLowerCase().includes(q) || b.desc.toLowerCase().includes(q)
          ) ||
          item.tabs?.some(
            (t) => t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)
          ) ||
          item.tips?.some((t) => t.toLowerCase().includes(q))
      ),
    })).filter((s) => s.items.length > 0);
  }, [search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-sidebar flex-shrink-0">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-bold text-base tracking-tight uppercase">Krytos — Complete Guide</h2>
              <p className="text-xs text-muted-foreground">Every page, tab, and button explained</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-sidebar-accent transition-colors"
            aria-label="Close guide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-border flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search pages, buttons, tabs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-md bg-sidebar border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-10">No results for "{search}"</p>
          )}
          {filtered.map((section) => {
            const Icon = section.icon;
            const isOpen = expanded[section.id] !== false;
            return (
              <div key={section.id} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-sidebar hover:bg-sidebar-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${section.color}`} />
                    <span className="font-semibold text-sm uppercase tracking-wide">{section.title}</span>
                    <span className="text-xs text-muted-foreground">({section.items.length} pages)</span>
                  </div>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </button>

                {isOpen && (
                  <div className="divide-y divide-border">
                    {section.items.map((item) => (
                      <div key={item.name} className="px-4 py-4 space-y-3">
                        {/* Page header */}
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{item.name}</span>
                              {item.path && (
                                <code className="text-[10px] bg-sidebar px-1.5 py-0.5 rounded font-mono text-muted-foreground border border-border">
                                  {item.path}
                                </code>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{item.summary}</p>
                          </div>
                        </div>

                        {/* Buttons */}
                        {item.buttons && item.buttons.length > 0 && (
                          <div>
                            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1.5">Buttons & Controls</p>
                            <div className="space-y-1.5">
                              {item.buttons.map((b) => (
                                <div key={b.label} className="flex items-start gap-2">
                                  <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 whitespace-nowrap">
                                    {b.label}
                                  </span>
                                  <span className="text-xs text-muted-foreground leading-snug">{b.desc}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Tabs */}
                        {item.tabs && item.tabs.length > 0 && (
                          <div>
                            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1.5">Tabs</p>
                            <div className="space-y-1.5">
                              {item.tabs.map((t) => (
                                <div key={t.label} className="flex items-start gap-2">
                                  <span className="text-xs font-medium text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/20 whitespace-nowrap">
                                    {t.label}
                                  </span>
                                  <span className="text-xs text-muted-foreground leading-snug">{t.desc}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Tips */}
                        {item.tips && item.tips.length > 0 && (
                          <div className="rounded-md bg-yellow-400/5 border border-yellow-400/15 px-3 py-2 space-y-1">
                            {item.tips.map((tip, i) => (
                              <p key={i} className="text-xs text-yellow-300/80 leading-relaxed">
                                <span className="text-yellow-400 mr-1">✦</span>{tip}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-3 border-t border-border bg-sidebar flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Krytos — Smart Money Algorithmic Trading Platform
          </p>
          <button
            onClick={onClose}
            className="text-xs px-4 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
