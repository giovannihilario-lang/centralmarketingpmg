import { zColor } from "@remotion/zod-types";
import { z } from "zod";

// Use " / " dentro das frases para quebrar a legenda em telas.
// Cada tela aparece sozinha, com no máximo 2 linhas (quebra automática).
// *palavra* entre asteriscos ganha um bloco na cor de destaque.
export const sextaSchema = z.object({
  corPrincipal: zColor().describe("Fundo sólido (verde PMG)"),
  corDestaque: zColor().describe("Destaque: rastro, carimbo, blocos"),
  corPapel: zColor().describe("Cor do papel das comandas"),
  corTexto: zColor().describe("Texto claro"),
  corTinta: zColor().describe("Texto escuro / tinta"),

  horarioTicket: z.string(),
  fraseCena1: z.string().describe("Gancho. Use ' / ' para separar blocos"),
  contadorInicio: z.number().int(),
  contadorFim: z.number().int(),
  labelContador: z.string(),
  fraseCena2: z.string(),
  produtos: z
    .array(z.string())
    .length(6)
    .describe("Óleo, muçarela, farinha, embalagens, carnes, bebidas"),
  fraseCena3: z.string(),
  labelSuaCozinha: z.string(),
  fraseCena4: z.string(),
  ticketFinalLinha1: z.string(),
  ticketFinalLinha2: z.string(),
  carimbo: z.string(),
  cta: z.string(),
  ctaDestaque: z.string().describe("Trecho do CTA pintado com a cor de destaque"),

  usarTrilha: z.boolean().describe("Liga public/trilha.mp3 (120 BPM)"),
  volumeTrilha: z.number().min(0).max(1),
});

export type SextaProps = z.infer<typeof sextaSchema>;

export const sextaDefaults: SextaProps = {
  corPrincipal: "#0B8A43",
  corDestaque: "#EE2A2B",
  corPapel: "#FFFDF4",
  corTexto: "#FFFFFF",
  corTinta: "#101010",

  horarioTicket: "SEX 19:47",
  fraseCena1: "Sexta, 19h47, salão *lotado* / e a comanda não para de sair",
  contadorInicio: 12,
  contadorFim: 47,
  labelContador: "pedidos na fila",
  fraseCena2:
    "Nessa hora quem segura o seu turno / é o estoque que chegou de manhã",
  produtos: ["Óleo", "Muçarela", "Farinha", "Embalagens", "Carnes", "Bebidas"],
  fraseCena3: "A PMG abastece tudo isso / direto na porta da sua cozinha",
  labelSuaCozinha: "sua cozinha",
  fraseCena4: "para você focar no prato / enquanto a gente cuida do abastecimento",
  ticketFinalLinha1: "PEDIDO: PMG ATACADISTA",
  ticketFinalLinha2: "STATUS: ENTREGUE",
  carimbo: "ENTREGUE",
  cta: "Faça seu pedido em pmg.com.br",
  ctaDestaque: "pmg.com.br",

  usarTrilha: false,
  volumeTrilha: 0.8,
};

// Grade de tempo: 120 BPM @ 30fps = 1 beat a cada 15 frames
export const BEAT = 15;
export const SAFE = { top: 250, bottom: 400, side: 80 } as const;
