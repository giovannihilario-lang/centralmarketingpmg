import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DISPLAY, MONO } from "../lib/fontes";
import { IMPRESSORA, Impressora, Tracejado } from "../lib/Impressora";
import { CLAMP, EASE_IN, EASE_OUT, drift, lerp, pop, shake, squash } from "../lib/motion";
import { Rastro } from "../lib/Rastro";
import { Fundo, Particulas, zigzag } from "../lib/Visual";
import type { SextaProps } from "../schema";

const T0 = 450; // início absoluto da cena (para o micro movimento fechar o loop)
const CARIMBO = 38; // impacto no beat (450 + 38 ≈ 488)
const DESTACA = 50;
const MORPH = 58;
const LOGO = 66;
const CTA = 80;
const SAIDA = 138; // últimos frames: volta ao enquadramento da Cena 1
const VOLTA_FIM = 147;

const TICKET_H = 500;
const LOGO_Y = 720;
const LOGO_TAM = 360;

// Cena 5 — Final e CTA (frames 450–600)
export const Cena5Final: React.FC<SextaProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const abs = frame + T0;

  // Impressora: entra com spring, cai quando o ticket destaca, volta no loop
  const entrada = (1 - pop(frame, fps, 0, { damping: 13, stiffness: 150 })) * 600;
  const queda = interpolate(frame, [DESTACA, DESTACA + 12], [0, 1000], {
    ...CLAMP,
    easing: EASE_IN,
  });
  const volta = interpolate(frame, [SAIDA + 2, VOLTA_FIM], [1000, 0], {
    ...CLAMP,
    easing: EASE_OUT,
  });
  const offsetImpressora = frame > SAIDA ? volta : frame >= DESTACA ? queda : entrada;

  const comprimento = interpolate(
    frame,
    [4, 10, 14, 20, 24, 32],
    [0, 160, 175, 330, 345, TICKET_H],
    { ...CLAMP, easing: EASE_OUT },
  );
  const imprimindo = frame >= 4 && frame < 33;

  const cam = shake(frame, [CARIMBO, LOGO + 2], 24, 10);

  // Ticket solto → sobe para o centro → dobra → vira o logo
  const ticketTopo0 = IMPRESSORA.slotY + 4 - TICKET_H;
  const sobe = pop(frame, fps, DESTACA, { damping: 14, stiffness: 120 });
  const m = pop(frame, fps, MORPH, { damping: 15, stiffness: 150 });
  const dobra = Math.sin(Math.min(1, Math.max(0, m)) * Math.PI); // pico no meio do morph
  const larg = lerp(IMPRESSORA.larguraTicket, LOGO_TAM, Math.min(1, m));
  const alt = lerp(TICKET_H, LOGO_TAM, Math.min(1, m));
  const centroY = lerp(ticketTopo0 + TICKET_H / 2, LOGO_Y, sobe);

  const logoS = pop(frame, fps, LOGO, { damping: 8, stiffness: 180 });
  const brilhoX = interpolate(frame, [LOGO + 10, LOGO + 26], [-1.2, 1.4], {
    ...CLAMP,
    easing: EASE_OUT,
  });
  const saida = interpolate(frame, [SAIDA, SAIDA + 6], [1, 0], { ...CLAMP, easing: EASE_IN });

  // CTA pulsando no tempo da música (2 Hz = 120 BPM)
  const ctaA = pop(frame, fps, CTA);
  const ctaB = pop(frame, fps, CTA + 4, { damping: 8 });
  const pulso = 1 + 0.035 * Math.max(0, Math.cos(((frame - CTA) / 15) * Math.PI * 2)) ** 3;
  const [antes, depois] = p.ctaDestaque && p.cta.includes(p.ctaDestaque)
    ? [p.cta.slice(0, p.cta.indexOf(p.ctaDestaque)).trim(), p.cta.slice(p.cta.indexOf(p.ctaDestaque) + p.ctaDestaque.length).trim()]
    : [p.cta, ""];

  const carimboS = frame >= CARIMBO ? pop(frame, fps, CARIMBO, { damping: 8, stiffness: 400 }) : 0;
  const sqC = squash(carimboS, 0.3);

  return (
    <AbsoluteFill>
      <Fundo cor={p.corPrincipal} seed={1} t0={T0} />
      <AbsoluteFill
        style={{
          translate: `${cam.x}px ${cam.y + drift(abs, 3, 4)}px`,
          rotate: `${cam.r + drift(abs, 5, 0.25)}deg`,
          scale: "1.02",
        }}
      >
        <Impressora
          comprimento={frame < DESTACA ? comprimento : 0}
          tremor={imprimindo ? 1 : 0}
          frame={frame}
          corPapel={p.corPapel}
          corTinta={p.corTinta}
          corDestaque={p.corDestaque}
          ledAceso={imprimindo && Math.floor(frame / 3) % 2 === 0}
          offsetY={offsetImpressora}
        >
          <ConteudoTicket {...p} />
        </Impressora>

        {/* Ticket solto que vira logo */}
        {frame >= DESTACA && frame < LOGO + 8 && (
          <div
            style={{
              position: "absolute",
              left: 540 - larg / 2,
              top: centroY - alt / 2,
              width: larg,
              height: alt,
              scale: `${1 + dobra * 0.12} ${1 - dobra * 0.55}`,
              rotate: `${(1 - sobe) * -4 + dobra * 8}deg`,
              filter: "drop-shadow(0 18px 18px rgba(0,0,0,0.18))",
              opacity: interpolate(frame, [LOGO + 2, LOGO + 8], [1, 0], CLAMP),
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: p.corPapel,
                borderRadius: frame >= MORPH ? lerp(0, 64, Math.min(1, m)) : 0,
                clipPath: frame >= MORPH ? undefined : zigzag(13, 12, true, false),
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "34px 30px",
                  fontFamily: MONO,
                  color: p.corTinta,
                  opacity: interpolate(frame, [MORPH, MORPH + 5], [1, 0], CLAMP),
                }}
              >
                <ConteudoTicket {...p} />
              </div>
              {/* dobra: faixa de sombra atravessando o papel */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "45%",
                  height: "10%",
                  background: "rgba(0,0,0,0.25)",
                  opacity: dobra,
                }}
              />
            </div>
            <Carimbo
              {...p}
              visivel={frame < MORPH + 4}
              escala={1}
              sx={1}
              sy={1}
              opacidade={interpolate(frame, [MORPH, MORPH + 4], [1, 0], CLAMP)}
            />
          </div>
        )}

        {/* Carimbo batendo (enquanto o ticket ainda está na impressora) */}
        {frame < DESTACA && frame >= CARIMBO - 7 && (
          <div
            style={{
              position: "absolute",
              left: 540 - IMPRESSORA.larguraTicket / 2,
              top: ticketTopo0 + entrada,
              width: IMPRESSORA.larguraTicket,
              height: TICKET_H,
            }}
          >
            <Rastro
              frame={frame}
              samples={frame < CARIMBO ? 4 : 1}
              shutter={1.2}
              render={(f) => {
                const e = interpolate(f, [CARIMBO - 7, CARIMBO], [3.4, 1], {
                  ...CLAMP,
                  easing: EASE_IN,
                });
                return (
                  <Carimbo
                    {...p}
                    visivel
                    escala={f < CARIMBO ? e : 1}
                    sx={sqC.scaleX}
                    sy={sqC.scaleY}
                    opacidade={interpolate(f, [CARIMBO - 7, CARIMBO - 5], [0, 1], CLAMP)}
                  />
                );
              }}
            />
          </div>
        )}
        <Particulas
          x={540}
          y={ticketTopo0 + TICKET_H * 0.62}
          inicio={CARIMBO}
          cores={[p.corDestaque, p.corPapel, p.corTinta]}
          qtd={26}
          forca={30}
        />

        {/* Logo */}
        {frame >= LOGO - 1 && (
          <div
            style={{
              position: "absolute",
              left: 540 - LOGO_TAM / 2,
              top: LOGO_Y - LOGO_TAM / 2,
              width: LOGO_TAM,
              height: LOGO_TAM,
              scale: String(Math.max(0, (0.55 + 0.45 * logoS) * saida)),
              rotate: `${(1 - logoS) * -12 + drift(abs, 8, 1.2)}deg`,
              opacity: interpolate(frame, [LOGO - 1, LOGO + 2], [0, 1], CLAMP) * saida,
              filter: "drop-shadow(0 20px 22px rgba(0,0,0,0.22))",
            }}
          >
            <div style={{ position: "absolute", inset: 0, borderRadius: 64, overflow: "hidden" }}>
              <Img src={staticFile("logo-pmg.png")} style={{ width: "100%", height: "100%" }} />
              <div
                style={{
                  position: "absolute",
                  top: -60,
                  bottom: -60,
                  width: 120,
                  left: `${brilhoX * 100}%`,
                  rotate: "20deg",
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)",
                  mixBlendMode: "screen",
                }}
              />
            </div>
          </div>
        )}

        {/* CTA */}
        {frame >= CTA - 1 && (
          <div
            style={{
              position: "absolute",
              left: 80,
              right: 80,
              top: LOGO_Y + LOGO_TAM / 2 + 70,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              fontFamily: DISPLAY,
              textTransform: "uppercase",
              color: p.corTexto,
              opacity: saida,
              scale: String(saida),
            }}
          >
            {antes && (
              <div
                style={{
                  fontSize: Math.min(104, 900 / (antes.length * 0.5)),
                  lineHeight: 1,
                  translate: `0 ${(1 - ctaA) * 80}px`,
                  opacity: Math.min(1, ctaA * 2),
                  textShadow: "0 8px 0 rgba(0,0,0,0.16)",
                }}
              >
                {antes}
              </div>
            )}
            <div
              style={{
                background: p.corDestaque,
                padding: "6px 30px 2px",
                fontSize: Math.min(136, 860 / (Math.max(depois.length, p.ctaDestaque.length) * 0.5)),
                lineHeight: 1.05,
                rotate: "-2deg",
                scale: String(Math.max(0, ctaB) * pulso),
                boxShadow: "0 14px 0 rgba(0,0,0,0.18)",
              }}
            >
              {depois ? `${p.ctaDestaque} ${depois}` : p.ctaDestaque || p.cta}
            </div>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const ConteudoTicket: React.FC<SextaProps> = (p) => (
  <>
    <div style={{ textAlign: "center", fontWeight: 800, fontSize: 24, letterSpacing: 4 }}>
      ★ PMG ATACADISTA ★
    </div>
    <Tracejado cor={p.corTinta} />
    <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.6, whiteSpace: "nowrap", letterSpacing: -0.5 }}>
      <div>{p.ticketFinalLinha1}</div>
      <div>{p.ticketFinalLinha2}</div>
    </div>
    <Tracejado cor={p.corTinta} />
    <div style={{ display: "flex", gap: 4, height: 70, marginTop: 10 }}>
      {Array.from({ length: 34 }).map((_, i) => (
        <div
          key={i}
          style={{ flex: (i * 7) % 3 === 0 ? 3 : 1, background: p.corTinta, opacity: i % 5 === 0 ? 0 : 1 }}
        />
      ))}
    </div>
    <div style={{ textAlign: "center", fontSize: 20, opacity: 0.6, marginTop: 10 }}>
      {p.horarioTicket} · OBRIGADO!
    </div>
  </>
);

const Carimbo: React.FC<
  SextaProps & { visivel: boolean; escala: number; sx: number; sy: number; opacidade: number }
> = ({ visivel, escala, sx, sy, opacidade, ...p }) =>
  visivel ? (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "62%",
        translate: "-50% -50%",
        rotate: "-14deg",
        scale: `${escala * sx} ${escala * sy}`,
        opacity: opacidade,
        border: `8px solid ${p.corDestaque}`,
        borderRadius: 14,
        padding: "4px 22px",
        color: p.corDestaque,
        fontFamily: DISPLAY,
        fontSize: 92,
        lineHeight: 1.05,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        mixBlendMode: "multiply",
      }}
    >
      {p.carimbo}
    </div>
  ) : null;
