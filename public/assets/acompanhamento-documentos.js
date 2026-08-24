/* PMG Connect - Caixa de Entrada de Documentos V1.6.0 */
(() => {
  'use strict';

  const { useEffect, useMemo, useRef, useState } = React;
  const html = htm.bind(React.createElement);
  const DEMO_MODE = new URLSearchParams(location.search).get('demo') === '1';
  const MAX_FILE_SIZE = 15 * 1024 * 1024;

  const TYPES = {
    desconto_nota:{ label:'Desconto em nota', icon:'badge-percent', tone:'emerald' },
    deposito:{ label:'Depósito', icon:'landmark', tone:'violet' },
    extrato_bancario:{ label:'Extrato bancário', icon:'landmark', tone:'forest' },
    nao_identificado:{ label:'Não identificado', icon:'file-question', tone:'slate' },
  };
  const LEGACY_TYPES = Object.freeze({ cadastro_pagamento:'desconto_nota', pedido_compra:'desconto_nota', danfe:'deposito' });
  const normalizeType = value => LEGACY_TYPES[value] || value || 'nao_identificado';
  const STATUS = {
    recebido:{ label:'Recebido', icon:'inbox', tone:'neutral' },
    analisando:{ label:'Lendo documento', icon:'scan-search', tone:'reading' },
    aguardando_conferencia:{ label:'Aguardando conferência', icon:'clipboard-check', tone:'pending' },
    parcialmente_conferido:{ label:'Conferência parcial', icon:'list-checks', tone:'partial' },
    conferido:{ label:'Conferido', icon:'badge-check', tone:'done' },
    erro:{ label:'Leitura interrompida', icon:'triangle-alert', tone:'error' },
    rejeitado:{ label:'Rejeitado', icon:'circle-x', tone:'neutral' },
  };
  const CATEGORIES = {
    cota_anual:'Cota anual', campanha_incentivo:'Campanha de incentivo', feira:'Feira', evento:'Evento',
    acao_trade:'Ação de trade', midia:'Mídia e divulgação', material:'Material promocional',
    bonificacao:'Bonificação', parceria:'Parceria', social:'Responsabilidade social', equipe:'Equipe e pessoas',
    pendencia:'Pendência', outro:'Outro',
  };
  const PAYMENT_METHODS = ['Boleto', 'PIX', 'Transferência bancária', 'TED', 'Depósito', 'Nota fiscal / faturamento', 'Abatimento em verba', 'Bonificação', 'Não informado', 'Outro'];
  const PAYMENT_STATUS = { previsto:'Previsto', solicitado:'Solicitado', aprovado:'Aprovado', agendado:'Agendado', pago:'Pago' };

  const Icon = ({ name, size = 18 }) => html`<i data-lucide=${name} style=${{ width:size, height:size }}></i>`;
  const money = value => value === null || value === undefined || value === '' ? 'Não identificado' : new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(value) || 0);
  const dateTime = value => value ? new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(value)) : '';
  const safeName = value => String(value || 'documento').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/-+/g, '-').slice(0, 90);
  const parseMoney = value => {
    let raw = String(value ?? '').replace(/R\$|\s/g, '');
    if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
    else if (raw.includes(',')) raw = raw.replace(',', '.');
    const parsed = Number(raw.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  const refreshIcons = () => {
    const frame = requestAnimationFrame(() => {
      try { window.lucide?.createIcons({ attrs:{ 'stroke-width':1.9 } }); } catch (_) {}
    });
    return () => cancelAnimationFrame(frame);
  };
  const useLucide = deps => useEffect(refreshIcons, deps);

  function Field({ label, hint, wide = false, children }) {
    return html`<label className=${`doc-field ${wide ? 'wide' : ''}`}><span>${label}${hint ? html`<small>${hint}</small>` : null}</span>${children}</label>`;
  }

  function SetupDocuments() {
    useLucide([]);
    return html`<section className="doc-setup"><div className="doc-setup-orbit"><span></span><i><${Icon} name="scan-line" size=${34}/></i></div><div><span className="eyebrow">Ativação da Caixa de Entrada</span><h2>A interface está pronta para receber os documentos.</h2><p>Execute <code>sql/08-CAIXA-ENTRADA-DOCUMENTOS.sql</code> no SQL Editor do Supabase. Este complemento não altera os acompanhamentos já cadastrados.</p><div className="doc-setup-steps"><span><b>1</b>Executar o SQL 08</span><span><b>2</b>Configurar a leitura protegida</span><span><b>3</b>Atualizar a Central</span></div><button className="button primary" onClick=${() => location.reload()}><${Icon} name="refresh-cw"/>Já executei, verificar agora</button></div></section>`;
  }

  function EmptyInbox({ upload }) {
    useLucide([]);
    return html`<div className="doc-empty"><span><${Icon} name="inbox" size=${34}/></span><h3>A Caixa de Entrada está limpa</h3><p>Envie um PDF para iniciar a leitura e a conferência obrigatória.</p><button className="button primary" onClick=${upload}><${Icon} name="file-up"/>Enviar primeiro PDF</button></div>`;
  }

  function DemoSheet({ item }) {
    const data = item?.dados_extraidos || {};
    const meta = TYPES[normalizeType(item?.tipo)] || TYPES.nao_identificado;
    useLucide([item?.id]);
    return html`<div className="demo-document-sheet"><div className="demo-sheet-bar"><span><${Icon} name=${meta.icon}/></span><div><small>Prévia demonstrativa</small><strong>${meta.label}</strong></div></div><div className="demo-sheet-title"><small>Página ${(item?.paginas || [1]).join(', ')}</small><h3>${data.titulo_sugerido || 'Documento para conferência'}</h3></div><div className="demo-sheet-grid"><span><small>Fornecedor</small><b>${data.fornecedor || 'Não identificado'}</b></span><span><small>Documento</small><b>${data.numero_documento || data.numero_nota || '—'}</b></span><span><small>Valor do documento</small><b>${money(data.valor_total_documento)}</b></span><span className="highlight"><small>Valor sugerido para Marketing</small><b>${money(data.valor_lancamento_sugerido)}</b></span></div><div className="demo-sheet-lines"><i></i><i></i><i></i><i></i><i></i></div>${(data.evidencias || []).length ? html`<div className="demo-sheet-note"><${Icon} name="highlighter"/><span>${data.evidencias[0]}</span></div>` : null}<div className="demo-sheet-stamp">CONFERÊNCIA<br/>OBRIGATÓRIA</div></div>`;
  }

  function DocumentPreview({ entry, item, previewUrl, loading, openOriginal }) {
    const page = item?.paginas?.[0] || 1;
    useLucide([entry?.id, item?.id, previewUrl, loading]);
    return html`<section className="doc-preview"><header><div><span className="eyebrow light">Documento original</span><h3>${entry?.nome_arquivo || 'Selecione um documento'}</h3></div><div><span>Página ${page}${entry?.total_paginas ? ` de ${entry.total_paginas}` : ''}</span><button type="button" onClick=${openOriginal} disabled=${!previewUrl && !DEMO_MODE} title="Abrir PDF"><${Icon} name="external-link"/></button></div></header><div className="doc-preview-stage">${loading ? html`<div className="doc-preview-loading"><span><${Icon} name="loader-circle"/></span><p>Preparando visualização protegida...</p></div>` : DEMO_MODE ? html`<${DemoSheet} item=${item}/>` : previewUrl ? html`<iframe key=${`${previewUrl}-${page}`} src=${`${previewUrl}#page=${page}&toolbar=0&navpanes=0`} title=${`Página ${page} de ${entry?.nome_arquivo}`}></iframe>` : html`<div className="doc-preview-loading"><span><${Icon} name="file-lock-2"/></span><p>Não foi possível carregar a prévia.</p></div>`}</div><footer><${Icon} name="shield-check"/><span>Arquivo privado · acesso temporário</span><b>PDF ${(Number(entry?.tamanho_bytes || 0) / 1024 / 1024).toFixed(1)} MB</b></footer></section>`;
  }

  function EvidencePanel({ data }) {
    const evidences = data?.evidencias || [];
    const alerts = data?.alertas || [];
    const doubts = data?.campos_duvidosos || [];
    useLucide([evidences.length, alerts.length, doubts.length]);
    if (!evidences.length && !alerts.length && !doubts.length) return null;
    return html`<div className="doc-evidence-grid">${evidences.length ? html`<section className="doc-evidence"><span><${Icon} name="scan-text"/></span><div><strong>O que foi reconhecido</strong>${evidences.map(text => html`<p>${text}</p>`)}</div></section>` : null}${alerts.length ? html`<section className="doc-evidence warning"><span><${Icon} name="triangle-alert"/></span><div><strong>Atenção na conferência</strong>${alerts.map(text => html`<p>${text}</p>`)}</div></section>` : null}${doubts.length ? html`<section className="doc-evidence doubt"><span><${Icon} name="help-circle"/></span><div><strong>Campos duvidosos</strong><p>${doubts.join(' · ')}</p></div></section>` : null}</div>`;
  }

  function ReviewedSummary({ item, context, openOriginal }) {
    const record = context.allRecords.find(row => row.id === item.registro_id);
    const ignored = item.status === 'ignorado';
    useLucide([item.id, item.status]);
    return html`<section className=${`reviewed-summary ${ignored ? 'ignored' : ''}`}><span><${Icon} name=${ignored ? 'eye-off' : 'badge-check'} size=${31}/></span><div><small>${ignored ? 'Página ignorada' : 'Conferência concluída'}</small><h3>${ignored ? 'Nenhum lançamento foi criado' : 'Documento vinculado com segurança'}</h3><p>${ignored ? 'O arquivo permanece no histórico da Caixa de Entrada.' : record ? `Vinculado ao acompanhamento #${record.codigo || '—'} · ${record.fornecedor || record.titulo}` : 'A conferência e o responsável foram registrados no histórico.'}</p><div><button className="button secondary small" onClick=${openOriginal}><${Icon} name="file-text"/>Abrir original</button>${record ? html`<button className="button primary small" onClick=${() => context.openRecord(record)}><${Icon} name="arrow-up-right"/>Abrir acompanhamento</button>` : null}</div></div></section>`;
  }

  function ReviewForm({ item, context, onCompleted }) {
    const extracted = item?.dados_extraidos || {};
    const [action, setAction] = useState('novo');
    const [createPayment, setCreatePayment] = useState(true);
    const [recordSearch, setRecordSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const normalizedSearch = recordSearch.toLocaleLowerCase('pt-BR');
    const records = context.allRecords.filter(record => !normalizedSearch || `${record.codigo} ${record.fornecedor} ${record.titulo}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch)).slice(0, 150);
    const defaultValue = extracted.valor_lancamento_sugerido ?? extracted.valor_marketing ?? extracted.valor_total_documento ?? '';
    const defaultDocument = extracted.numero_documento || extracted.numero_nota || extracted.numero_pedido || '';
    const defaultPaymentStatus = extracted.data_pagamento || item.tipo === 'extrato_bancario' ? 'pago' : 'previsto';
    useLucide([item.id, action, createPayment, saving, confirmed, records.length]);

    async function ignoreItem() {
      if (!window.confirm('Ignorar este documento? Nenhum lançamento será criado.')) return;
      if (DEMO_MODE) { context.notify('Modo demonstração: documento marcado como ignorado.', 'info'); onCompleted(item.id); return; }
      setSaving(true);
      try {
        const { error } = await context.client.rpc('aprovar_documento_acompanhamento_v1', { p_item_id:item.id, p_dados:{ acao:'ignorar' } });
        if (error) throw error;
        await context.reload(true); context.notify('Documento ignorado. Nenhum lançamento foi criado.'); onCompleted(item.id);
      } catch (error) { context.notify(error.message || 'Não foi possível ignorar o documento.', 'error'); }
      finally { setSaving(false); }
    }

    async function submit(event) {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      if (!confirmed) return context.notify('Confirme a revisão do documento original.', 'error');
      const recordId = form.get('registro_id') || null;
      if (action !== 'novo' && !recordId) return context.notify('Selecione o acompanhamento relacionado.', 'error');
      const amount = parseMoney(form.get('valor_lancamento'));
      const supplier = String(form.get('fornecedor') || '').trim();
      const documentNumber = String(form.get('numero_documento') || '').trim();
      const paymentStatus = form.get('status_pagamento');
      const paidAt = form.get('data_pagamento') || null;
      const referenceDate = form.get('data_emissao') || paidAt || new Date().toISOString().slice(0, 10);
      const payload = {
        acao:action,
        registro_id:recordId,
        criar_pagamento:action !== 'somente_anexar' && createPayment,
        conferencia_confirmada:true,
        tipo_documento:form.get('tipo_documento'),
        valor_total_documento:parseMoney(form.get('valor_total_documento')),
        valor_marketing:parseMoney(form.get('valor_marketing')),
        acompanhamento:{
          controle:'marketing', ano_referencia:Number(String(referenceDate).slice(0, 4)) || new Date().getFullYear(),
          fornecedor:supplier, fornecedor_codigo:String(form.get('fornecedor_codigo') || '').trim(),
          natureza:form.get('natureza'), impacta_totais:true, categoria:form.get('categoria'),
          titulo:String(form.get('titulo') || '').trim(), descricao:String(form.get('descricao') || '').trim(),
          referencia:`Documento conferido na Caixa de Entrada · ${TYPES[form.get('tipo_documento')]?.label || 'Documento'}`,
          status:'em_andamento', prioridade:'normal', data_inicio:referenceDate, data_fim:null,
          valor_acordado:amount, numero_documento:documentNumber,
          tags:['documento-conferido', String(form.get('tipo_documento') || 'documento'), 'caixa-documentos'],
          observacoes:String(form.get('observacoes') || '').trim(),
          origem_importacao:'caixa_documentos', dados_originais:extracted,
        },
        pagamento:{
          parcela:1, descricao:String(form.get('descricao_pagamento') || '').trim() || `Documento ${documentNumber || item.ordem}`,
          valor_previsto:amount, valor_pago:paymentStatus === 'pago' ? amount : 0,
          vencimento:form.get('vencimento') || null, pago_em:paidAt,
          status:paymentStatus, forma_pagamento:form.get('forma_pagamento') || 'Não informado',
          favorecido:supplier, numero_documento:documentNumber,
          observacoes:`Lançamento criado após conferência obrigatória do PDF ${item.entrada?.nome_arquivo || ''}.`,
        },
      };
      if (DEMO_MODE) { context.notify('Conferência validada. No ambiente real, o lançamento seria criado agora.', 'info'); onCompleted(item.id); return; }
      setSaving(true);
      try {
        const { data, error } = await context.client.rpc('aprovar_documento_acompanhamento_v1', { p_item_id:item.id, p_dados:payload });
        if (error) throw error;
        await context.reload(true); context.notify('Documento conferido e lançamento registrado.'); onCompleted(item.id, data?.registro_id);
      } catch (error) { context.notify(error.message || 'Não foi possível concluir a conferência.', 'error'); }
      finally { setSaving(false); }
    }

    return html`<form className="doc-review-form" onSubmit=${submit}><section className="doc-review-section"><div className="doc-review-heading"><span>01</span><div><small>Decisão humana</small><h3>O que fazer com este documento?</h3></div></div><div className="doc-action-grid">${[
      ['novo','Criar acompanhamento','Novo registro e, se necessário, movimentação financeira','sparkles'],
      ['vincular','Vincular ao existente','Conectar a um acompanhamento já criado','link-2'],
      ['somente_anexar','Somente anexar','Guardar como evidência, sem criar pagamento','paperclip'],
    ].map(([key, label, detail, icon]) => html`<label className=${action === key ? 'active' : ''}><input type="radio" name="acao" value=${key} checked=${action === key} onChange=${() => setAction(key)}/><span><${Icon} name=${icon}/></span><div><strong>${label}</strong><small>${detail}</small></div><i></i></label>`)}</div>${action !== 'novo' ? html`<div className="doc-record-picker"><label><${Icon} name="search"/><input value=${recordSearch} onInput=${event => setRecordSearch(event.target.value)} placeholder="Filtrar pelo fornecedor, código ou projeto..."/></label><select name="registro_id" required><option value="">Selecione o acompanhamento relacionado</option>${records.map(record => html`<option value=${record.id}>#${record.codigo || '—'} · ${record.fornecedor || record.titulo} — ${record.titulo}</option>`)}</select></div>` : null}</section>

      <section className="doc-review-section"><div className="doc-review-heading"><span>02</span><div><small>Classificação</small><h3>Confira a leitura do documento</h3></div><b className=${`doc-confidence ${item.confianca >= .9 ? 'high' : item.confianca >= .7 ? 'medium' : 'low'}`}>${Math.round(Number(item.confianca || 0) * 100)}% de confiança</b></div><div className="doc-form-grid">
        <${Field} label="Tipo de documento"><select name="tipo_documento" defaultValue=${normalizeType(item.tipo)}>${Object.entries(TYPES).map(([key, meta]) => html`<option value=${key}>${meta.label}</option>`)}</select></${Field}>
        <${Field} label="Fornecedor"><input name="fornecedor" defaultValue=${extracted.fornecedor || ''} placeholder="Fornecedor ou parceiro"/></${Field}>
        <${Field} label="Código do fornecedor"><input name="fornecedor_codigo" defaultValue=${extracted.fornecedor_codigo || ''} placeholder="Opcional"/></${Field}>
        <${Field} label="Categoria"><select name="categoria" defaultValue=${extracted.categoria_sugerida || 'outro'}>${Object.entries(CATEGORIES).map(([key, label]) => html`<option value=${key}>${label}</option>`)}</select></${Field}>
        <${Field} label="Natureza financeira"><select name="natureza" defaultValue=${extracted.natureza_sugerida || 'neutro'}><option value="receita">Receita / verba</option><option value="despesa">Despesa / investimento</option><option value="neutro">Sem impacto financeiro</option></select></${Field}>
        <${Field} label="Número do documento"><input name="numero_documento" defaultValue=${defaultDocument} placeholder="Pedido, NF ou comprovante"/></${Field}>
        <${Field} label="Data de emissão"><input name="data_emissao" type="date" defaultValue=${extracted.data_emissao || ''}/></${Field}>
        <${Field} label="Título do acompanhamento" wide=${true}><input name="titulo" defaultValue=${extracted.titulo_sugerido || ''} required=${action === 'novo'} placeholder="Como este lançamento aparecerá na Central"/></${Field}>
        <${Field} label="Descrição identificada" wide=${true}><textarea name="descricao" rows="3" defaultValue=${extracted.descricao || ''}></textarea></${Field}>
      </div><${EvidencePanel} data=${extracted}/></section>

      <section className="doc-review-section money-review"><div className="doc-review-heading"><span>03</span><div><small>Valores e pagamento</small><h3>Defina o que será efetivamente lançado</h3></div></div><div className="doc-values-compare"><label><span>Valor total do documento</span><div><small>R$</small><input name="valor_total_documento" inputMode="decimal" defaultValue=${extracted.valor_total_documento ?? ''}/></div></label><label><span>Valor identificado como Marketing</span><div><small>R$</small><input name="valor_marketing" inputMode="decimal" defaultValue=${extracted.valor_marketing ?? ''}/></div></label><label className="launch-value"><span>Valor que será lançado</span><div><small>R$</small><input name="valor_lancamento" inputMode="decimal" defaultValue=${defaultValue} required/></div></label></div>${action !== 'somente_anexar' ? html`<label className="doc-payment-toggle"><input type="checkbox" checked=${createPayment} onChange=${event => setCreatePayment(event.target.checked)}/><span><i></i></span><div><strong>Criar movimentação financeira</strong><small>Registra previsão, vencimento ou pagamento realizado</small></div></label>` : null}${action !== 'somente_anexar' && createPayment ? html`<div className="doc-form-grid payment-fields">
        <${Field} label="Descrição do pagamento"><input name="descricao_pagamento" defaultValue=${extracted.titulo_sugerido || ''}/></${Field}>
        <${Field} label="Status"><select name="status_pagamento" defaultValue=${defaultPaymentStatus}>${Object.entries(PAYMENT_STATUS).map(([key, label]) => html`<option value=${key}>${label}</option>`)}</select></${Field}>
        <${Field} label="Vencimento"><input name="vencimento" type="date" defaultValue=${extracted.vencimento || ''}/></${Field}>
        <${Field} label="Data realizada"><input name="data_pagamento" type="date" defaultValue=${extracted.data_pagamento || ''}/></${Field}>
        <${Field} label="Forma de pagamento"><select name="forma_pagamento" defaultValue=${extracted.forma_pagamento || 'Não informado'}>${PAYMENT_METHODS.map(method => html`<option value=${method}>${method}</option>`)}</select></${Field}>
        <${Field} label="Observações da conferência" wide=${true}><textarea name="observacoes" rows="3" defaultValue=${extracted.observacoes || ''} placeholder="Registre ajustes ou decisões tomadas durante a conferência."></textarea></${Field}>
      </div>` : html`<input type="hidden" name="data_pagamento" value=${extracted.data_pagamento || ''}/>`}</section>

      <section className="doc-confirmation"><label className=${confirmed ? 'checked' : ''}><input type="checkbox" checked=${confirmed} onChange=${event => setConfirmed(event.target.checked)} required/><span><${Icon} name=${confirmed ? 'check' : 'shield-check'}/></span><div><strong>Conferi o documento original e os valores acima</strong><small>O lançamento somente será liberado após esta confirmação.</small></div></label><div><button type="button" className="button danger-ghost" onClick=${ignoreItem} disabled=${saving}><${Icon} name="eye-off"/>Ignorar documento</button><button type="submit" className="button primary large" disabled=${saving || !confirmed}>${saving ? html`<span className="spinner"></span>` : html`<${Icon} name="badge-check"/>`}Conferir e lançar</button></div></section>
    </form>`;
  }

  function ReviewWorkspace({ entry, items, activeItem, setActiveItemId, context, previewUrl, previewLoading, openOriginal, onCompleted }) {
    const meta = TYPES[normalizeType(activeItem?.tipo)] || TYPES.nao_identificado;
    useLucide([entry?.id, activeItem?.id, items.length]);
    if (!entry || !activeItem) return html`<div className="doc-no-selection"><span><${Icon} name="mouse-pointer-click"/></span><h3>Escolha um documento da fila</h3><p>A prévia e os campos reconhecidos aparecerão aqui.</p></div>`;
    return html`<div className="doc-workspace"><div className="doc-item-tabs">${items.map(item => { const itemMeta = TYPES[normalizeType(item.tipo)] || TYPES.nao_identificado; return html`<button className=${`${item.id === activeItem.id ? 'active' : ''} ${item.status}`} onClick=${() => setActiveItemId(item.id)}><span><${Icon} name=${item.status === 'aprovado' ? 'badge-check' : item.status === 'ignorado' ? 'eye-off' : itemMeta.icon}/></span><div><strong>${itemMeta.label}</strong><small>Página ${(item.paginas || []).join(', ')}</small></div><i>${String(item.ordem).padStart(2, '0')}</i></button>`; })}</div><div className="doc-review-layout"><${DocumentPreview} entry=${entry} item=${activeItem} previewUrl=${previewUrl} loading=${previewLoading} openOriginal=${openOriginal}/><main className="doc-review"><header className="doc-review-top"><div><span className=${`doc-type-badge ${meta.tone}`}><${Icon} name=${meta.icon}/>${meta.label}</span><h2>${activeItem.dados_extraidos?.titulo_sugerido || 'Conferência do documento'}</h2><p>Nenhum campo será lançado antes da sua aprovação.</p></div><span className="mandatory-review"><i></i>Revisão obrigatória</span></header>${activeItem.status === 'aguardando_conferencia' ? html`<${ReviewForm} key=${activeItem.id} item=${activeItem} context=${context} onCompleted=${onCompleted}/>` : html`<${ReviewedSummary} item=${activeItem} context=${context} openOriginal=${openOriginal}/>`}</main></div></div>`;
  }

  function QueueCard({ entry, items, selected, select, remove, removing }) {
    const meta = STATUS[entry.status] || STATUS.recebido;
    const pending = items.filter(item => item.status === 'aguardando_conferencia').length;
    const typeIcons = [...new Set(items.map(item => normalizeType(item.tipo)))].slice(0, 4);
    const locked = items.some(item => item.status === 'aprovado');
    useLucide([entry.id, entry.status, pending, selected, locked, removing]);
    const openWithKeyboard = event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
    };
    return html`<div className=${`doc-queue-card ${selected ? 'active' : ''}`} onClick=${select} onKeyDown=${openWithKeyboard} role="button" tabIndex="0"><span className=${`doc-file-icon ${meta.tone}`}><${Icon} name=${entry.status === 'analisando' ? 'loader-circle' : 'file-text'}/></span><div className="doc-queue-copy"><strong>${entry.nome_arquivo}</strong><small>${entry.total_paginas || '—'} página(s) · ${dateTime(entry.criado_em)}</small><div><span className=${`doc-status ${meta.tone}`}><i></i>${meta.label}</span>${pending ? html`<b>${pending} pendente${pending === 1 ? '' : 's'}</b>` : null}</div></div><span className="doc-type-stack">${typeIcons.map(type => html`<i title=${TYPES[type]?.label || type}><${Icon} name=${TYPES[type]?.icon || 'file-question'}/></i>`)}</span><button type="button" className=${`doc-delete-entry ${locked ? 'locked' : ''}`} disabled=${locked || removing} title=${locked ? 'Documento já vinculado: histórico preservado' : 'Excluir documento'} aria-label=${locked ? 'Documento vinculado não pode ser excluído' : `Excluir ${entry.nome_arquivo}`} onKeyDown=${event => event.stopPropagation()} onClick=${event => { event.stopPropagation(); remove(entry, items); }}>${removing ? html`<${Icon} name="loader-circle"/>` : html`<${Icon} name=${locked ? 'lock-keyhole' : 'trash-2'}/>`}</button></div>`;
  }

  function DocumentInbox({ context }) {
    const fileInput = useRef(null);
    const [selectedEntryId, setSelectedEntryId] = useState(null);
    const [activeItemId, setActiveItemId] = useState(null);
    const [queueFilter, setQueueFilter] = useState('pendentes');
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [busyEntryId, setBusyEntryId] = useState(null);
    const [ocrProgress, setOcrProgress] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [previewLoading, setPreviewLoading] = useState(false);
    const entries = context.documents || [];
    const allItems = context.documentItems || [];
    const pendingCount = allItems.filter(item => item.status === 'aguardando_conferencia').length;
    const analyzingCount = entries.filter(entry => ['recebido', 'analisando'].includes(entry.status)).length;
    const reviewedCount = allItems.filter(item => item.status === 'aprovado').length;
    const filteredEntries = entries.filter(entry => queueFilter === 'todos' || (queueFilter === 'pendentes' ? !['conferido', 'rejeitado'].includes(entry.status) : entry.status === 'conferido'));
    const selectedEntry = entries.find(entry => entry.id === selectedEntryId) || filteredEntries[0] || null;
    const entryItems = allItems.filter(item => item.entrada_id === selectedEntry?.id).sort((a, b) => a.ordem - b.ordem);
    const activeItem = entryItems.find(item => item.id === activeItemId) || entryItems[0] || null;

    useEffect(() => {
      const upload = () => fileInput.current?.click();
      window.addEventListener('pmg:document-upload', upload);
      return () => window.removeEventListener('pmg:document-upload', upload);
    }, []);

    useEffect(() => {
      if (selectedEntry && selectedEntry.id !== selectedEntryId) setSelectedEntryId(selectedEntry.id);
      if (activeItem && activeItem.id !== activeItemId) setActiveItemId(activeItem.id);
    }, [selectedEntry?.id, activeItem?.id]);

    useEffect(() => {
      let active = true;
      setPreviewUrl('');
      if (!selectedEntry || DEMO_MODE || !context.client || !selectedEntry.caminho) return undefined;
      setPreviewLoading(true);
      context.client.storage.from('acompanhamento').createSignedUrl(selectedEntry.caminho, 600).then(({ data, error }) => {
        if (!active) return;
        if (!error) setPreviewUrl(data?.signedUrl || '');
        setPreviewLoading(false);
      });
      return () => { active = false; };
    }, [selectedEntry?.id, selectedEntry?.caminho, context.client]);

    useLucide([entries.length, pendingCount, analyzingCount, reviewedCount, queueFilter, uploading, dragging, selectedEntry?.id, activeItem?.id, ocrProgress?.progress]);

    async function sha256(file) {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function analyzeWithGemini(entryId) {
      let token = await window.PMGConnectAuth?.ensureAccessToken?.();
      if (!token) {
        const { data } = await context.client.auth.getSession();
        token = data?.session?.access_token || '';
      }
      if (!token) throw new Error('A sessão segura não está disponível para o leitor Gemini.');
      setOcrProgress({ progress:.28, label:'Gemini lendo o PDF visualmente...' });
      const response = await fetch('/api/analisar-documento', {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ entrada_id:entryId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.analise) {
        const error = new Error(payload?.erro || `O Gemini não concluiu a leitura (${response.status}).`);
        error.fallbackLocal = payload?.fallback_local !== false;
        throw error;
      }
      setOcrProgress({ progress:.84, label:'Organizando a conferência...' });
      return payload.analise;
    }

    async function analyzeEntry(entryOrId, sourceFile = null) {
      const entryId = typeof entryOrId === 'string' ? entryOrId : entryOrId?.id;
      const entry = typeof entryOrId === 'string' ? entries.find(item => item.id === entryId) : entryOrId;
      if (!entryId) return context.notify('Documento não encontrado para leitura.', 'error');
      if (DEMO_MODE) { context.notify('Modo demonstração: a leitura inteligente foi simulada.', 'info'); return; }
      setBusyEntryId(entryId);
      setOcrProgress({ progress:.05, label:'Preparando a IA Gemini...' });
      try {
        const { error:startError } = await context.client.rpc('iniciar_analise_documento_v1', { p_entrada_id:entryId });
        if (startError) throw startError;
        await context.reload(true);
        let analysis;
        let reader = 'Gemini 3.7 Flash';
        try {
          analysis = await analyzeWithGemini(entryId);
        } catch (geminiError) {
          console.warn('[PMG Documentos] Gemini indisponível; usando OCR local:', geminiError?.message || geminiError);
          context.notify(`${geminiError?.message || 'Gemini indisponível'} Continuando com a contingência local.`, 'info');
          setOcrProgress({ progress:.02, label:'Ativando a contingência local...' });
          let pdfFile = sourceFile;
          if (!pdfFile) {
            if (!entry?.caminho) throw new Error('O arquivo original não foi localizado.');
            const { data:downloaded, error:downloadError } = await context.client.storage.from('acompanhamento').download(entry.caminho);
            if (downloadError || !downloaded) throw downloadError || new Error('Não foi possível baixar o PDF privado para leitura.');
            pdfFile = downloaded;
          }
          if (!window.PMGDocumentOCR?.analyzePdf) throw new Error('Nem o Gemini nem o leitor local estão disponíveis. Atualize a página e tente novamente.');
          analysis = await window.PMGDocumentOCR.analyzePdf(pdfFile, { onProgress:setOcrProgress });
          reader = 'OCR local de contingência';
        }
        setOcrProgress({ progress:.92, label:'Salvando a proposta para conferência...' });
        const { error:saveError } = await context.client.rpc('registrar_analise_documento_v1', {
          p_entrada_id:entryId,
          p_resultado:analysis
        });
        if (saveError) throw saveError;
        await context.reload(true); setSelectedEntryId(entryId); context.notify(`${reader} concluiu a proposta. O documento aguarda sua conferência.`);
      } catch (error) {
        await context.client.rpc('registrar_erro_documento_v1', { p_entrada_id:entryId, p_erro:error.message || 'Falha na leitura do documento.' });
        await context.reload(true); context.notify(error.message || 'Falha na leitura do documento.', 'error');
      } finally { setBusyEntryId(null); setOcrProgress(null); }
    }

    async function manualReview(entry) {
      if (DEMO_MODE) return context.notify('A conferência manual está disponível no ambiente real.', 'info');
      const fallback = { total_paginas:entry.total_paginas || 1, resumo:'Documento encaminhado para conferência manual.', documentos:[{ ordem:1, paginas:[1], tipo:'nao_identificado', confianca:0, titulo_sugerido:'Documento para classificação manual', descricao:'', observacoes:'A leitura automática não foi utilizada.', evidencias:[], alertas:['Preencha e confira todos os campos manualmente.'], campos_duvidosos:['tipo', 'fornecedor', 'valor'] }] };
      const { error } = await context.client.rpc('registrar_analise_documento_v1', { p_entrada_id:entry.id, p_resultado:fallback });
      if (error) return context.notify(error.message, 'error');
      await context.reload(true); context.notify('Documento liberado para conferência manual.', 'info');
    }

    async function deleteEntry(entry, items = []) {
      if (!entry?.id) return;
      if (items.some(item => item.status === 'aprovado')) {
        return context.notify('Este documento já foi vinculado a um lançamento. O histórico precisa ser preservado.', 'error');
      }
      const confirmed = window.confirm(`Excluir "${entry.nome_arquivo}"?\n\nO PDF e toda a leitura pendente serão apagados. Esta ação não pode ser desfeita.`);
      if (!confirmed) return;
      if (DEMO_MODE) return context.notify('Modo demonstração: o documento seria excluído.', 'info');
      setBusyEntryId(entry.id);
      try {
        const { data:path, error } = await context.client.rpc('excluir_entrada_documento_v1', { p_entrada_id:entry.id });
        if (error) {
          if (/excluir_entrada_documento_v1|schema cache|PGRST202/i.test(error.message || '')) {
            throw new Error('Execute o SQL 09 no Supabase para ativar a exclusão de documentos.');
          }
          throw error;
        }
        const storagePath = path || entry.caminho;
        let storageWarning = false;
        if (storagePath) {
          const { error:storageError } = await context.client.storage.from('acompanhamento').remove([storagePath]);
          if (storageError) {
            storageWarning = true;
            console.warn('[PMG Documentos] PDF órfão no Storage:', storageError.message || storageError);
          }
        }
        if (selectedEntryId === entry.id) { setSelectedEntryId(null); setActiveItemId(null); setPreviewUrl(''); }
        await context.reload(true);
        context.notify(storageWarning ? 'Documento removido da fila. O PDF privado precisará de limpeza técnica no Storage.' : 'Documento e leitura pendente excluídos.');
      } catch (error) {
        context.notify(error.message || 'Não foi possível excluir o documento.', 'error');
      } finally { setBusyEntryId(null); }
    }

    async function processFile(file) {
      if (!file) return;
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return context.notify('Envie somente arquivos PDF.', 'error');
      if (file.size > MAX_FILE_SIZE) return context.notify('O PDF deve ter no máximo 15 MB.', 'error');
      if (context.documentsSetupMissing) return context.notify('Execute o SQL 08 antes de enviar documentos.', 'error');
      if (DEMO_MODE) { context.notify('PDF recebido. No ambiente real, a leitura começaria agora.', 'info'); setSelectedEntryId(context.documents[0]?.id); return; }
      setUploading(true);
      let uploadedPath = '';
      try {
        const hash = await sha256(file);
        const { data:duplicate } = await context.client.from('acompanhamento_documentos_entrada').select('id,status').eq('hash_sha256', hash).maybeSingle();
        if (duplicate) { setSelectedEntryId(duplicate.id); context.notify('Este PDF já está na Caixa de Entrada.', 'info'); return; }
        const { data:userData, error:userError } = await context.client.auth.getUser();
        if (userError || !userData?.user) throw userError || new Error('Sessão inválida.');
        uploadedPath = `${userData.user.id}/entrada/${crypto.randomUUID()}-${safeName(file.name)}`;
        const { error:uploadError } = await context.client.storage.from('acompanhamento').upload(uploadedPath, file, { contentType:'application/pdf', upsert:false });
        if (uploadError) throw uploadError;
        const { data:entryId, error:createError } = await context.client.rpc('criar_entrada_documento_v1', {
          p_nome_arquivo:file.name, p_caminho:uploadedPath, p_mime_type:'application/pdf', p_tamanho_bytes:file.size, p_hash_sha256:hash,
        });
        if (createError) throw createError;
        const { data:created } = await context.client.from('acompanhamento_documentos_entrada').select('id,caminho').eq('id', entryId).single();
        if (created?.caminho !== uploadedPath) await context.client.storage.from('acompanhamento').remove([uploadedPath]);
        await context.reload(true); setSelectedEntryId(entryId); context.notify('PDF recebido. Iniciando a leitura inteligente gratuita...', 'info');
        await analyzeEntry(entryId, file);
      } catch (error) {
        if (uploadedPath) await context.client.storage.from('acompanhamento').remove([uploadedPath]);
        context.notify(error.message || 'Não foi possível receber o PDF.', 'error');
      } finally { setUploading(false); if (fileInput.current) fileInput.current.value = ''; }
    }

    function chooseEntry(entry) {
      setSelectedEntryId(entry.id); setActiveItemId(null);
      if (entry.status === 'recebido') void analyzeEntry(entry);
    }

    function onCompleted(itemId) {
      const currentIndex = entryItems.findIndex(item => item.id === itemId);
      const next = entryItems.slice(currentIndex + 1).find(item => item.status === 'aguardando_conferencia') || entryItems.find(item => item.id !== itemId && item.status === 'aguardando_conferencia');
      if (next) setActiveItemId(next.id);
    }

    function openOriginal() {
      if (DEMO_MODE) return context.notify('O PDF original estará disponível no ambiente real.', 'info');
      if (previewUrl) window.open(previewUrl, '_blank', 'noopener,noreferrer');
    }

    if (context.documentsSetupMissing) return html`<${SetupDocuments}/>`;
    return html`<section className="documents-inbox"><header className="documents-hero"><div className="documents-hero-grid"></div><div><span className="documents-live"><i></i>Gemini 3.7 · cota gratuita</span><p className="hero-kicker">Leitura documental inteligente</p><h2>Do PDF à conferência, com contexto visual.</h2><p>A IA interpreta texto, tabelas e destaques do documento; se estiver indisponível, o leitor local assume. Nada entra na Central sem conferência humana.</p><div className="document-models">${Object.entries(TYPES).filter(([key]) => key !== 'nao_identificado').map(([, meta]) => html`<span><${Icon} name=${meta.icon}/>${meta.label}</span>`)}</div></div><div className="document-metrics"><span><small>Aguardando você</small><strong>${pendingCount}</strong><b>documentos</b></span><span><small>Em processamento</small><strong>${analyzingCount}</strong><b>arquivos</b></span><span><small>Conferidos</small><strong>${reviewedCount}</strong><b>lançamentos</b></span></div><button className="documents-upload-orbit" onClick=${() => fileInput.current?.click()} disabled=${uploading || Boolean(busyEntryId)}><i></i><span><${Icon} name=${uploading || busyEntryId ? 'loader-circle' : 'file-up'} size=${25}/></span><strong>${ocrProgress?.label || (uploading ? 'Recebendo...' : 'Enviar PDF')}</strong><small>${ocrProgress ? `${Math.round(Number(ocrProgress.progress || 0) * 100)}% concluído` : 'até 15 MB'}</small>${ocrProgress ? html`<b className="ocr-orbit-progress" style=${{ '--ocr-progress':`${Math.round(Number(ocrProgress.progress || 0) * 100)}%` }}></b>` : null}</button></header>

      <input ref=${fileInput} type="file" accept="application/pdf,.pdf" hidden onChange=${event => processFile(event.target.files?.[0])}/>
      <div className="documents-toolbar"><div className="doc-queue-tabs">${[['pendentes','Para conferir'],['conferidos','Conferidos'],['todos','Todos']].map(([key, label]) => html`<button className=${queueFilter === key ? 'active' : ''} onClick=${() => setQueueFilter(key)}>${label}${key === 'pendentes' && pendingCount ? html`<b>${pendingCount}</b>` : null}</button>`)}</div><div className="documents-safety"><${Icon} name="shield-check"/><span>Conferência obrigatória ativa</span></div></div>

      ${entries.length ? html`<div className="documents-shell"><aside className="documents-queue"><div className="documents-drop-mini" onDragOver=${event => { event.preventDefault(); setDragging(true); }} onDragLeave=${() => setDragging(false)} onDrop=${event => { event.preventDefault(); setDragging(false); processFile(event.dataTransfer.files?.[0]); }} data-dragging=${dragging}><span><${Icon} name="cloud-upload"/></span><div><strong>${dragging ? 'Solte o PDF aqui' : 'Novo documento'}</strong><small>Arraste ou clique para selecionar</small></div><button onClick=${() => fileInput.current?.click()} aria-label="Selecionar PDF"><${Icon} name="plus"/></button></div><div className="documents-queue-list">${filteredEntries.length ? filteredEntries.map(entry => { const items = allItems.filter(item => item.entrada_id === entry.id); return html`<div className="queue-card-wrap"><${QueueCard} entry=${entry} items=${items} selected=${entry.id === selectedEntry?.id} select=${() => chooseEntry(entry)} remove=${deleteEntry} removing=${busyEntryId === entry.id}/>${['erro', 'analisando'].includes(entry.status) ? html`<div className="queue-error-actions"><button onClick=${() => analyzeEntry(entry)} disabled=${busyEntryId === entry.id}><${Icon} name="refresh-cw"/>${entry.status === 'analisando' ? 'Retomar com Gemini' : 'Tentar com Gemini'}</button>${entry.status === 'erro' ? html`<button onClick=${() => manualReview(entry)}><${Icon} name="pencil-line"/>Conferir manualmente</button>` : null}</div>` : null}</div>`; }) : html`<div className="queue-filter-empty"><${Icon} name="check-check"/><span>Nenhum documento nesta seleção.</span></div>`}</div></aside><${ReviewWorkspace} entry=${selectedEntry} items=${entryItems} activeItem=${activeItem} setActiveItemId=${setActiveItemId} context=${context} previewUrl=${previewUrl} previewLoading=${previewLoading} openOriginal=${openOriginal} onCompleted=${onCompleted}/></div>` : html`<${EmptyInbox} upload=${() => fileInput.current?.click()}/>`}
    </section>`;
  }

  window.PMGDocumentModule = Object.freeze({ DocumentInbox });
})();
