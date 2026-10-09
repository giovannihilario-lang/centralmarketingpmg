import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { drift } from "./motion";

// Borda serrilhada de papel térmico (topo e/ou base)
export const zigzag = (dentes = 14, d = 12, topo = true, base = true) => {
  const pts: string[] = [];
  const n = dentes * 2;
  if (topo) {
    for (let i = 0; i <= n; i++) pts.push(`${(i / n) * 100}% ${i % 2 ? d : 0}px`);
  } else {
    pts.push("0% 0%", "100% 0%");
  }
  if (base) {
    for (let i = n; i >= 0; i--)
      pts.push(`${(i / n) * 100}% ${i % 2 ? `calc(100% - ${d}px)` : "100%"}`);
  } else {
    pts.push("100% 100%", "0% 100%");
  }
  return `polygon(${pts.join(",")})`;
};

// Fundo sólido com elementos gráficos leves que nunca param
// t0 = frame absoluto em que a cena começa (mantém o loop contínuo)
export const Fundo: React.FC<{ cor: string; seed?: number; t0?: number }> = ({
  cor,
  seed = 0,
  t0 = 0,
}) => {
  const frame = useCurrentFrame() + t0;
  return (
    <AbsoluteFill style={{ background: cor, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 70% at 50% 40%, rgba(255,255,255,0.16), rgba(255,255,255,0) 60%)",
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.16) 2.5px, transparent 3px)",
          backgroundSize: "54px 54px",
          backgroundPosition: `${drift(frame, seed, 20)}px ${(frame * 0.54) % 54}px`,
          opacity: 0.55,
        }}
      />
      {/* faixas diagonais gigantes, bem sutis */}
      <div
        style={{
          position: "absolute",
          left: -400,
          top: 300 + drift(frame, seed + 1, 40),
          width: 2000,
          height: 260,
          background: "rgba(255,255,255,0.05)",
          rotate: "-24deg",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -400,
          top: 1250 + drift(frame, seed + 2, 50),
          width: 2000,
          height: 120,
          background: "rgba(255,255,255,0.05)",
          rotate: "-24deg",
        }}
      />
    </AbsoluteFill>
  );
};

// Grão de filme por cima de tudo
export const Grao: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity: 0.35 }}>
      <svg width="100%" height="100%">
        <filter id="grao">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            seed={frame % 12}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grao)" />
      </svg>
    </AbsoluteFill>
  );
};

// Partículas que explodem de um ponto (carimbo, encaixes)
export const Particulas: React.FC<{
  x: number;
  y: number;
  inicio: number;
  cores: string[];
  qtd?: number;
  forca?: number;
  seed?: number;
}> = ({ x, y, inicio, cores, qtd = 18, forca = 26, seed = 1 }) => {
  const frame = useCurrentFrame();
  const t = frame - inicio;
  if (t < 0 || t > 30) return null;
  return (
    <>
      {Array.from({ length: qtd }).map((_, i) => {
        const r = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
        const rnd = r - Math.floor(r);
        const ang = (i / qtd) * Math.PI * 2 + rnd;
        const v = forca * (0.55 + rnd * 0.8);
        const px = x + Math.cos(ang) * v * t * (1 - t / 60);
        const py = y + Math.sin(ang) * v * t * (1 - t / 60) + 0.9 * t * t;
        const tam = 10 + rnd * 16;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px - tam / 2,
              top: py - tam / 2,
              width: tam * (i % 3 === 0 ? 2.2 : 1),
              height: tam,
              background: cores[i % cores.length],
              borderRadius: i % 2 ? 99 : 3,
              rotate: `${ang * 57 + t * 20}deg`,
              opacity: Math.max(0, 1 - t / 26),
            }}
          />
        );
      })}
    </>
  );
};
