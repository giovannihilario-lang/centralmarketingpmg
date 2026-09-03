export const WAVE2_BUCKET = 'pmg-supplier-assets';
export const WAVE2_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const WAVE2_ALLOWED_MIMES = ['image/jpeg','image/png','image/webp','application/pdf'];

export function normText(value='') {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9@.+]+/g,' ').replace(/\s+/g,' ').trim();
}
export function normDigits(value='') { return String(value ?? '').replace(/\D+/g,''); }
export function dateKey(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function addDays(date, days) { const d=new Date(`${dateKey(date)}T12:00:00`); d.setDate(d.getDate()+Number(days||0)); return dateKey(d); }
export function daysBetween(a,b){const x=new Date(`${dateKey(a)}T12:00:00`),y=new Date(`${dateKey(b)}T12:00:00`);return Math.round((y-x)/86400000);}
export function todayKey(now=new Date()){return dateKey(now);}

export function saoPauloDateKey(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const m=Object.fromEntries(parts.map(x=>[x.type,x.value])); return `${m.year}-${m.month}-${m.day}`;
}

export function obligationDirection(status, requested='fornecedor') {
  if (['aprovado','dispensado'].includes(status)) return 'concluido';
  if (['recebido','em_revisao'].includes(status)) return 'pmg';
  if (status === 'ajuste_solicitado') return 'fornecedor';
  return ['pmg','fornecedor'].includes(requested) ? requested : 'fornecedor';
}
export function obligationFlags(row, now=new Date()) {
  const today=todayKey(now), due=dateKey(row?.prazo);
  const done=['aprovado','dispensado'].includes(row?.status) || row?.direcao_responsabilidade==='concluido';
  const overdue=Boolean(due && !done && due < today);
  const dueSoon=Boolean(due && !done && due>=today && daysBetween(today,due)<=7);
  return {done,overdue,dueSoon,waitingSupplier:!done&&row?.direcao_responsabilidade==='fornecedor',waitingPmg:!done&&row?.direcao_responsabilidade==='pmg'};
}

export function aggregateCalendarEvents({tasks=[],campaigns=[],payments=[],trainings=[],obligations=[]}={}) {
  const out=[];
  for (const task of tasks) {
    const d=dateKey(task.prazo_em||task.prazo);
    if (!d || task.arquivada_em || task.status==='concluida') continue;
    out.push({id:`demand:${task.id}`,source:'demandas',entityType:'demanda',entityId:task.id,title:task.titulo,date:d,time:String(task.prazo_em||'').slice(11,16)||'',status:task.status,priority:task.prioridade,supplierId:task.fornecedor_id||null,responsibleId:task.responsavel_id||null,campaignId:task.campanha_ref||null,href:`/demandas.html?tarefa=${encodeURIComponent(task.id)}`});
  }
  for (const c of campaigns) {
    const start=dateKey(c.startDate||c.currentStart||c.period?.current?.start),end=dateKey(c.endDate||c.currentEnd||c.period?.current?.end);
    const supplierIds=[...new Set((c.supplierIds||[]).map(String).filter(Boolean))];
    const supplierId=supplierIds.length===1?supplierIds[0]:null;
    if(start)out.push({id:`campaign-start:${c.id}`,source:'campanhas',entityType:'campanha',entityId:c.id,title:`Início · ${c.name||c.title||'Campanha'}`,date:start,status:'inicio',priority:'normal',supplierId,supplierIds,campaignId:c.id,href:`/campanhas.html?campanha=${encodeURIComponent(c.id)}`});
    if(end)out.push({id:`campaign-end:${c.id}`,source:'campanhas',entityType:'campanha',entityId:c.id,title:`Fim · ${c.name||c.title||'Campanha'}`,date:end,status:'fim',priority:'alta',supplierId,supplierIds,campaignId:c.id,href:`/campanhas.html?campanha=${encodeURIComponent(c.id)}`});
  }
  for (const p of payments) {
    const d=dateKey(p.vencimento); if(!d || ['pago','cancelado'].includes(p.status))continue;
    out.push({id:`payment:${p.id}`,source:'financeiro',entityType:'pagamento',entityId:p.id,title:p.titulo||p.descricao||'Pagamento',date:d,status:p.status,priority:d<todayKey()?'urgente':'normal',supplierId:p.fornecedor_id||null,responsibleId:p.responsavel_id||null,href:`/acompanhamento.html?view=pagamentos&registro=${encodeURIComponent(p.registro_id||'')}`});
  }
  for (const t of trainings) {
    const d=dateKey(t.inicio_em); if(!d || t.status==='cancelada' || t.ativo===false)continue;
    out.push({id:`training:${t.id}`,source:'academia',entityType:'treinamento',entityId:t.id,title:t.titulo,date:d,time:String(t.inicio_em||'').slice(11,16),status:t.status,priority:'normal',supplierId:t.fornecedor_id||null,href:`/demandas.html?view=academia&treinamento=${encodeURIComponent(t.id)}`});
  }
  for (const o of obligations) {
    const d=dateKey(o.prazo); const flags=obligationFlags(o); if(!d||flags.done)continue;
    out.push({id:`obligation:${o.id}`,source:'fornecedores',entityType:'obrigacao',entityId:o.id,title:o.titulo,date:d,status:o.status,priority:flags.overdue?'urgente':flags.dueSoon?'alta':'normal',supplierId:o.fornecedor_id||null,responsibleId:o.responsavel_id||null,campaignId:o.campanha_ref||null,href:`/operacoes.html?view=obrigacoes&obrigacao=${encodeURIComponent(o.id)}`});
  }
  return out.sort((a,b)=>a.date.localeCompare(b.date)||String(a.time||'').localeCompare(String(b.time||''))||a.title.localeCompare(b.title,'pt-BR'));
}

export function filterCalendarEvents(events, filters={}) {
  const source=filters.source||'',supplier=String(filters.supplierId||filters.supplier||''),responsible=String(filters.responsibleId||filters.responsible||''),campaign=String(filters.campaignId||filters.campaign||''),status=filters.status||'',importance=filters.importance||'',from=dateKey(filters.from),to=dateKey(filters.to);
  return (events||[]).filter(e=>(!source||e.source===source)&&(!supplier||(String(e.supplierId||'')===supplier||(e.supplierIds||[]).map(String).includes(supplier)))&&(!responsible||String(e.responsibleId||'')===responsible)&&(!campaign||String(e.campaignId||'')===campaign)&&(!status||e.status===status)&&(!importance||e.priority===importance)&&(!from||e.date>=from)&&(!to||e.date<=to));
}

export function matrixFromObligations(obligations, types=['anuncio_catalogo','logo','imagem_produto','contrato','material_pagamento']) {
  const suppliers=new Map();
  for(const source of obligations||[]){const flags=obligationFlags(source);const o={...source,...flags};if(!suppliers.has(String(o.fornecedor_id)))suppliers.set(String(o.fornecedor_id),{supplierId:o.fornecedor_id,supplierName:o.fornecedor_nome||o.supplier_name||`Fornecedor ${o.fornecedor_id}`,cells:{}});const row=suppliers.get(String(o.fornecedor_id));const current=row.cells[o.tipo];const rank=s=>({aprovado:7,dispensado:7,em_revisao:6,recebido:5,ajuste_solicitado:4,solicitado:3,pendente:2}[s]||1);if(!current||rank(o.status)>rank(current.status))row.cells[o.tipo]=o;}
  return [...suppliers.values()].map(row=>{const expected=types.map(type=>row.cells[type]||null),existing=expected.filter(Boolean),overdue=existing.some(x=>x.overdue),incomplete=expected.some(x=>!x||!x.done),overallLabel=overdue?'Atrasado':incomplete?'Pendente':'Completo';return{...row,overdue,incomplete,overallLabel,types:types.map(type=>({type,obligation:row.cells[type]||null}))};}).sort((a,b)=>a.supplierName.localeCompare(b.supplierName,'pt-BR'));
}

export function preferredContact(contacts, obligationType='outro') {
  const dept = ['nota_fiscal','recibo','material_pagamento'].includes(obligationType)?'Financeiro':['anuncio_catalogo','logo','imagem_produto','material_evento','painel_info','foto'].includes(obligationType)?'Marketing':'Comercial';
  const active=(contacts||[]).filter(c=>c.ativo!==false);
  return active.find(c=>c.departamento===dept&&c.preferido)||active.find(c=>c.departamento===dept)||active.find(c=>c.preferido)||active[0]||null;
}
export function buildFollowupDraft({supplierName,contact,obligations=[]}) {
  const first=contact?.nome?`Olá, ${contact.nome.split(/\s+/)[0]}, tudo bem?`:'Olá, tudo bem?';
  const lines=(obligations||[]).map(o=>`• ${o.titulo}${o.prazo?` — prazo ${new Date(`${o.prazo}T12:00:00`).toLocaleDateString('pt-BR')}`:''}`);
  return `${first}\n\nEstamos acompanhando as pendências da ${supplierName||'empresa'} com a PMG e precisamos do envio dos itens abaixo:\n\n${lines.join('\n')}\n\nAssim que estiverem disponíveis, pode nos encaminhar por favor? Obrigado.`;
}

export function detectMagicMime(bytes) {
  const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
  if(a.length>=4&&a[0]===0xff&&a[1]===0xd8&&a[2]===0xff)return'image/jpeg';
  if(a.length>=8&&a[0]===0x89&&a[1]===0x50&&a[2]===0x4e&&a[3]===0x47&&a[4]===0x0d&&a[5]===0x0a&&a[6]===0x1a&&a[7]===0x0a)return'image/png';
  if(a.length>=12&&String.fromCharCode(...a.slice(0,4))==='RIFF'&&String.fromCharCode(...a.slice(8,12))==='WEBP')return'image/webp';
  if(a.length>=5&&String.fromCharCode(...a.slice(0,5))==='%PDF-')return'application/pdf';
  return'application/octet-stream';
}
export function validateAssetMeta({size=0,mime='',detectedMime='',name='',width=null,height=null,maxBytes=WAVE2_MAX_FILE_BYTES,allowedMimes=WAVE2_ALLOWED_MIMES}={}) {
  const errors=[],warnings=[];const actual=detectedMime||mime;
  if(!size||size<1)errors.push('Arquivo vazio.');
  if(size>maxBytes)errors.push(`Arquivo acima do limite de ${Math.round(maxBytes/1048576)} MB.`);
  if(!allowedMimes.includes(actual))errors.push('Formato não permitido.');
  if(mime&&detectedMime&&mime!==detectedMime)errors.push('O conteúdo do arquivo não corresponde ao tipo informado.');
  if(actual.startsWith('image/')){if(width&&height&&Math.min(width,height)<800)warnings.push('Imagem pequena para impressão.');if(width&&height&&Math.max(width,height)<1600)warnings.push('Resolução pode ser insuficiente para catálogo impresso.');}
  if(!String(name).trim())errors.push('Nome de arquivo ausente.');
  return {ok:errors.length===0,errors,warnings,actualMime:actual};
}
export async function sha256Hex(input) {
  const data=input instanceof ArrayBuffer?input:input?.buffer instanceof ArrayBuffer?input.buffer:new TextEncoder().encode(String(input));
  const digest=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function validateFileMeta(meta={}, options={}) { return validateAssetMeta({...meta,...options}); }
export async function sha256File(file) { return sha256Hex(await file.arrayBuffer()); }
export async function inspectFileSignature(file) {
  const head=await file.slice(0,16).arrayBuffer();
  return detectMagicMime(new Uint8Array(head));
}

export function automationIdempotencyKey(ruleId,entityType,entityId,trigger,bucket='once'){return `${ruleId}:${entityType}:${entityId}:${trigger}:${bucket}`;}
export function automationBucket(trigger,entity,date=todayKey()) {
  if(['obrigacao_prazo','pagamento_prazo','campanha_inicio','campanha_fim','academia_inscricao_prazo','academia_treinamento_proximo'].includes(trigger))return date;
  if(['obrigacao_atrasada','pagamento_atrasado','academia_nao_inscrito'].includes(trigger))return date;
  return entity?.eventKey||entity?.updated_at||entity?.atualizado_em||date;
}
export function automationMatches(rule,entity,{today=todayKey()}={}) {
  if(!rule?.ativo)return false;const trigger=rule.gatilho;const lead=Number(rule.antecedencia??rule.parametros?.antecedencia??0);
  if(trigger==='obrigacao_prazo'){const d=dateKey(entity.prazo);return Boolean(d&&!obligationFlags(entity).done&&daysBetween(today,d)===lead);}
  if(trigger==='obrigacao_atrasada')return obligationFlags(entity).overdue;
  if(trigger==='material_recebido')return entity.status==='recebido';
  if(trigger==='pagamento_prazo'){const d=dateKey(entity.vencimento);return Boolean(d&&!['pago','cancelado'].includes(entity.status)&&daysBetween(today,d)===lead);}
  if(trigger==='pagamento_atrasado'){const d=dateKey(entity.vencimento);return Boolean(d&&!['pago','cancelado'].includes(entity.status)&&d<today);}
  if(trigger==='campanha_inicio')return daysBetween(today,dateKey(entity.startDate||entity.currentStart))===lead;
  if(trigger==='campanha_fim')return daysBetween(today,dateKey(entity.endDate||entity.currentEnd))===lead;
  if(trigger==='documento_revisao')return entity.status==='aguardando_conferencia';
  if(trigger==='documento_concluido')return entity.status==='aprovado';
  if(trigger==='snapshot_desatualizado')return entity.stale===true;
  if(trigger==='bridge_indisponivel')return entity.ok===false;
  if(trigger==='importacao_falhou')return entity.status==='erro';
  if(trigger==='academia_inscricao_prazo')return daysBetween(today,dateKey(entity.inscricao_limite))===lead;
  if(trigger==='academia_nao_inscrito')return Number(entity.nao_inscritos||0)>0;
  if(trigger==='academia_treinamento_proximo')return daysBetween(today,dateKey(entity.inicio_em))===lead;
  return false;
}

export function normalizeRepresentative(rep={}) {return {code:String(rep.code||rep.codigo||rep.id||'').replace(/^snapshot:/,''),name:String(rep.name||rep.nome||'').trim(),email:normText(rep.email||''),phone:normDigits(rep.phone||rep.telefone||''),region:String(rep.region||rep.regiao||'').trim(),raw:rep};}
export function matchRegistration(registration,reps,aliases=[]) {
  const r={code:String(registration.code||registration.codigo||'').trim(),email:normText(registration.email||''),phone:normDigits(registration.phone||registration.telefone||''),name:normText(registration.name||registration.nome||registration.representante_nome||'')};
  const list=(reps||[]).map(normalizeRepresentative);
  const exact=(predicate,method)=>{const hits=list.filter(predicate);return hits.length===1?{status:'resolvido',method,representative:hits[0]}:hits.length>1?{status:'ambiguo',method,candidates:hits}:null;};
  if(r.code){const x=exact(x=>x.code===r.code,'codigo');if(x)return x;}
  if(r.email){const x=exact(x=>x.email&&x.email===r.email,'email');if(x)return x;}
  if(r.phone){const x=exact(x=>x.phone&&x.phone===r.phone,'telefone');if(x)return x;}
  if(r.name){const alias=(aliases||[]).find(a=>a.estado!=='rejeitado'&&normText(a.alias_original||a.alias_normalizado)===r.name);if(alias){const x=exact(x=>x.code===String(alias.representante_codigo),'alias');if(x)return x;}const x=exact(x=>normText(x.name)===r.name,'nome_exato');if(x)return x;}
  const fuzzy=list.map(x=>({x,score:similarity(r.name,normText(x.name))})).filter(v=>v.score>=0.78).sort((a,b)=>b.score-a.score);
  if(fuzzy.length)return{status:'ambiguo',method:'similaridade',candidates:fuzzy.slice(0,5).map(v=>({...v.x,score:v.score}))};
  return{status:'pendente',method:'nenhum',candidates:[]};
}
export function similarity(a,b){if(!a||!b)return 0;if(a===b)return 1;const sa=new Set(a.split(' ').filter(Boolean)),sb=new Set(b.split(' ').filter(Boolean));const inter=[...sa].filter(x=>sb.has(x)).length,union=new Set([...sa,...sb]).size;const j=union?inter/union:0;let prefix=0;for(let i=0;i<Math.min(a.length,b.length);i++){if(a[i]!==b[i])break;prefix++;}return Math.min(1,j*.8+(prefix/Math.max(a.length,b.length))*.2);}
export function trainingStats(activeRepresentatives,registrations,attendance){const active=(activeRepresentatives||[]).map(normalizeRepresentative);const codes=new Set((registrations||[]).filter(r=>r.match_status==='resolvido'&&r.representante_codigo).map(r=>String(r.representante_codigo)));const present=new Set((attendance||[]).map(p=>String(p.representante_codigo)));const notRegistered=active.filter(r=>!codes.has(r.code));return{total:active.length,registered:codes.size,notRegistered:notRegistered.length,present:present.size,absent:[...codes].filter(c=>!present.has(c)).length,registrationRate:active.length?codes.size/active.length*100:0,attendanceRate:codes.size?present.size/codes.size*100:0,notRegisteredList:notRegistered};}

export function operationalQualityIssues({obligations=[],assets=[],contacts=[],registrations=[],attendance=[]}={}) {
  const issues=[];const push=(key,module,severity,title,meta={})=>issues.push({key,module,severity,title,meta});
  for(const o of obligations){if(!o.fornecedor_id)push(`obligation:${o.id}:supplier`,'fornecedores','critica','Obrigação sem fornecedor canônico',{id:o.id});if(o.contato_id&&contacts.length&&!contacts.some(c=>String(c.id)===String(o.contato_id)))push(`obligation:${o.id}:contact`,'fornecedores','importante','Obrigação aponta para contato inexistente',{id:o.id});}
  const seenEmail=new Map();for(const c of contacts.filter(c=>c.ativo!==false)){if(c.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))push(`contact:${c.id}:email`,'fornecedores','importante','Contato com e-mail inválido',{id:c.id});const k=`${c.fornecedor_id}:${normText(c.email||c.telefone||c.whatsapp||c.nome)}`;if(seenEmail.has(k))push(`contact:${c.id}:duplicate`,'fornecedores','importante','Possível contato ativo duplicado',{id:c.id,other:seenEmail.get(k)});else seenEmail.set(k,c.id);}
  const hashes=new Map();for(const a of assets){const k=`${a.fornecedor_id}:${a.sha256}`;if(hashes.has(k))push(`asset:${a.id}:duplicate`,'materiais','importante','Material duplicado',{id:a.id,other:hashes.get(k)});else hashes.set(k,a.id);if(!a.mime||!a.sha256)push(`asset:${a.id}:metadata`,'materiais','importante','Material sem metadados obrigatórios',{id:a.id});}
  for(const r of registrations){if(['pendente','ambiguo'].includes(r.match_status))push(`registration:${r.id}:match`,'academia',r.match_status==='ambiguo'?'importante':'normal','Inscrição sem representante resolvido',{id:r.id,status:r.match_status});}
  const att=new Set();for(const p of attendance){const k=`${p.treinamento_id}:${p.representante_codigo}`;if(att.has(k))push(`attendance:${p.id}:duplicate`,'academia','critica','Presença duplicada',{id:p.id});else att.add(k);if(!p.representante_codigo)push(`attendance:${p.id}:rep`,'academia','critica','Presença sem representante',{id:p.id});}
  return issues;
}

export function lineageCount(label,rows,filter=()=>true){const included=(rows||[]).filter(filter);return{label,value:included.length,recordCount:included.length,records:included,calculation:`Contagem de ${included.length} registro(s) após os filtros ativos.`};}
