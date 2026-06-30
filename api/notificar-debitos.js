import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
webpush.setVapidDetails('marketing04@pmg.com.br', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

export default async function handler(req, res) {
  try {
    let notas = [], from = 0;
    while (true) {
      const { data, error } = await supabase.from('notas_fiscais').select('fornecedor_id, valor, situacao').range(from, from + 999);
      if (error) throw error;
      if (!data?.length) break;
      notas = notas.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }

    const { data: fornecedores, error: fErr } = await supabase.from('fornecedores').select('id, pct_sellin');
    if (fErr) throw fErr;

    const faturadoPorForn = {};
    notas.forEach(n => {
      const sit = (n.situacao || '').toLowerCase().trim();
      if (sit !== 'autorizada' && sit !== 'autorizado') return;
      faturadoPorForn[n.fornecedor_id] = (faturadoPorForn[n.fornecedor_id] || 0) + (n.valor || 0);
    });

    let totalDebito = 0, qtd = 0;
    fornecedores.forEach(f => {
      const debito = (faturadoPorForn[f.id] || 0) * ((f.pct_sellin || 0) / 100);
      if (debito > 0.01) { totalDebito += debito; qtd++; }
    });

    const fmt = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const payload = JSON.stringify({
      title: '💰 Débitos Sell-In — PMG',
      body: qtd > 0 ? `${qtd} fornecedor(es) com débito. Total: ${fmt(totalDebito)}` : 'Nenhum débito pendente no momento.',
      url: '/fornecedores.html'
    });

    const { data: subs } = await supabase.from('push_subscriptions').select('*');
    const resultados = await Promise.allSettled(
      (subs || []).map(s => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload))
    );

    for (let i = 0; i < resultados.length; i++) {
      if (resultados[i].status === 'rejected' && [404, 410].includes(resultados[i].reason?.statusCode)) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', subs[i].endpoint);
      }
    }

    res.status(200).json({ enviados: subs?.length || 0, totalDebito, qtd });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
}