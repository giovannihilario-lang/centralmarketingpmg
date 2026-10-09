import React from "react";
import { random } from "remotion";
import { MONO } from "./fontes";
import { Tracejado } from "./Impressora";
import { zigzag } from "./Visual";

export const COMANDA_W = 290;
export const COMANDA_H = 380;

const ITENS = [
  "2x X-BURGER",
  "1x PIZZA MUSS",
  "3x PORÇÃO FRITAS",
  "1x CALABRESA G",
  "4x CHOPP 300",
  "2x PARMÊ",
  "1x FILÉ C/ FRITAS",
  "5x PASTEL CARNE",
  "2x REFRI LATA",
  "1x PIZZA 4 QUEIJ",
  "3x ESPETINHO",
  "2x BAURU",
];

export type ComandaInfo = {
  id: number;
  spawn: number; // frame em que começa a cair
  x: number;
  y: number; // centro final
  rotFinal: number;
  rotInicial: number;
  mesa: number;
  itens: string[];
};

// Lotes no beat (a cada 15 frames), acelerando — termina com uma rajada
// que fica congelada no ar.
const LOTES: { frame: number; qtd: number }[] = [
  { frame: 0, qtd: 3 },
  { frame: 15, qtd: 5 },
  { frame: 30, qtd: 8 },
  { frame: 38, qtd: 10 }, // meio-beat: acelera
  { frame: 44, qtd: 8 }, // rajada final, congela no ar (frame 54)
];

export const QUEDA = 13;

export const gerarComandas = (): ComandaInfo[] => {
  const lista: ComandaInfo[] = [];
  let id = 0;
  const total = LOTES.reduce((a, l) => a + l.qtd, 0);
  for (const lote of LOTES) {
    for (let j = 0; j < lote.qtd; j++) {
      const r = (k: string) => random(`comanda-${id}-${k}`);
      const nivel = id / total; // pilha sobe de baixo para cima
      lista.push({
        id,
        spawn: lote.frame + j * (lote.qtd > 6 ? 1 : 2),
        x: 130 + ((j + 0.5) / lote.qtd) * 820 + (r("x") - 0.5) * 140,
        y: 1760 - nivel * 1620 + (r("y") - 0.5) * 200,
        rotFinal: (r("rot") - 0.5) * 50,
        rotInicial: (r("rot0") - 0.5) * 220,
        mesa: 1 + Math.floor(r("mesa") * 32),
        itens: [0, 1, 2].map(
          (k) => ITENS[Math.floor(r(`item${k}`) * ITENS.length)],
        ),
      });
      id++;
    }
  }
  return lista;
};

export const Comanda: React.FC<{
  info: ComandaInfo;
  horario: string;
  corPapel: string;
  corTinta: string;
  corDestaque: string;
}> = ({ info, horario, corPapel, corTinta, corDestaque }) => (
  <div
    style={{
      width: COMANDA_W,
      height: COMANDA_H,
      filter: "drop-shadow(0 16px 14px rgba(0,0,0,0.2))",
    }}
  >
    <div
      style={{
        width: "100%",
        height: "100%",
        background: corPapel,
        clipPath: zigzag(10, 11),
        padding: "30px 24px",
        boxSizing: "border-box",
        fontFamily: MONO,
        color: corTinta,
        fontSize: 22,
        fontWeight: 500,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 800, fontSize: 30 }}>
          MESA {String(info.mesa).padStart(2, "0")}
        </span>
        <span
          style={{
            background: corDestaque,
            color: corPapel,
            padding: "2px 8px",
            fontWeight: 800,
            fontSize: 18,
            alignSelf: "center",
          }}
        >
          #{String(info.id + 101)}
        </span>
      </div>
      <div style={{ fontSize: 20, opacity: 0.6, marginTop: 6 }}>{horario}</div>
      <Tracejado cor={corTinta} />
      {info.itens.map((it, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          {it}
        </div>
      ))}
      <Tracejado cor={corTinta} />
      <div style={{ fontWeight: 800, fontSize: 24 }}>URGENTE!!</div>
    </div>
  </div>
);
