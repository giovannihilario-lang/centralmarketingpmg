import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { extname, resolve } from "node:path";

const LIMITE_HOBBY = 12;
const MARGEM_SEGURA = 10;
const apiDir = resolve(process.cwd(), "api");
const arquivos = (await readdir(apiDir, { withFileTypes: true }))
  .filter((item) => item.isFile() && [".js", ".mjs", ".cjs", ".ts"].includes(extname(item.name)))
  .map((item) => item.name)
  .sort();

const vercelIgnore = await readFile(resolve(process.cwd(), ".vercelignore"), "utf8");
if (/^\/server\.js$/m.test(vercelIgnore)) {
  console.error("ERRO: /server.js não pode estar na .vercelignore; ele é o entrypoint Express exigido pela Vercel.");
  process.exit(1);
}

await access(resolve(process.cwd(), "server.js"), constants.F_OK);
const totalFuncoes = arquivos.length + 1;

try {
  await access(resolve(process.cwd(), "public", "api"), constants.F_OK);
  console.error("ERRO: public/api ainda existe. Essa cópia não deve ser publicada.");
  process.exit(1);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

if (totalFuncoes > LIMITE_HOBBY) {
  console.error(`ERRO: ${totalFuncoes} funções encontradas (${arquivos.length} em /api + Express). O plano Hobby aceita no máximo ${LIMITE_HOBBY}.`);
  process.exit(1);
}

if (totalFuncoes > MARGEM_SEGURA) {
  console.warn(`ATENÇÃO: ${totalFuncoes} funções encontradas. O deploy cabe no Hobby, mas está sem margem segura.`);
} else {
  console.log(`OK: ${totalFuncoes} funções Serverless (${arquivos.length} rotas + Express). Há margem de ${LIMITE_HOBBY - totalFuncoes} no plano Hobby.`);
}

console.log("server.js (Express)");
console.log(arquivos.join("\n"));
