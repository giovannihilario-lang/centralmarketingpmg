import { getLength, getPointAtLength, getTangentAtLength } from "@remotion/paths";
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { MONO } from "../lib/fontes";
import { Legenda, telas } from "../lib/Legenda";
import { CLAMP, EASE_IN_OUT, drift, lerp, pop, shake } from "../lib/motion";
import { Rastro } from "../lib/Rastro";
import { Fundo } from "../lib/Visual";
import type { SextaProps } from "../schema";

const MAPA = { x: 80, y: 300, w: 920, h: 820 };
const RUAS_V = [110, 290, 470, 650, 830];
const RUAS_H = [120, 300, 470, 620, 780];

type P = [number, number];
const arredondada = (pts: P[], r: number) => {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(px - cx, py - cy);
    const l2 = Math.hypot(nx - cx, ny - cy);
    const a: P = [cx + ((px - cx) / l1) * r, cy + ((py - cy) / l1) * r];
    const b: P = [cx + ((nx - cx) / l2) * r, cy + ((ny - cy) / l2) * r];
    d += ` L${a[0]} ${a[1]} Q${cx} ${cy} ${b[0]} ${b[1]}`;
  }
  const u = pts[pts.length - 1];
  return `${d} L${u[0]} ${u[1]}`;
};

const PONTOS: P[] = [
  [110, 780],
  [290, 780],
  [290, 620],
  [470, 620],
  [470, 470],
  [650, 470],
  [650, 300],
  [830, 300],
  [830, 120],
];
const ROTA = arredondada(PONTOS, 34);
const L = getLength(ROTA);
const INICIO = PONTOS[0];
const FIM = PONTOS[PONTOS.length - 1];

const ROTA_INI = 22;
const ROTA_FIM = 92;
const progresso = (f: number) =>
  interpolate(f, [ROTA_INI, ROTA_FIM], [0, 1], { ...CLAMP, easing: EASE_IN_OUT });

// Pins pelo caminho: [fração da rota, deslocamento lateral]
const PINS: { fr: number; dx: number; dy: number }[] = [
  { fr: 0.16, dx: 0, dy: 52 },
  { fr: 0.34, dx: -54, dy: 0 },
  { fr: 0.52, dx: 0, dy: 52 },
  { fr: 0.7, dx: 54, dy: 0 },
];
const frameDoPin = (fr: number) => {
  for (let f = ROTA_INI; f <= ROTA_FIM; f++) if (progresso(f) >= fr) return f;
  return ROTA_FIM;
};

// Cena 4 — A rota (frames 330–450)
export const Cena4Rota: React.FC<SextaProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Zoom out: a prateleira vira um ponto no mapa
  // começa com a mini prateleira no tamanho/posição da prateleira da Cena 3
  const z = interpolate(frame, [4, 34], [0, 1], { ...CLAMP, easing: EASE_IN_OUT });
  const zoom = lerp(6.2, 1, z);
  const origemX = MAPA.x + INICIO[0];
  const origemY = MAPA.y + INICIO[1];
  const panX = (540 - origemX) * (1 - z);
  const panY = (700 - origemY) * (1 - z);

  const pr = progresso(frame);
  const pinFinal = pop(frame, fps, ROTA_FIM + 2, { damping: 6, stiffness: 200 });
  const label = pop(frame, fps, ROTA_FIM + 7, { damping: 9 });
  const pinsFrames = PINS.map((pin) => frameDoPin(pin.fr));
  const cam = shake(frame, [...pinsFrames, ROTA_FIM + 2], 6, 6);

  const blocos = telas(p.fraseCena4);
  const agenda = blocos.map((texto, i) => ({
    texto,
    inicio: i === 0 ? 28 : 78 + (i - 1) * 40,
    fim: i === blocos.length - 1 ? 145 : 78 + i * 40,
  }));

  return (
    <AbsoluteFill>
      <Fundo cor={p.corPrincipal} seed={4} />
      <AbsoluteFill
        style={{
          scale: String(zoom),
          transformOrigin: `${origemX}px ${origemY}px`,
          translate: `${cam.x + panX}px ${cam.y + panY + drift(frame, 11, 6)}px`,
          rotate: `${drift(frame, 2, 0.4) + cam.r}deg`,
        }}
      >
        <svg
          width={MAPA.w}
          height={MAPA.h}
          viewBox={`0 0 ${MAPA.w} ${MAPA.h}`}
          style={{ position: "absolute", left: MAPA.x, top: MAPA.y, overflow: "visible" }}
        >
          {/* quarteirões */}
          {RUAS_V.slice(0, -1).flatMap((vx, i) =>
            RUAS_H.slice(0, -1).map((hy, j) => (
              <rect
                key={`${i}-${j}`}
                x={vx + 22}
                y={hy + 22}
                width={RUAS_V[i + 1] - vx - 44}
                height={RUAS_H[j + 1] - hy - 44}
                rx={14}
                fill="rgba(255,255,255,0.07)"
              />
            )),
          )}
          {/* ruas */}
          {RUAS_V.map((vx) => (
            <line key={`v${vx}`} x1={vx} y1={-60} x2={vx} y2={MAPA.h + 40} stroke="rgba(255,255,255,0.28)" strokeWidth={12} strokeLinecap="round" />
          ))}
          {RUAS_H.map((hy) => (
            <line key={`h${hy}`} x1={-40} y1={hy} x2={MAPA.w + 40} y2={hy} stroke="rgba(255,255,255,0.28)" strokeWidth={12} strokeLinecap="round" />
          ))}
          <path d="M-40 560 Q 300 420 520 360 T 960 60" stroke="rgba(255,255,255,0.2)" strokeWidth={22} fill="none" strokeLinecap="round" />

          {/* rota prevista + rastro na cor de destaque */}
          <path d={ROTA} stroke="rgba(255,255,255,0.7)" strokeWidth={6} strokeDasharray="2 20" strokeLinecap="round" fill="none" />
          <path
            d={ROTA}
            stroke={p.corDestaque}
            strokeWidth={22}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={L}
            strokeDashoffset={L * (1 - pr)}
          />
          <path
            d={ROTA}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={L}
            strokeDashoffset={L * (1 - pr)}
          />

          {/* ponto de origem: a prateleira vista de longe */}
          <MiniPrateleira x={INICIO[0]} y={INICIO[1]} {...p} />

          {PINS.map((pin, i) => {
            const pt = getPointAtLength(ROTA, L * pin.fr);
            if (!pt) return null;
            const s = pop(frame, fps, pinsFrames[i], { damping: 6, stiffness: 260 });
            return (
              <g
                key={i}
                transform={`translate(${pt.x + pin.dx} ${pt.y + pin.dy - (1 - s) * 30}) scale(${Math.max(0, s)})`}
              >
                <Pin tamanho={54} cor={p.corPapel} miolo={p.corDestaque} />
              </g>
            );
          })}

          {/* pulso + pin final */}
          {frame >= ROTA_FIM + 2 &&
            [0, 1].map((k) => {
              const t = ((frame - ROTA_FIM - 2 + k * 12) % 24) / 24;
              return (
                <circle
                  key={k}
                  cx={FIM[0]}
                  cy={FIM[1]}
                  r={20 + t * 110}
                  fill="none"
                  stroke={p.corPapel}
                  strokeWidth={6}
                  opacity={(1 - t) * 0.8}
                />
              );
            })}
          <g transform={`translate(${FIM[0]} ${FIM[1]}) scale(${Math.max(0, pinFinal)})`}>
            <Pin tamanho={130} cor={p.corDestaque} miolo={p.corPapel} />
          </g>

          {/* caminhãozinho */}
          {frame >= ROTA_INI - 2 && (
            <foreignObject x={-200} y={-200} width={MAPA.w + 400} height={MAPA.h + 400} style={{ overflow: "visible" }}>
              <div style={{ position: "relative", width: MAPA.w + 400, height: MAPA.h + 400 }}>
                <Rastro
                  frame={frame}
                  samples={4}
                  shutter={1.6}
                  render={(f) => {
                    const at = L * progresso(f);
                    const pt = getPointAtLength(ROTA, at) ?? { x: INICIO[0], y: INICIO[1] };
                    const tg = getTangentAtLength(ROTA, Math.min(L - 1, at)) ?? { x: 1, y: 0 };
                    const ang = (Math.atan2(tg.y, tg.x) * 180) / Math.PI;
                    return (
                      <div
                        style={{
                          position: "absolute",
                          left: pt.x + 200 - 46,
                          top: pt.y + 200 - 28,
                          width: 92,
                          height: 56,
                          rotate: `${ang}deg`,
                        }}
                      >
                        <Caminhao {...p} />
                      </div>
                    );
                  }}
                />
              </div>
            </foreignObject>
          )}
        </svg>

        {/* label "sua cozinha" */}
        <div
          style={{
            position: "absolute",
            right: 1080 - (MAPA.x + FIM[0]) + 80,
            top: MAPA.y + FIM[1] - 110,
            scale: String(Math.max(0, label)),
            transformOrigin: "right center",
            rotate: `${-3 + drift(frame, 6, 1.5)}deg`,
          }}
        >
          <div
            style={{
              background: p.corPapel,
              color: p.corTinta,
              fontFamily: MONO,
              fontWeight: 800,
              fontSize: 40,
              padding: "10px 22px",
              borderRadius: 12,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              boxShadow: "0 10px 0 rgba(0,0,0,0.16)",
            }}
          >
            {p.labelSuaCozinha}
          </div>
        </div>
      </AbsoluteFill>

      {agenda.map((a, i) => (
        <Legenda
          key={i}
          texto={a.texto}
          inicio={a.inicio}
          fim={a.fim}
          variante="mascara"
          posicao="base"
          corTexto={p.corTexto}
          corDestaque={p.corDestaque}
        />
      ))}
    </AbsoluteFill>
  );
};

const Pin: React.FC<{ tamanho: number; cor: string; miolo: string }> = ({
  tamanho,
  cor,
  miolo,
}) => {
  const k = tamanho / 100;
  return (
    <g transform={`scale(${k}) translate(-50 -118)`}>
      <ellipse cx={50} cy={118} rx={22} ry={7} fill="rgba(0,0,0,0.2)" />
      <path
        d="M50 116 C 30 84 6 66 6 44 A 44 44 0 1 1 94 44 C 94 66 70 84 50 116 Z"
        fill={cor}
        stroke="#151515"
        strokeWidth={6}
      />
      <circle cx={50} cy={44} r={18} fill={miolo} />
    </g>
  );
};

const MiniPrateleira: React.FC<SextaProps & { x: number; y: number }> = ({
  x,
  y,
  ...p
}) => {
  const cores = ["#F3B61F", "#FFF3C7", "#E9D8B8", "#C98E4E", "#D9363E", "#E23B2E"];
  return (
    <g transform={`translate(${x - 74} ${y - 62})`}>
      <rect x={-8} y={-8} width={164} height={140} rx={12} fill={p.corPapel} stroke="#151515" strokeWidth={5} />
      {cores.map((c, i) => (
        <rect
          key={i}
          x={8 + (i % 3) * 46}
          y={10 + Math.floor(i / 3) * 56}
          width={40}
          height={40}
          rx={6}
          fill={c}
          stroke="#151515"
          strokeWidth={3}
        />
      ))}
      <rect x={0} y={52} width={148} height={8} fill="#151515" />
      <rect x={0} y={108} width={148} height={8} fill="#151515" />
    </g>
  );
};

const Caminhao: React.FC<SextaProps> = (p) => (
  <svg width={92} height={56} viewBox="0 0 92 56" style={{ overflow: "visible" }}>
    <rect x={2} y={6} width={62} height={44} rx={8} fill={p.corPapel} stroke="#151515" strokeWidth={4} />
    <rect x={64} y={10} width={26} height={36} rx={9} fill={p.corDestaque} stroke="#151515" strokeWidth={4} />
    <rect x={76} y={16} width={8} height={24} rx={3} fill="#151515" opacity={0.6} />
    <text x={33} y={36} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={18} fill="#151515">
      PMG
    </text>
  </svg>
);
