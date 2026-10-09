import React from "react";
import { MONO } from "./fontes";
import { zigzag } from "./Visual";

// Enquadramento fixo da impressora — o mesmo na Cena 1 e no fim da Cena 5 (loop)
export const IMPRESSORA = { x: 540, slotY: 1090, larguraTicket: 400 } as const;

export const Impressora: React.FC<{
  comprimento: number; // px de papel para fora
  tremor: number; // 0..1
  frame: number;
  corPapel: string;
  corTinta: string;
  corDestaque: string;
  ledAceso: boolean;
  offsetY?: number;
  children?: React.ReactNode; // conteúdo do ticket
}> = ({
  comprimento,
  tremor,
  frame,
  corPapel,
  corTinta,
  corDestaque,
  ledAceso,
  offsetY = 0,
  children,
}) => {
  const jx = Math.sin(frame * 2.3) * 3.2 * tremor;
  const jy = Math.cos(frame * 3.1) * 2.4 * tremor;
  const W = 560;
  const H = 330;
  return (
    <div
      style={{
        position: "absolute",
        left: IMPRESSORA.x - W / 2,
        top: IMPRESSORA.slotY - 36 + offsetY,
        width: W,
        height: H,
        translate: `${jx}px ${jy}px`,
      }}
    >
      {/* Ticket saindo do slot, de baixo para cima */}
      <div
        style={{
          position: "absolute",
          left: (W - IMPRESSORA.larguraTicket) / 2,
          bottom: H - 40,
          width: IMPRESSORA.larguraTicket,
          height: Math.max(0, comprimento),
          filter: "drop-shadow(0 18px 18px rgba(0,0,0,0.18))",
          translate: `${-jx * 0.6}px 0`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: corPapel,
            clipPath: zigzag(13, 12, true, false),
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              padding: "34px 30px",
              fontFamily: MONO,
              color: corTinta,
            }}
          >
            {children}
          </div>
          {/* sombra do papel entrando no slot */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 60,
              background: "linear-gradient(transparent, rgba(0,0,0,0.12))",
            }}
          />
        </div>
      </div>

      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <ellipse cx={W / 2} cy={H + 18} rx={250} ry={22} fill="rgba(0,0,0,0.16)" />
        {/* tampa */}
        <rect x={40} y={26} width={480} height={90} rx={30} fill="#E4E4DE" />
        <rect x={72} y={34} width={416} height={12} rx={6} fill={corTinta} />
        <rect x={64} y={46} width={432} height={6} rx={3} fill="#C9C9C1" />
        {/* corpo */}
        <rect x={16} y={84} width={528} height={236} rx={44} fill="#FBFBF8" />
        <rect x={16} y={236} width={528} height={84} rx={40} fill="#EEEEE8" />
        <rect x={16} y={236} width={528} height={30} fill="#EEEEE8" />
        <rect x={16} y={232} width={528} height={6} fill="#E0E0D9" />
        {/* painel */}
        <text
          x={64}
          y={168}
          fontFamily={MONO}
          fontWeight={800}
          fontSize={26}
          fill="#A6A69C"
          letterSpacing={3}
        >
          PMG·PRINT
        </text>
        <rect x={392} y={136} width={56} height={34} rx={12} fill="#DADAD2" />
        <circle
          cx={484}
          cy={153}
          r={14}
          fill={ledAceso ? corDestaque : "#CFCFC6"}
        />
        {ledAceso && (
          <circle cx={484} cy={153} r={26} fill={corDestaque} opacity={0.22} />
        )}
        {[0, 1, 2, 3, 4].map((i) => (
          <rect
            key={i}
            x={64 + i * 30}
            y={262}
            width={16}
            height={34}
            rx={8}
            fill="#DCDCD4"
          />
        ))}
      </svg>
    </div>
  );
};

// Linha tracejada de comanda
export const Tracejado: React.FC<{ cor: string }> = ({ cor }) => (
  <div
    style={{
      height: 0,
      borderTop: `4px dashed ${cor}`,
      opacity: 0.45,
      margin: "16px 0",
    }}
  />
);
