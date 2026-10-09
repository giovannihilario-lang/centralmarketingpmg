import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COMANDA_H, COMANDA_W, Comanda, gerarComandas } from "../lib/Comandas";
import { MONO } from "../lib/fontes";
import { Legenda, telas } from "../lib/Legenda";
import { CLAMP, EASE_IN, EASE_OUT, drift, pop, shake, squash } from "../lib/motion";
import { Produto } from "../lib/Produtos";
import { Rastro } from "../lib/Rastro";
import { Fundo, Particulas } from "../lib/Visual";
import type { SextaProps } from "../schema";
import { CONGELA, DURACAO_CENA2, estadoComanda, zoomCena2 } from "./Cena2Caos";

// Geometria da prateleira (compartilhada com a Cena 4)
export const PRATELEIRA = {
  x: 95,
  y: 330,
  w: 890,
  h: 740,
  planks: [700, 1040], // topo de cada tábua
  colunas: [243, 540, 837],
} as const;
const PECA = 266;

// Ordem estilo Tetris: enche de baixo pra cima
const SLOTS = [
  { col: 0, row: 1 },
  { col: 2, row: 1 },
  { col: 1, row: 1 },
  { col: 1, row: 0 },
  { col: 0, row: 0 },
  { col: 2, row: 0 },
];
const PRIMEIRO_POUSO = 30; // no beat
const LIMPA = 120; // linha completa

export const pousoPeca = (k: number) => PRIMEIRO_POUSO + k * 15;

// Cena 3 — O Tetris da cozinha (frames 180–330)
export const Cena3Tetris: React.FC<SextaProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const comandas = useMemo(() => gerarComandas(), []);

  const pousos = SLOTS.map((_, k) => pousoPeca(k));
  const cam = shake(frame, [0, ...pousos, LIMPA], 9, 7);
  const entradaPrateleira = pop(frame, fps, 2, { damping: 12 });

  const blocos = telas(p.fraseCena3);
  const meio = 96;
  const agenda = blocos.map((texto, i) => ({
    texto,
    inicio: i === 0 ? 40 : meio + (i - 1) * 40,
    fim: i === blocos.length - 1 ? 175 : i === 0 ? meio : meio + i * 40,
  }));

  return (
    <AbsoluteFill>
      <Fundo cor={p.corPrincipal} seed={3} />
      <AbsoluteFill
        style={{
          translate: `${cam.x}px ${cam.y + drift(frame, 7, 6)}px`,
          rotate: `${cam.r}deg`,
        }}
      >
        <AbsoluteFill
          style={{
            scale: String(0.82 + 0.18 * entradaPrateleira),
            opacity: interpolate(frame, [1, 6], [0, 1], CLAMP),
          }}
        >
          <Prateleira {...p} frame={frame} />
          {SLOTS.map((slot, k) => (
            <Peca
              key={k}
              k={k}
              slot={slot}
              frame={frame}
              fps={fps}
              rotulo={p.produtos[k] ?? ""}
              {...p}
            />
          ))}
          <BrilhoLinha frame={frame} />
        </AbsoluteFill>
      </AbsoluteFill>

      {/* Comandas explodindo para fora da tela */}
      {frame < 18 && (
        <AbsoluteFill style={{ scale: String(zoomCena2(DURACAO_CENA2)) }}>
          {comandas.map((c) => {
            const base = estadoComanda(c, CONGELA, fps);
            if (!base.visivel) return null;
            const dx = base.x - 540;
            const dy = base.y - 960;
            const d = Math.max(1, Math.hypot(dx, dy));
            return (
              <Rastro
                key={c.id}
                frame={frame}
                samples={4}
                shutter={1.4}
                intensidade={0.4}
                render={(f) => {
                  const t = interpolate(f, [0, 15], [0, 1], { ...CLAMP, easing: EASE_IN });
                  return (
                    <div
                      style={{
                        position: "absolute",
                        left: base.x - COMANDA_W / 2 + (dx / d) * 1700 * t,
                        top: base.y - COMANDA_H / 2 + (dy / d) * 1700 * t,
                        rotate: `${base.rot + Math.sign(dx) * 260 * t}deg`,
                        scale: String(1 + t * 0.5),
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
      )}

      {agenda.map((a, i) => (
        <Legenda
          key={i}
          texto={a.texto}
          inicio={a.inicio}
          fim={a.fim}
          variante="mascara"
          posicao="base"
          corTexto={p.corTexto}
          corDestaque={p.corDestaque}
        />
      ))}
    </AbsoluteFill>
  );
};

const Prateleira: React.FC<SextaProps & { frame: number }> = (p) => {
  const { x, y, w, h, planks } = PRATELEIRA;
  const cel = w / 9;
  return (
    <>
      {/* fundo da prateleira = poço do Tetris */}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: w,
          height: h,
          borderRadius: 26,
          background: "rgba(0,0,0,0.13)",
          backgroundImage: `linear-gradient(rgba(255,255,255,0.07) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.07) 2px, transparent 2px)`,
          backgroundSize: `${cel}px ${cel}px`,
          backgroundPosition: "-1px -1px",
        }}
      />
      {/* montantes */}
      {[x - 6, x + w - 22].map((lx, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: lx,
            top: y - 20,
            width: 28,
            height: h + 60,
            borderRadius: 10,
            background: p.corPapel,
            boxShadow: "0 10px 0 rgba(0,0,0,0.15)",
          }}
        />
      ))}
      {/* tábuas com face superior em perspectiva */}
      {planks.map((py, i) => (
        <React.Fragment key={i}>
          <div
            style={{
              position: "absolute",
              left: x - 20,
              top: py - 18,
              width: w + 40,
              height: 18,
              background: "#EDEDE6",
              clipPath: "polygon(3% 0, 97% 0, 100% 100%, 0 100%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: x - 20,
              top: py,
              width: w + 40,
              height: 40,
              borderRadius: 6,
              background: p.corPapel,
              boxShadow: "0 12px 0 rgba(0,0,0,0.15)",
            }}
          />
        </React.Fragment>
      ))}
    </>
  );
};

const Peca: React.FC<
  SextaProps & {
    k: number;
    slot: { col: number; row: number };
    frame: number;
    fps: number;
    rotulo: string;
  }
> = ({ k, slot, frame, fps, rotulo, ...p }) => {
  const pouso = pousoPeca(k);
  const cx = PRATELEIRA.colunas[slot.col];
  const baseY = PRATELEIRA.planks[slot.row] - 16;
  const altura = (PECA * 220) / 240;
  if (frame < pouso - 12) return null;

  const s = frame >= pouso ? pop(frame, fps, pouso, { damping: 7, stiffness: 300 }) : 1;
  const sq = frame >= pouso ? squash(s, 0.28) : { scaleX: 0.9, scaleY: 1.14 };
  const flash = interpolate(frame, [pouso, pouso + 1, pouso + 8], [0, 0.85, 0], CLAMP);
  const brilho = interpolate(
    frame,
    [LIMPA + slot.row * 3, LIMPA + 4 + slot.row * 3, LIMPA + 16],
    [1, 1.9, 1],
    CLAMP,
  );
  const etiqueta = pop(frame, fps, pouso + 3, { damping: 6, stiffness: 140 });

  return (
    <>
      <Rastro
        frame={frame}
        samples={frame < pouso ? 4 : 1}
        shutter={1.5}
        render={(f) => {
          const top = interpolate(f, [pouso - 11, pouso], [-420, baseY - altura], {
            ...CLAMP,
            easing: EASE_IN,
          });
          const rot = interpolate(f, [pouso - 8, pouso - 5], [90, 0], {
            ...CLAMP,
            easing: EASE_OUT,
          });
          return (
            <div
              style={{
                position: "absolute",
                left: cx - PECA / 2,
                top,
                width: PECA,
                height: altura,
                rotate: `${rot}deg`,
                scale: `${sq.scaleX} ${sq.scaleY}`,
                transformOrigin: "50% 100%",
                filter: `brightness(${brilho})`,
              }}
            >
              <Produto indice={k} tamanho={PECA} />
            </div>
          );
        }}
      />
      {/* flash do encaixe */}
      <div
        style={{
          position: "absolute",
          left: cx - 150,
          top: baseY - 330,
          width: 300,
          height: 330,
          borderRadius: 18,
          background: "#fff",
          opacity: flash,
        }}
      />
      <Particulas
        x={cx}
        y={baseY}
        inicio={pouso}
        cores={["#ffffff", p.corPapel, p.corDestaque]}
        qtd={10}
        forca={18}
        seed={k + 3}
      />
      {/* etiqueta pendurada na tábua */}
      {frame >= pouso + 3 && (
        <div
          style={{
            position: "absolute",
            left: cx - 110,
            top: PRATELEIRA.planks[slot.row] + 10,
            width: 220,
            textAlign: "center",
            transformOrigin: "50% 0%",
            scale: String(etiqueta),
            rotate: `${(1 - etiqueta) * 30 + drift(frame, k, 2.5)}deg`,
          }}
        >
          <span
            style={{
              display: "inline-block",
              background: k % 2 ? p.corDestaque : p.corTinta,
              color: p.corTexto,
              fontFamily: MONO,
              fontWeight: 800,
              fontSize: 26,
              padding: "6px 14px",
              borderRadius: 6,
              textTransform: "uppercase",
              boxShadow: "0 6px 0 rgba(0,0,0,0.18)",
            }}
          >
            {rotulo}
          </span>
        </div>
      )}
    </>
  );
};

// Brilho varrendo as linhas completas, igual ao Tetris
const BrilhoLinha: React.FC<{ frame: number }> = ({ frame }) => (
  <>
    {PRATELEIRA.planks.map((py, row) => {
      const t0 = LIMPA + row * 3;
      const x = interpolate(frame, [t0, t0 + 12], [-300, 1200], {
        ...CLAMP,
        easing: EASE_OUT,
      });
      const op = interpolate(frame, [t0, t0 + 2, t0 + 12, t0 + 16], [0, 1, 1, 0], CLAMP);
      return (
        <div
          key={row}
          style={{
            position: "absolute",
            left: PRATELEIRA.x,
            top: py - 320,
            width: PRATELEIRA.w,
            height: 320,
            overflow: "hidden",
            opacity: op,
            borderRadius: 18,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.28)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: -40,
              left: x - PRATELEIRA.x,
              width: 160,
              height: 400,
              rotate: "18deg",
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent)",
            }}
          />
        </div>
      );
    })}
  </>
);
