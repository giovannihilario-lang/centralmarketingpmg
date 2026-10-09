import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { MONO } from "../lib/fontes";
import { Impressora, Tracejado } from "../lib/Impressora";
import { Legenda, telas } from "../lib/Legenda";
import { CLAMP, EASE_OUT, drift, shake } from "../lib/motion";
import { Fundo } from "../lib/Visual";
import type { SextaProps } from "../schema";

const GAP = 4; // frames entre palavras
const INICIO_TEXTO = 6;

// Cena 1 — Gancho (frames 0–60)
export const Cena1Gancho: React.FC<SextaProps> = (p) => {
  const frame = useCurrentFrame();

  // 5 frames de silêncio visual, depois a impressora dispara em rajadas
  const comprimento = interpolate(
    frame,
    [5, 11, 15, 22, 26, 34, 38, 52],
    [0, 120, 135, 250, 265, 370, 380, 470],
    { ...CLAMP, easing: EASE_OUT },
  );
  const imprimindo = frame >= 5 && frame < 54;

  // Cronograma das telas de legenda, palavra por palavra
  const blocos = telas(p.fraseCena1);
  let cursor = INICIO_TEXTO;
  const agenda = blocos.map((texto, i) => {
    const inicio = i === 0 ? cursor : Math.max(cursor, 30);
    const n = texto.split(/\s+/).length;
    cursor = inicio + n * GAP + 8;
    return { texto, inicio, palavras: n };
  });
  const hits = agenda.flatMap((a) =>
    Array.from({ length: a.palavras }, (_, k) => a.inicio + k * GAP),
  );
  const cam = shake(frame, [5, ...hits], 11, 6);
  const punch = hits.reduce(
    (acc, h) => acc + interpolate(frame, [h, h + 1, h + 6], [0, 0.025, 0], CLAMP),
    0,
  );

  return (
    <AbsoluteFill>
      <Fundo cor={p.corPrincipal} seed={1} />
      <AbsoluteFill
        style={{
          translate: `${cam.x}px ${cam.y + drift(frame, 3, 4)}px`,
          rotate: `${cam.r + drift(frame, 5, 0.25)}deg`,
          scale: String(1.02 + punch),
        }}
      >
        <Impressora
          comprimento={comprimento}
          tremor={imprimindo ? 1 : 0}
          frame={frame}
          corPapel={p.corPapel}
          corTinta={p.corTinta}
          corDestaque={p.corDestaque}
          ledAceso={imprimindo && Math.floor(frame / 3) % 2 === 0}
        >
          <TicketGancho {...p} />
        </Impressora>

        {agenda.map((a, i) => (
          <Legenda
            key={i}
            texto={a.texto}
            inicio={a.inicio}
            fim={agenda[i + 1]?.inicio ?? 90}
            variante="pop"
            posicao="topo"
            gapPalavra={GAP}
            corTexto={p.corTexto}
            corDestaque={p.corDestaque}
          />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const TicketGancho: React.FC<SextaProps> = (p) => (
  <>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22 }}>
      <span style={{ fontWeight: 800 }}>COMANDA #146</span>
      <span style={{ opacity: 0.6 }}>SALÃO</span>
    </div>
    <Tracejado cor={p.corTinta} />
    <div
      style={{
        fontWeight: 800,
        fontSize: 60,
        letterSpacing: -2,
        whiteSpace: "nowrap",
        lineHeight: 1,
        textAlign: "center",
        margin: "8px 0",
      }}
    >
      {p.horarioTicket}
    </div>
    <div style={{ textAlign: "center", fontSize: 22, opacity: 0.7 }}>
      MESA 12 · 4 PESSOAS
    </div>
    <Tracejado cor={p.corTinta} />
    <div style={{ fontSize: 24, lineHeight: 1.6, fontFamily: MONO }}>
      <div>2x X-BURGER</div>
      <div>1x PIZZA CALABRESA</div>
      <div>3x REFRI LATA</div>
    </div>
  </>
);
