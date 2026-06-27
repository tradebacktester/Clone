import { useEffect, useState } from "react";

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 900);
    const t2 = setTimeout(() => setPhase("out"), 2200);
    const t3 = setTimeout(() => onComplete(), 2850);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <>
      <style>{`
        @keyframes krytos-logo-in {
          0%   { opacity: 0; transform: scale(0.55) translateY(12px); filter: brightness(0.3); }
          60%  { opacity: 1; transform: scale(1.04) translateY(-3px); filter: brightness(1.2); }
          100% { opacity: 1; transform: scale(1) translateY(0);      filter: brightness(1); }
        }
        @keyframes krytos-text-in {
          0%   { opacity: 0; transform: translateY(18px) scaleX(0.85); letter-spacing: 0.25em; }
          100% { opacity: 1; transform: translateY(0)    scaleX(1);    letter-spacing: 0.45em; }
        }
        @keyframes krytos-line-in {
          0%   { width: 0; opacity: 0; }
          100% { width: 120px; opacity: 1; }
        }
        @keyframes krytos-glow-pulse {
          0%, 100% { box-shadow: 0 0 0px 0px rgba(220,38,38,0); }
          50%       { box-shadow: 0 0 60px 20px rgba(220,38,38,0.18); }
        }
        @keyframes krytos-fade-out {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        .krytos-logo-animate {
          animation: krytos-logo-in 0.9s cubic-bezier(0.22,1,0.36,1) forwards,
                     krytos-glow-pulse 2s ease-in-out 0.9s infinite;
        }
        .krytos-text-animate {
          animation: krytos-text-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.7s both;
        }
        .krytos-line-animate {
          animation: krytos-line-in 0.5s ease-out 0.6s both;
        }
        .krytos-splash-fadeout {
          animation: krytos-fade-out 0.65s ease-in forwards;
        }
        .krytos-tagline-animate {
          animation: krytos-text-in 0.5s cubic-bezier(0.22,1,0.36,1) 1s both;
        }
      `}</style>

      <div
        className={phase === "out" ? "krytos-splash-fadeout" : ""}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "#000000",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
        }}
      >
        {/* Logo image */}
        <div
          className="krytos-logo-animate"
          style={{
            width: 180,
            height: 180,
            borderRadius: 24,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <img
            src="/krytos-logo.png"
            alt="Krytos"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            draggable={false}
          />
        </div>

        {/* Divider line */}
        <div
          className="krytos-line-animate"
          style={{
            height: 1,
            background: "linear-gradient(90deg, transparent, #dc2626, transparent)",
            marginTop: 28,
            marginBottom: 18,
            display: "block",
          }}
        />

        {/* Word mark */}
        <div
          className="krytos-text-animate"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 700,
            fontSize: 28,
            color: "#ffffff",
            letterSpacing: "0.45em",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          KRY<span style={{ color: "#dc2626" }}>T</span>OS
        </div>

        {/* Tagline */}
        <div
          className="krytos-tagline-animate"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 400,
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            marginTop: 10,
          }}
        >
          Algorithmic Trading Platform
        </div>
      </div>
    </>
  );
}
