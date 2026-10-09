import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { SAFE } from "../schema";
import { DISPLAY } from "./fontes";
import { CLAMP, EASE_IN, pop } from "./motion";

export type Variante = "pop" | "bloco" | "mascara";

// "frase A / frase B" → ["frase A", "frase B"] (cada uma vira uma tela)
export const telas = (frase: string) =>
  frase
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

const limpo = (w: string) => w.replace(/\*/g, "");

// Quebra balanceada em no máximo 2 linhas
export const quebrarLinhas = (texto: string): string[][] => {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const total = limpo(texto).length;
  if (palavras.length < 2 || total <= 13) return [palavras];
  let melhor = 1;
  let melhorMax = Infinity;
  for (let i = 1; i < palavras.length; i++) {
    const a = limpo(palavras.slice(0, i).join(" ")).length;
    const b = limpo(palavras.slice(i).join(" ")).length;
    if (Math.max(a, b) < melhorMax) {
      melhorMax = Math.max(a, b);
      melhor = i;
    }
  }
  return [palavras.slice(0, melhor), palavras.slice(melhor)];
};

export const Legenda: React.FC<{
  texto: string;
  inicio: number;
  fim: number;
  variante: Variante;
  posicao: "topo" | "centro" | "base";
  corTexto: string;
  corDestaque: string;
  corBloco?: string;
  corTextoBloco?: string;
  gapPalavra?: number;
}> = ({
  texto,
  inicio,
  fim,
  variante,
  posicao,
  corTexto,
  corDestaque,
  corBloco,
  corTextoBloco,
  gapPalavra = 4,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  if (frame < inicio - 1 || frame > fim) return null;

  const linhas = quebrarLinhas(texto.toUpperCase());
  const maxLen = Math.max(...linhas.map((l) => limpo(l.join(" ")).length));
  const util = width - SAFE.side * 2;
  const fator = variante === "bloco" ? 0.56 : 0.5;
  const fontSize = Math.min(150, util / (maxLen * fator));

  // Saída rápida com "blur de movimento"
  const saida = interpolate(frame, [fim - 5, fim], [0, 1], {
    ...CLAMP,
    easing: EASE_IN,
  });

  const posStyle: React.CSSProperties =
    posicao === "topo"
      ? { top: SAFE.top + 30 }
      : posicao === "base"
        ? { bottom: SAFE.bottom + 20 }
        : { top: "50%", translate: "0 -50%" };

  let idx = 0;
  return (
    <div
      style={{
        position: "absolute",
        left: SAFE.side,
        right: SAFE.side,
        ...posStyle,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: variante === "bloco" ? 14 : 4,
        fontFamily: DISPLAY,
        fontSize,
        lineHeight: 1.02,
        color: corTexto,
        textAlign: "center",
        opacity: 1 - saida,
        filter: `blur(${saida * 8}px)`,
        transform: `translateY(${-saida * 70}px) scaleY(${1 + saida * 0.25})`,
      }}
    >
      {linhas.map((linha, li) => {
        const inicioLinha = inicio + li * 4;
        if (variante === "pop") {
          return (
            <div key={li} style={{ display: "flex", gap: "0.22em" }}>
              {linha.map((p) => {
                const st = inicio + idx++ * gapPalavra;
                const s = pop(frame, fps, st, { damping: 9, stiffness: 260 });
                const visivel = frame >= st;
                return (
                  <Palavra
                    key={p + st}
                    palavra={p}
                    corDestaque={corDestaque}
                    style={{
                      opacity: visivel ? 1 : 0,
                      scale: String(1.4 - 0.4 * s),
                      filter: `blur(${Math.max(0, (1 - s) * 5)}px)`,
                      textShadow: "0 8px 0 rgba(0,0,0,0.16)",
                    }}
                  />
                );
              })}
            </div>
          );
        }
        if (variante === "bloco") {
          const sb = pop(frame, fps, inicioLinha, { damping: 14, stiffness: 200 });
          const st = pop(frame, fps, inicioLinha + 3, { damping: 13 });
          return (
            <div
              key={li}
              style={{ position: "relative", padding: "0.06em 0.28em 0.02em" }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: corBloco ?? corDestaque,
                  transformOrigin: li % 2 === 0 ? "left center" : "right center",
                  scale: `${Math.max(0, sb)} 1`,
                  rotate: `${li % 2 === 0 ? -1.5 : 1.2}deg`,
                  boxShadow: "0 14px 0 rgba(0,0,0,0.14)",
                }}
              />
              <div
                style={{
                  position: "relative",
                  overflow: "hidden",
                  padding: "0.16em 0 0.06em",
                  margin: "-0.16em 0 -0.06em",
                }}
              >
                <div
                  style={{
                    color: corTextoBloco ?? corTexto,
                    translate: `0 ${(1 - st) * 110}%`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {linha.map(limpo).join(" ")}
                </div>
              </div>
            </div>
          );
        }
        // mascara
        const sm = pop(frame, fps, inicioLinha, { damping: 15, stiffness: 160 });
        return (
          <div
            key={li}
            style={{ overflow: "hidden", padding: "0.16em 0.1em 0.08em", margin: "-0.16em 0 -0.08em" }}
          >
            <div
              style={{
                display: "flex",
                gap: "0.22em",
                translate: `0 ${(1 - sm) * 115}%`,
                rotate: `${(1 - sm) * 6}deg`,
                textShadow: "0 8px 0 rgba(0,0,0,0.16)",
              }}
            >
              {linha.map((p, pi) => (
                <Palavra key={pi} palavra={p} corDestaque={corDestaque} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// *palavra* ganha um bloco na cor de destaque
const Palavra: React.FC<{
  palavra: string;
  corDestaque: string;
  style?: React.CSSProperties;
}> = ({ palavra, corDestaque, style }) => {
  const destaque = /^\*.*\*[,.!?]?$/.test(palavra);
  return (
    <span
      style={{
        display: "inline-block",
        ...(destaque
          ? {
              background: corDestaque,
              padding: "0 0.14em",
              rotate: "-2deg",
              boxShadow: "0 8px 0 rgba(0,0,0,0.16)",
            }
          : {}),
        ...style,
      }}
    >
      {limpo(palavra)}
    </span>
  );
};
