import React from "react";

// Motion blur simulado: desenha "fantasmas" do elemento em sub-frames anteriores.
// Parado, os fantasmas ficam embaixo do original e somem; rápido, viram rastro.
export const Rastro: React.FC<{
  frame: number;
  render: (f: number) => React.ReactNode;
  samples?: number;
  shutter?: number; // em frames
  intensidade?: number;
}> = ({ frame, render, samples = 4, shutter = 1.2, intensidade = 0.35 }) => {
  return (
    <>
      {Array.from({ length: samples }).map((_, i) => {
        const k = samples - 1 - i; // desenha do mais antigo para o atual
        const f = frame - (k * shutter) / Math.max(1, samples - 1);
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              inset: 0,
              opacity: k === 0 ? 1 : intensidade * (1 - k / samples),
            }}
          >
            {render(f)}
          </div>
        );
      })}
    </>
  );
};
