import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  COMANDA_H,
  COMANDA_W,
  Comanda,
  QUEDA,
  gerarComandas,
  type ComandaInfo,
} from "../lib/Comandas";
import { MONO } from "../lib/fontes";
import { Legenda, telas } from "../lib/Legenda";
import { CLAMP, EASE_IN, EASE_OUT, drift, lerp, pop, shake } from "../lib/motion";
import { Rastro } from "../lib/Rastro";
import { Fundo } from "../lib/Visual";
import { SAFE, type SextaProps } from "../schema";

export const CONGELA = 54; // frame local em que as comandas param no ar
export const DURACAO_CENA2 = 132;
const ZOOM_FINAL = 1.18;

export const zoomCena2 = (frame: number) =>
  interpolate(frame, [0, DURACAO_CENA2], [1, ZOOM_FINAL], {
    ...CLAMP,
    easing: Easing.bezier(0.37, 0, 0.63, 1),
  });

// Posição/rotação de uma comanda num instante (pode ser fracionário)
export const estadoComanda = (c: ComandaInfo, f: number, fps: number) => {
  const t = f - c.spawn;
  const p = interpolate(t, [0, QUEDA], [0, 1], { ...CLAMP, easing: EASE_IN });
  const y = lerp(-COMANDA_H, c.y, p);
  const x = lerp(c.x + (c.rotInicial > 0 ? -60 : 60), c.x, p);
  const rot = lerp(c.rotInicial, c.rotFinal, EASE_OUT(p));
  const s =
    t >= QUEDA
      ? spring({ frame: t - QUEDA, fps, config: { damping: 7, stiffness: 320, mass: 0.6 } })
      : 1;
  const impacto = t >= QUEDA ? 1 - s : 0;
  const estica = t < QUEDA ? p * 0.14 : 0; // stretch na queda
  return {
    visivel: t >= 0,
    x,
    y,
    rot,
    sx: 1 + impacto * 0.2 - estica * 0.5,
    sy: 1 - impacto * 0.2 + estica,
    caiu: t >= QUEDA,
  };
};

// Cena 2 — O caos (frames 60–180)
export const Cena2Caos: React.FC<SextaProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const comandas = useMemo(() => gerarComandas(), []);

  const congelado = frame >= CONGELA;
  const eff = Math.min(frame, CONGELA);

  // Impactos para o shake: cada comanda que pousa antes do congelamento
  const pousos = comandas
    .map((c) => c.spawn + QUEDA)
    .filter((f) => f <= CONGELA);
  const cam = shake(frame, [...pousos, CONGELA], 6, 5);

  // Placar 12 → 47
  const bruto = interpolate(frame, [2, CONGELA], [p.contadorInicio, p.contadorFim], {
    ...CLAMP,
    easing: EASE_IN,
  });
  const valor = Math.round(bruto);
  const fr = bruto - Math.floor(bruto);
  const bump = congelado ? 0 : (1 - fr) ** 6 * 0.12;
  const entradaPlacar = pop(frame, fps, 3);

  const flash = interpolate(frame, [CONGELA, CONGELA + 1, CONGELA + 7], [0, 0.55, 0], CLAMP);

  // Legendas divididas pelo restante da cena, proporcional ao nº de palavras
  const blocos = telas(p.fraseCena2);
  const inicioTexto = CONGELA + 3;
  const pesos = blocos.map((b) => b.split(/\s+/).length + 3);
  const totalPeso = pesos.reduce((a, b) => a + b, 0);
  let cursor = inicioTexto;
  const agenda = blocos.map((texto, i) => {
    const dur = ((DURACAO_CENA2 + 6 - inicioTexto) * pesos[i]) / totalPeso;
    const a = { texto, inicio: Math.round(cursor), fim: Math.round(cursor + dur) };
    cursor += dur;
    return a;
  });

  return (
    <AbsoluteFill>
      <Fundo cor={p.corPrincipal} seed={2} />
      <AbsoluteFill
        style={{
          scale: String(zoomCena2(frame)),
          translate: `${cam.x}px ${cam.y}px`,
          rotate: `${cam.r}deg`,
        }}
      >
        {comandas.map((c) => {
          if (eff < c.spawn) return null;
          const micro = congelado ? 1 : 0;
          return (
            <Rastro
              key={c.id}
              frame={eff}
              samples={congelado ? 1 : 3}
              shutter={1.6}
              render={(f) => {
                const e = estadoComanda(c, f, fps);
                return (
                  <div
                    style={{
                      position: "absolute",
                      left: e.x - COMANDA_W / 2,
                      top:
                        e.y - COMANDA_H / 2 + drift(frame, c.id, 5) * micro,
                      rotate: `${e.rot + drift(frame, c.id + 9, 1.2) * micro}deg`,
                      scale: `${e.sx} ${e.sy}`,
                    }}
                  >
                    <Comanda
                      info={c}
                      horario={p.horarioTicket}
                      corPapel={p.corPapel}
                      corTinta={p.corTinta}
                      corDestaque={p.corDestaque}
                    />
                  </div>
                );
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* véu leve quando congela, para o texto respirar */}
      <AbsoluteFill
        style={{
          background: p.corPrincipal,
          opacity: interpolate(frame, [CONGELA, CONGELA + 8], [0, 0.32], CLAMP),
        }}
      />
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />

      {/* Placar */}
      <div
        style={{
          position: "absolute",
          left: SAFE.side,
          top: SAFE.top + 20,
          scale: String(entradaPlacar),
          rotate: `${-4 + drift(frame, 4, 1.2)}deg`,
          transformOrigin: "left top",
        }}
      >
        <div
          style={{
            background: p.corTinta,
            borderRadius: 22,
            padding: "10px 30px 6px",
            boxShadow: "0 14px 0 rgba(0,0,0,0.18)",
            fontFamily: MONO,
            fontWeight: 800,
            fontSize: 132,
            lineHeight: 1,
            color: p.corDestaque,
            textShadow: `0 0 24px ${p.corDestaque}`,
            scale: String(1 + bump),
            letterSpacing: -4,
          }}
        >
          {String(valor).padStart(2, "0")}
        </div>
        <div
          style={{
            marginTop: 14,
            fontFamily: MONO,
            fontWeight: 800,
            fontSize: 30,
            color: p.corTinta,
            background: p.corPapel,
            padding: "4px 14px",
            display: "inline-block",
            textTransform: "uppercase",
          }}
        >
          {p.labelContador}
        </div>
      </div>

      {agenda.map((a, i) => (
        <Legenda
          key={i}
          texto={a.texto}
          inicio={a.inicio}
          fim={a.fim}
          variante="bloco"
          posicao="centro"
          corTexto={p.corTexto}
          corDestaque={p.corDestaque}
          corBloco={i % 2 === 0 ? p.corPapel : p.corDestaque}
          corTextoBloco={i % 2 === 0 ? p.corTinta : p.corTexto}
        />
      ))}
    </AbsoluteFill>
  );
};
