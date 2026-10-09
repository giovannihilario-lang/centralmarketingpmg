import React from "react";

// Ícones flat desenhados em SVG (viewBox 240x220, base em y=210)
const S = { stroke: "#151515", strokeWidth: 6, strokeLinejoin: "round" as const };

const Oleo = () => (
  <>
    <rect x={62} y={40} width={116} height={170} rx={22} fill="#F3B61F" {...S} />
    <rect x={62} y={40} width={116} height={50} rx={22} fill="#F7CD55" {...S} />
    <rect x={98} y={14} width={44} height={30} rx={6} fill="#E23B2E" {...S} />
    <path d="M178 70 q40 6 34 50 q-4 20 -34 18" fill="none" {...S} strokeWidth={12} />
    <rect x={80} y={112} width={80} height={56} rx={8} fill="#FFFDF4" {...S} />
    <path d="M120 124 q14 16 0 32 q-14 -16 0 -32z" fill="#F3B61F" {...S} strokeWidth={4} />
  </>
);

const Mucarela = () => (
  <>
    <path d="M24 110 L120 60 L216 110 L216 170 L120 210 L24 170 Z" fill="#FFF3C7" {...S} />
    <path d="M24 110 L120 150 L216 110" fill="none" {...S} />
    <path d="M120 150 L120 210" {...S} />
    <path d="M24 110 L120 150 L120 210 L24 170 Z" fill="#FBE7A1" {...S} />
    <rect x={44} y={150} width={60} height={22} rx={4} fill="#2F7BD8" transform="rotate(22 74 161)" />
    <ellipse cx={150} cy={104} rx={12} ry={6} fill="#F0D98C" />
    <ellipse cx={100} cy={96} rx={9} ry={5} fill="#F0D98C" />
  </>
);

const Farinha = () => (
  <>
    <path d="M50 36 q70 -18 140 0 l14 160 q-84 26 -168 0 Z" fill="#E9D8B8" {...S} />
    <path d="M50 36 q70 14 140 0" fill="none" {...S} />
    <path d="M56 22 l8 18 M80 18 l4 18 M160 18 l-4 18 M184 22 l-8 18" {...S} strokeWidth={5} />
    <rect x={72} y={92} width={96} height={64} rx={10} fill="#FFFDF4" {...S} strokeWidth={5} />
    <path d="M120 100 v48 M120 112 l-14 -8 M120 112 l14 -8 M120 126 l-14 -8 M120 126 l14 -8 M120 140 l-14 -8 M120 140 l14 -8" stroke="#C88A1E" strokeWidth={5} strokeLinecap="round" fill="none" />
  </>
);

const Embalagens = () => (
  <>
    <path d="M20 90 L120 50 L220 90 L220 180 L120 214 L20 180 Z" fill="#C98E4E" {...S} />
    <path d="M20 90 L120 128 L220 90" fill="none" {...S} />
    <path d="M20 90 L120 128 L120 214 L20 180 Z" fill="#B37A3C" {...S} />
    <path d="M70 70 L170 108" stroke="#E8C38E" strokeWidth={18} />
    <path d="M44 128 l50 20 M44 146 l34 13" stroke="#151515" strokeWidth={5} strokeLinecap="round" />
    <path d="M150 150 l40 -14 l0 22 l-40 14 z" fill="#FFFDF4" {...S} strokeWidth={4} />
  </>
);

const Carnes = () => (
  <>
    <path d="M14 140 L40 196 L200 196 L226 140 Z" fill="#F4F4F0" {...S} />
    <path d="M40 140 q-10 -60 60 -74 q80 -18 104 34 q14 36 -24 40 Z" fill="#D9363E" {...S} />
    <path d="M70 120 q20 -30 60 -26 M120 128 q30 -14 56 -8" stroke="#F6C7C7" strokeWidth={9} fill="none" strokeLinecap="round" />
    <path d="M14 140 L226 140" {...S} />
    <path d="M30 140 L60 60 L190 60 L218 140" fill="rgba(255,255,255,0.25)" stroke="rgba(21,21,21,0.25)" strokeWidth={3} />
  </>
);

const Bebidas = () => (
  <>
    {[0, 1, 2, 3].map((i) => (
      <g key={i}>
        <rect x={38 + i * 44} y={20} width={30} height={90} rx={12} fill={i % 2 ? "#3A9A4F" : "#7A4A1E"} {...S} strokeWidth={5} />
        <rect x={44 + i * 44} y={10} width={18} height={14} rx={3} fill="#E23B2E" {...S} strokeWidth={4} />
      </g>
    ))}
    <rect x={18} y={92} width={204} height={118} rx={14} fill="#E23B2E" {...S} />
    <rect x={64} y={118} width={112} height={30} rx={15} fill="#B42620" {...S} strokeWidth={5} />
    <path d="M18 172 h204" {...S} strokeWidth={5} />
  </>
);

const ICONES = [Oleo, Mucarela, Farinha, Embalagens, Carnes, Bebidas];

export const Produto: React.FC<{ indice: number; tamanho: number }> = ({
  indice,
  tamanho,
}) => {
  const Icone = ICONES[indice % ICONES.length];
  return (
    <svg
      width={tamanho}
      height={(tamanho * 220) / 240}
      viewBox="0 0 240 220"
      style={{ overflow: "visible" }}
    >
      <Icone />
    </svg>
  );
};
