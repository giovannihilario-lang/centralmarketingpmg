export function paymentRealizedValue(payment = {}) {
  const explicit = Number(payment.valor_pago);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (payment.status === 'pago') return Number(payment.valor_previsto || 0) || 0;
  return 0;
}

function sum(rows, getter) {
  return (rows || []).reduce((total, row) => total + Number(getter(row) || 0), 0);
}

export function buildSupplierFinanceComposition(records = [], payments = [], { today = new Date().toISOString().slice(0, 10) } = {}) {
  const activeRecords = (records || []).filter(record => record && record.impacta_totais !== false);
  const recordIds = new Set(activeRecords.map(record => String(record.id)));
  const relevantPayments = (payments || []).filter(payment => recordIds.has(String(payment.registro_id)));
  const paymentsByRecord = new Map();
  relevantPayments.forEach(payment => {
    const key = String(payment.registro_id);
    if (!paymentsByRecord.has(key)) paymentsByRecord.set(key, []);
    paymentsByRecord.get(key).push(payment);
  });

  const rows = activeRecords.map(record => {
    const sourcePayments = paymentsByRecord.get(String(record.id)) || [];
    const realized = sum(sourcePayments, paymentRealizedValue);
    const followed = Number(record.valor_acordado || 0);
    const outstanding = Math.max(0, followed - realized);
    const overdue = sum(sourcePayments.filter(payment => {
      if (!payment?.vencimento || ['pago', 'cancelado'].includes(payment.status)) return false;
      return String(payment.vencimento).slice(0, 10) < today;
    }), payment => Math.max(0, Number(payment.valor_previsto || 0) - paymentRealizedValue(payment)));
    return { record, payments:sourcePayments, followed, realized, outstanding, overdue };
  });

  return {
    totalFollowed:sum(rows, row => row.followed),
    totalRealized:sum(rows, row => row.realized),
    totalOutstanding:sum(rows, row => row.outstanding),
    totalOverdue:sum(rows, row => row.overdue),
    recordCount:rows.length,
    paymentCount:relevantPayments.length,
    rows,
  };
}
