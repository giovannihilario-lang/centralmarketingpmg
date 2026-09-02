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
if (!/^\/server\.js$/m.test(vercelIgnore)) {
  console.error("ERRO: /server.js precisa permanecer na .vercelignore para não virar uma função adicional.");
  process.exit(1);
}

try {
  await access(resolve(process.cwd(), "public", "api"), constants.F_OK);
  console.error("ERRO: public/api ainda existe. Essa cópia não deve ser publicada.");
  process.exit(1);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

if (arquivos.length > LIMITE_HOBBY) {
  console.error(`ERRO: ${arquivos.length} funções encontradas em /api. O plano Hobby aceita no máximo ${LIMITE_HOBBY}.`);
  process.exit(1);
}

if (arquivos.length > MARGEM_SEGURA) {
  console.warn(`ATENÇÃO: ${arquivos.length} funções encontradas. O deploy cabe no Hobby, mas está sem margem segura.`);
} else {
  console.log(`OK: ${arquivos.length} funções Serverless. Há margem de ${LIMITE_HOBBY - arquivos.length} no plano Hobby.`);
}

console.log(arquivos.join("\n"));
