import { useEffect, useState } from "react";

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");
  const [typedText, setTypedText] = useState("");
  const fullText = "NEURAL TRADING ENGINE v2.0";

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 600);
    const t2 = setTimeout(() => setPhase("out"), 1800);
    const t3 = setTimeout(() => onComplete(), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i <= fullText.length) {
        setTypedText(fullText.slice(0, i));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 55);
    return () => clearInterval(interval);
  }, []);

  const nodes = [
    { x: "15%", y: "20%", delay: "0s" },
    { x: "80%", y: "15%", delay: "0.3s" },
    { x: "10%", y: "75%", delay: "0.6s" },
    { x: "85%", y: "70%", delay: "0.9s" },
    { x: "50%", y: "10%", delay: "0.15s" },
    { x: "50%", y: "88%", delay: "0.75s" },
    { x: "25%", y: "50%", delay: "0.45s" },
    { x: "75%", y: "48%", delay: "0.6s" },
  ];

  const connections = [
    { x1: "15%", y1: "20%", x2: "50%", y2: "10%" },
    { x1: "50%", y1: "10%", x2: "80%", y2: "15%" },
    { x1: "15%", y1: "20%", x2: "25%", y2: "50%" },
    { x1: "80%", y1: "15%", x2: "75%", y2: "48%" },
    { x1: "25%", y1: "50%", x2: "10%", y2: "75%" },
    { x1: "75%", y1: "48%", x2: "85%", y2: "70%" },
    { x1: "10%", y1: "75%", x2: "50%", y2: "88%" },
    { x1: "50%", y1: "88%", x2: "85%", y2: "70%" },
    { x1: "25%", y1: "50%", x2: "75%", y2: "48%" },
  ];

  return (
    <>
      <style>{`
        @keyframes ai-splash-orb {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
        @keyframes ai-splash-logo-in {
          0%   { opacity: 0; transform: scale(0.6) translateY(10px); }
          60%  { opacity: 1; transform: scale(1.05) translateY(-4px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes ai-splash-line-in {
          0% { width: 0; opacity: 0; }
          100% { width: 140px; opacity: 1; }
        }
        @keyframes ai-splash-text-in {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes ai-splash-node-ping {
          0% { transform: scale(1); opacity: 1; }
          70% { transform: scale(2.5); opacity: 0; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes ai-splash-connection-draw {
          0% { stroke-dashoffset: 300; opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 0.25; }
        }
        @keyframes ai-splash-fade-out {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes ai-ring-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes ai-ring-rotate-rev {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        .ai-splash-logo { animation: ai-splash-logo-in 0.9s cubic-bezier(0.22,1,0.36,1) 0.2s both; }
        .ai-splash-line { animation: ai-splash-line-in 0.5s ease-out 0.8s both; }
        .ai-splash-wordmark { animation: ai-splash-text-in 0.5s ease-out 1s both; }
        .ai-splash-tagline { animation: ai-splash-text-in 0.5s ease-out 1.2s both; }
        .ai-splash-fadeout { animation: ai-splash-fade-out 0.7s ease-in forwards; }
        .ai-splash-orb { animation: ai-splash-orb 3s ease-in-out infinite; }
        .ai-splash-conn { animation: ai-splash-connection-draw 1.2s ease-out 0.3s both; stroke-dasharray: 300; }
        .ai-ring-outer { animation: ai-ring-rotate 8s linear infinite; }
        .ai-ring-inner { animation: ai-ring-rotate-rev 5s linear infinite; }
      `}</style>

      <div
        className={phase === "out" ? "ai-splash-fadeout" : ""}
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "hsl(240 15% 3%)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* Neural network background */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.4 }}>
          {connections.map((c, i) => (
            <line
              key={i}
              className="ai-splash-conn"
              x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
              stroke="rgb(139,92,246)"
              strokeWidth="1"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
          {nodes.map((n, i) => (
            <g key={i} style={{ transformOrigin: `${n.x} ${n.y}` }}>
              <circle cx={n.x} cy={n.y} r="3" fill="rgb(139,92,246)" opacity="0.8" />
              <circle
                cx={n.x} cy={n.y} r="3" fill="rgb(139,92,246)"
                style={{ animation: `ai-splash-node-ping 2.5s ease-out ${n.delay} infinite` }}
              />
            </g>
          ))}
        </svg>

        {/* Ambient orbs */}
        <div className="ai-splash-orb" style={{
          position: "absolute", top: "-150px", left: "-150px",
          width: "500px", height: "500px",
          background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
        }} />
        <div className="ai-splash-orb" style={{
          position: "absolute", bottom: "-150px", right: "-150px",
          width: "450px", height: "450px",
          background: "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)",
          animationDelay: "1.5s",
        }} />

        {/* Grid */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.3,
          backgroundImage: "linear-gradient(rgba(139,92,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        {/* Main content */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
          {/* Rotating rings around logo */}
          <div style={{ position: "relative", width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="ai-ring-outer" style={{
              position: "absolute", inset: -24,
              border: "1px solid rgba(139,92,246,0.25)",
              borderRadius: "50%",
              borderTopColor: "rgba(139,92,246,0.7)",
              borderRightColor: "transparent",
            }} />
            <div className="ai-ring-inner" style={{
              position: "absolute", inset: -10,
              border: "1px solid rgba(139,92,246,0.15)",
              borderRadius: "50%",
              borderBottomColor: "rgba(139,92,246,0.5)",
              borderLeftColor: "transparent",
            }} />

            {/* Logo */}
            <div className="ai-splash-logo" style={{
              width: 160, height: 160,
              borderRadius: 20,
              overflow: "hidden",
              boxShadow: "0 0 40px rgba(139,92,246,0.4), 0 0 80px rgba(139,92,246,0.15)",
              border: "1px solid rgba(139,92,246,0.3)",
            }}>
              <img
                src="/krytos-logo.png"
                alt="Krytos"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                draggable={false}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="ai-splash-line" style={{
            height: 1, marginTop: 32, marginBottom: 20,
            background: "linear-gradient(90deg, transparent, rgb(139,92,246), transparent)",
          }} />

          {/* Word mark */}
          <div className="ai-splash-wordmark" style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 800, fontSize: 32,
            color: "#ffffff",
            letterSpacing: "0.45em",
            textTransform: "uppercase",
            textAlign: "center",
            textShadow: "0 0 30px rgba(139,92,246,0.6)",
          }}>
            KRY<span style={{ color: "hsl(262 80% 65%)" }}>T</span>OS
          </div>

          {/* Typed tagline */}
          <div className="ai-splash-tagline" style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 400, fontSize: 10,
            color: "rgba(139,92,246,0.7)",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            marginTop: 10, minHeight: 18, textAlign: "center",
          }}>
            {typedText}<span style={{ animation: "ai-cursor-blink 0.9s step-end infinite", color: "hsl(262 80% 65%)" }}>▋</span>
          </div>
        </div>

        {/* Bottom loading bar */}
        <div style={{
          position: "absolute", bottom: 48, left: "50%", transform: "translateX(-50%)",
          width: 200, height: 2,
          background: "rgba(139,92,246,0.15)",
          borderRadius: 4, overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            background: "linear-gradient(90deg, hsl(262 80% 55%), hsl(220 80% 65%))",
            borderRadius: 4,
            animation: "ai-progress-boot 2.5s ease-out 0.3s both",
            width: 0,
          }} />
        </div>

        <style>{`
          @keyframes ai-cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
          @keyframes ai-progress-boot { 0% { width: 0; } 100% { width: 100%; } }
        `}</style>
      </div>
    </>
  );
}
