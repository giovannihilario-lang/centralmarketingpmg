import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import React from "react";
import { AbsoluteFill, staticFile, useVideoConfig } from "remotion";
import { Cena1Gancho } from "./cenas/Cena1Gancho";
import { Cena2Caos } from "./cenas/Cena2Caos";
import { Cena3Tetris } from "./cenas/Cena3Tetris";
import { Cena4Rota } from "./cenas/Cena4Rota";
import { Cena5Final } from "./cenas/Cena5Final";
import { Grao } from "./lib/Visual";
import type { SextaProps } from "./schema";
import { encolher, mascaraComanda, wipeDiagonal, zoomThrough } from "./transicoes";

// Cada transição começa exatamente no corte do roteiro (60, 180, 330, 450 —
// todos múltiplos de 15 = no beat de 120 BPM). Por isso cada cena dura
// "tempo do roteiro + duração da transição seguinte".
// 70 + 132 + 162 + 130 + 150 − (10 + 12 + 12 + 10) = 600 frames
export const Sexta1947: React.FC<SextaProps> = (p) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: p.corPrincipal }}>
      <TransitionSeries>
        <TransitionSeries.Sequence name="1 · Gancho" durationInFrames={70} premountFor={fps}>
          <Cena1Gancho {...p} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={zoomThrough()}
          timing={linearTiming({ durationInFrames: 10 })}
        />
        <TransitionSeries.Sequence name="2 · O caos" durationInFrames={132} premountFor={fps}>
          <Cena2Caos {...p} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={mascaraComanda(p.corPapel)}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence name="3 · Tetris" durationInFrames={162} premountFor={fps}>
          <Cena3Tetris {...p} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={encolher()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence name="4 · A rota" durationInFrames={130} premountFor={fps}>
          <Cena4Rota {...p} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipeDiagonal(p.corDestaque)}
          timing={linearTiming({ durationInFrames: 10 })}
        />
        <TransitionSeries.Sequence name="5 · Final + CTA" durationInFrames={150} premountFor={fps}>
          <Cena5Final {...p} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <Grao />

      {p.usarTrilha && (
        <Audio src={staticFile("trilha.mp3")} volume={p.volumeTrilha} />
      )}
    </AbsoluteFill>
  );
};
