import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { zigzag } from "./lib/Visual";
import { CLAMP, EASE_IN, EASE_IN_OUT, EASE_OUT } from "./lib/motion";

type Cor = { cor: string };

// 1) Zoom through: a cena atual explode na câmera, a próxima chega do fundo
const ZoomThrough: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({
  children,
  presentationDirection,
  presentationProgress: p,
}) => {
  if (presentationDirection === "exiting") {
    const e = EASE_IN(p);
    return (
      <AbsoluteFill
        style={{
          scale: String(1 + e * 5),
          opacity: interpolate(p, [0.4, 0.85], [1, 0], CLAMP),
          filter: `blur(${e * 14}px)`,
        }}
      >
        {children}
      </AbsoluteFill>
    );
  }
  const e = EASE_OUT(p);
  return (
    <AbsoluteFill
      style={{
        scale: String(1.7 - 0.7 * e),
        opacity: interpolate(p, [0.25, 0.6], [0, 1], CLAMP),
        filter: `blur(${(1 - e) * 10}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
export const zoomThrough = (): TransitionPresentation<Record<string, never>> => ({
  component: ZoomThrough,
  props: {},
});

// 2) Máscara em formato de comanda (papel serrilhado) que cresce girando
const MascaraComanda: React.FC<TransitionPresentationComponentProps<Cor>> = ({
  children,
  presentationDirection,
  presentationProgress: p,
  passedProps,
}) => {
  if (presentationDirection === "exiting") {
    return <AbsoluteFill style={{ scale: String(1 + EASE_IN(p) * 0.15) }}>{children}</AbsoluteFill>;
  }
  const e = EASE_IN_OUT(p);
  const w = 3000 * e;
  const h = 4200 * e;
  const caixa: React.CSSProperties = {
    position: "absolute",
    left: 540 - w / 2,
    top: 960 - h / 2,
    width: w,
    height: h,
    rotate: `${(1 - e) * -18}deg`,
    clipPath: zigzag(18, Math.max(4, 70 * e), true, true),
    overflow: "hidden",
  };
  return (
    <AbsoluteFill>
      {/* borda de papel ao redor da máscara */}
      <div
        style={{
          ...caixa,
          left: caixa.left as number - 40,
          top: caixa.top as number - 40,
          width: w + 80,
          height: h + 80,
          background: passedProps.cor,
        }}
      />
      <div style={caixa}>
        <div
          style={{
            position: "absolute",
            left: w / 2 - 540,
            top: h / 2 - 960,
            width: 1080,
            height: 1920,
            rotate: `${(1 - e) * 18}deg`,
          }}
        >
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};
export const mascaraComanda = (cor: string): TransitionPresentation<Cor> => ({
  component: MascaraComanda,
  props: { cor },
});

// 3) Encolher: a cena atual vira um ponto enquanto a próxima aparece
const Encolher: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({
  children,
  presentationDirection,
  presentationProgress: p,
}) => {
  if (presentationDirection === "exiting") {
    const e = EASE_IN(p);
    return (
      <AbsoluteFill
        style={{
          scale: String(1 - e * 0.85),
          borderRadius: e * 400,
          overflow: "hidden",
          opacity: interpolate(p, [0.5, 1], [1, 0], CLAMP),
        }}
      >
        {children}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ opacity: interpolate(p, [0, 0.5], [0, 1], CLAMP) }}>
      {children}
    </AbsoluteFill>
  );
};
export const encolher = (): TransitionPresentation<Record<string, never>> => ({
  component: Encolher,
  props: {},
});

// 4) Wipe diagonal com faixa na cor de destaque
const WipeDiagonal: React.FC<TransitionPresentationComponentProps<Cor>> = ({
  children,
  presentationDirection,
  presentationProgress: p,
  passedProps,
}) => {
  if (presentationDirection === "exiting") {
    return (
      <AbsoluteFill style={{ translate: `${EASE_IN(p) * 120}px ${-EASE_IN(p) * 120}px` }}>
        {children}
      </AbsoluteFill>
    );
  }
  const L = EASE_IN_OUT(p) * 3300;
  const tri = (l: number) => `polygon(0px 1920px, 0px ${1920 - l}px, ${l}px 1920px)`;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: passedProps.cor, clipPath: tri(L + 180) }} />
      <AbsoluteFill style={{ background: "#fff", clipPath: tri(L + 60), opacity: 0.9 }} />
      <AbsoluteFill style={{ clipPath: tri(L) }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
export const wipeDiagonal = (cor: string): TransitionPresentation<Cor> => ({
  component: WipeDiagonal,
  props: { cor },
});
