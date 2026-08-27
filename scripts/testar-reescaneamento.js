import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/assets/acompanhamento-documentos.js', import.meta.url), 'utf8');
const marker = '    if (context.documentsSetupMissing) return html`<${SetupDocuments}/>`;';
assert.ok(source.includes(marker));
const code = source.replace(marker, 'globalThis.__ACTIONS__ = { rescanEntry, analyzeEntry }; return null;')
  .replace('Object.freeze({ DocumentInbox })', 'Object.freeze({ DocumentInbox, canRescanDocument })');
const entry = { id:'pdf-1', nome_arquivo:'teste.pdf', caminho:'privado/teste.pdf', status:'aguardando_conferencia', atualizado_em:'2026-08-27T10:00:00.123456+00:00' };
const item = { id:'item-1', entrada_id:entry.id, status:'aguardando_conferencia', ordem:1, dados_extraidos:{ valor_marketing:100 } };
let context;
const state = { confirmed:true, calls:[], notices:[], error:null, rpcError:null, reloadError:false, hold:null, analysis:{ total_paginas:1, documentos:[{ tipo:'deposito', valor_marketing:200 }] } };
const noop = () => {};
const hooks = []; let cursor = 0;
const sandbox = {
  console, URLSearchParams, Intl, Date, Map, Set, location:{ search:'' },
  requestAnimationFrame:() => 1, cancelAnimationFrame:noop,
  React:{ createElement:noop, useEffect:noop, useMemo:fn => fn(),
    useState(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current:initial }; return hooks[index]; },
  }, htm:{ bind:() => noop },
  confirm:() => { state.calls.push('confirm'); return state.confirmed; },
  PMGDocumentOCR:{ analyzePdf:() => { throw new Error('O reescaneamento explícito com IA não deve substituir a leitura por OCR.'); } },
  async fetch(url, options) {
    state.calls.push({ fetch:url, body:JSON.parse(options.body) });
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    if (state.hold) await state.hold;
    if (state.error) return { ok:false, status:503, json:async () => ({ erro:state.error }) };
    return { ok:true, json:async () => ({ analise:state.analysis }) };
  },
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.runInNewContext(code, sandbox);
const { DocumentInbox, canRescanDocument, analysisRegression, analysisQuality } = sandbox.PMGDocumentModule;
function render() { cursor = 0; DocumentInbox({ context }); return sandbox.__ACTIONS__; }
function reset() {
  state.calls = []; state.notices = []; state.confirmed = true; state.error = null; state.rpcError = null; state.reloadError = false; state.hold = null;
  context = {
    documents:[{ ...entry }], documentItems:[structuredClone(item)],
    notify:(message, tone) => state.notices.push({ message, tone }),
    reload:async () => { if (state.reloadError) throw new Error('Sem conexão'); return true; },
    client:{ auth:{ getSession:async () => ({ data:{ session:{ access_token:'test-token' } } }) },
      rpc:async (name, args) => {
        state.calls.push({ rpc:name, args });
        assert.equal(name, 'reescanear_documento_v1', 'Não deve iniciar/apagar a análise nem marcar erro no banco.');
        return { data:1, error:state.rpcError };
      },
    },
  };
  return render();
}
assert.equal(canRescanDocument(entry, [item]), true);
for (const status of ['conferido', 'parcialmente_conferido', 'rejeitado', 'recebido']) assert.equal(canRescanDocument({ ...entry, status }, [item]), false);
assert.equal(canRescanDocument(entry, []), false);
for (const changes of [{ status:'aprovado' }, { status:'ignorado' }, { registro_id:'r1' }, { pagamento_id:'p1' }, { conferido_em:entry.atualizado_em }]) {
  assert.equal(canRescanDocument(entry, [{ ...item, ...changes }]), false);
}

const richPrevious = [1,2,3].map(index => ({
  tipo:'desconto_nota', confianca:.9, dados_extraidos:{ fornecedor:`Fornecedor ${index}`, numero_documento:`DOC${index}`, data_emissao:'2026-08-01', valor_total_documento:1000, valor_lancamento_sugerido:100, evidencias:['MKT R$ 100,00'] },
}));
const weakNext = { documentos:[{ tipo:'nao_identificado', confianca:.25, fornecedor:null, numero_documento:null, valor_total_documento:null, valor_lancamento_sugerido:null, campos_duvidosos:['tipo','fornecedor','valor'] }] };
assert.ok(analysisQuality(richPrevious) > analysisQuality(weakNext.documentos));
assert.equal(analysisRegression(richPrevious, weakNext).blocked, true, 'Reescaneamento não deve substituir uma leitura claramente melhor por uma pior.');

let actions = reset(); state.confirmed = false;
assert.equal(await actions.rescanEntry(entry), false);
assert.deepEqual(state.calls, ['confirm']);

actions = reset(); state.error = 'A leitura visual está ocupada. Tente novamente.';
const previous = JSON.stringify(context);
assert.equal(await actions.rescanEntry(entry), false);
assert.equal(state.calls.filter(call => call.rpc).length, 0);
assert.equal(JSON.stringify(context), previous);
assert.match(state.notices.at(-1).message, /leitura anterior foi mantida/);

actions = reset();
assert.equal(await actions.rescanEntry(entry), true);
const saved = state.calls.find(call => call.rpc);
const visualCall = state.calls.find(call => call.fetch);
assert.equal(visualCall.body.modo, 'reescan');
assert.equal(saved.args.p_versao_esperada, entry.atualizado_em);
assert.equal(saved.args.p_resultado.documentos[0].valor_marketing, 200);
assert.match(state.notices.at(-1).message, /Confira os novos campos/);

actions = reset(); state.rpcError = { code:'PGRST202', message:'Function not found' };
assert.equal(await actions.rescanEntry(entry), false);
assert.match(state.notices.at(-1).message, /24-REESCANEAR-DOCUMENTO-V2.3.9.sql/);

actions = reset(); state.rpcError = { message:'O documento mudou durante a leitura.' };
assert.equal(await actions.rescanEntry(entry), false);
assert.match(state.notices.at(-1).message, /documento mudou/);

actions = reset(); state.reloadError = true;
assert.equal(await actions.rescanEntry(entry), true, 'Falha de recarga após gravar não é falha de gravação.');
assert.match(state.notices.at(-1).message, /Nova leitura salva/);
assert.doesNotMatch(state.notices.at(-1).message, /anterior foi mantida/);

actions = reset(); context.documentItems[0].status = 'aprovado';
assert.equal(await actions.rescanEntry(entry), false);
assert.equal(state.calls.length, 0);
actions = reset();
assert.equal(await actions.rescanEntry({ ...entry, atualizado_em:null }), false);
assert.equal(state.calls.length, 0);

actions = reset();
let release; state.hold = new Promise(resolve => { release = resolve; });
const first = actions.rescanEntry(entry);
assert.equal(await actions.rescanEntry(entry), false);
release(); assert.equal(await first, true);
assert.equal(state.calls.filter(call => call.fetch).length, 1);
assert.equal(state.calls.filter(call => call.rpc).length, 1);

actions = reset(); const valid = state.analysis; state.analysis = { documentos:[] };
assert.equal(await actions.rescanEntry(entry), false);
assert.equal(state.calls.filter(call => call.rpc).length, 0); state.analysis = valid;

// Contrato SQL (sem executar migrações no banco publicado).
const sql = fs.readFileSync(new URL('../sql/24-REESCANEAR-DOCUMENTO-V2.3.9.sql', import.meta.url), 'utf8');
for (const fragment of ["set search_path = ''", 'public.meu_colaborador_id()', 'for update', 'is distinct from p_versao_esperada', "status <> 'aguardando_conferencia'", 'conferido_em is not null', 'registro_id is not null', 'pagamento_id is not null', 'return public.registrar_analise_documento_v1', 'from public, anon', 'to authenticated', 'begin;', 'commit;']) assert.ok(sql.includes(fragment), fragment);
assert.doesNotMatch(sql, /grant (insert|update|delete) on/i);
assert.match(source, /fieldset className="doc-review-lock" disabled=\$\{busy\}/);
assert.match(source, /doc-rescan-button/);
assert.match(source, /doc-rescan-idle/);
assert.match(source, /doc-rescan-spinner/);
assert.doesNotMatch(source, /rescanning \? html`<span className="spinner"><\/span>` : html`<\$\{Icon\} name="scan-line"\/>`/);
const appSource = fs.readFileSync(new URL('../public/assets/acompanhamento.js', import.meta.url), 'utf8');
assert.match(appSource, /class AppErrorBoundary extends React\.Component/);
assert.match(appSource, /class DocumentErrorBoundary extends React\.Component/);
assert.match(appSource, /<\$\{AppErrorBoundary\}><\$\{App\}\/><\/\$\{AppErrorBoundary\}>/);
assert.match(source, /Reescanear com IA/);
assert.match(source, /analysisRegression\(items, analysis\)/);
assert.match(source, /OCR local/);
assert.match(source, /IA Gemini/);
console.log(JSON.stringify({ status:'ok', tests:['permissão por estado', 'confirmação', 'falha da IA preserva leitura', 'sem fallback no reescaneamento', 'troca com versão', 'SQL ausente', 'conflito de conferência', 'falha de recarga após salvar', 'clique duplo', 'resultado vazio', 'DOM estável no reescaneamento', 'barreira contra tela branca'], liveDatabaseAccess:false, sqlExecuted:false }));
