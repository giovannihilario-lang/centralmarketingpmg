import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { extname, join, relative } from "node:path";

const LIMITE_HOBBY = 12;
const MARGEM_SEGURA = 10;
const apiDir = "api";
const EXTENSOES = [".js", ".mjs", ".cjs", ".ts"];

async function listarArquivos(dir) {
  const entradas = await readdir(dir, { withFileTypes: true });
  const arquivos = [];
  for (const entrada of entradas) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      arquivos.push(...(await listarArquivos(caminho)));
    } else if (EXTENSOES.includes(extname(entrada.name))) {
      arquivos.push(relative(apiDir, caminho).replace(/\\/g, "/"));
    }
  }
  return arquivos;
}

// server.js sobe no deploy mas não é reconhecido pela Vercel como Serverless
// Function (confirmado em 2026-09-08 testando ao vivo: rotas só existentes
// nele voltam 404 da própria Vercel). Só arquivos dentro de /api viram
// função de fato, um por arquivo (inclusive em subpastas, como
// api/wave2/[...route].js).
const arquivos = (await listarArquivos(apiDir)).sort();
const totalFuncoes = arquivos.length;

try {
  await access(join("public", "api"), constants.F_OK);
  console.error("ERRO: public/api ainda existe. Essa cópia não deve ser publicada.");
  process.exit(1);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

if (totalFuncoes > LIMITE_HOBBY) {
  console.error(`ERRO: ${totalFuncoes} funções encontradas em /api. O plano Hobby aceita no máximo ${LIMITE_HOBBY}.`);
  process.exit(1);
}

if (totalFuncoes > MARGEM_SEGURA) {
  console.warn(`ATENÇÃO: ${totalFuncoes} funções encontradas. O deploy cabe no Hobby, mas está sem margem segura.`);
} else {
  console.log(`OK: ${totalFuncoes} funções Serverless em /api. Há margem de ${LIMITE_HOBBY - totalFuncoes} no plano Hobby.`);
}

console.log(arquivos.join("\n"));
