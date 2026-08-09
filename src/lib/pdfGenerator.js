function fmtBRL(n) {
    return `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
}
function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function buildPdfHtml(drafts, reportDate) {
    const today = reportDate || new Date().toISOString();
    const transactions = drafts.filter(d => d.type === 'transaction');
    const nfces = drafts.filter(d => d.type === 'nfce_import');

    const totalOut = transactions.reduce((s, d) => s + (d.amount || 0), 0);

    // Group by account
    const byAccount = {};
    for (const d of transactions) {
        const key = d.account_name || 'Sem Conta';
        if (!byAccount[key]) byAccount[key] = [];
        byAccount[key].push(d);
    }

    const txRows = transactions.map((d, i) => `
        <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#fff'}">
            <td>${d.account_name || '—'}</td>
            <td>${d.beneficiary || '—'}</td>
            <td>${d.description || '—'}</td>
            <td style="text-align:center">${d.installments > 1 ? `${d.installments}x` : '1'}</td>
            <td style="text-align:right;font-weight:bold;color:#004d40">${fmtBRL(d.amount)}</td>
        </tr>`).join('');

    const nfceRows = nfces.map((d, i) => `
        <tr style="background:${i % 2 === 0 ? '#f0fdf4' : '#fff'}">
            <td colspan="2">${d.beneficiary || d.chave_nfce || '—'}</td>
            <td>${d.description || 'NFC-e importada'}</td>
            <td colspan="2" style="font-family:monospace;font-size:9px;color:#666">${d.chave_nfce || ''}</td>
        </tr>`).join('');

    const accountSummary = Object.entries(byAccount).map(([acc, items]) => {
        const total = items.reduce((s, i) => s + (i.amount || 0), 0);
        return `<tr><td><b>${acc}</b></td><td style="text-align:right">${items.length} lançamentos</td><td style="text-align:right;font-weight:bold;color:#004d40">${fmtBRL(total)}</td></tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8"/>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#1e293b;font-size:12px}
  h1{color:#004d40;font-size:22px;margin:0}
  h2{color:#004d40;font-size:14px;margin:16px 0 8px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #CCFF00;padding-bottom:12px;margin-bottom:20px}
  .badge{background:#004d40;color:#CCFF00;padding:4px 12px;border-radius:20px;font-weight:bold;font-size:11px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th{background:#004d40;color:#fff;padding:8px 10px;text-align:left;font-size:11px}
  td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px}
  .total-row{background:#004d40;color:#fff;font-weight:bold}
  .total-row td{padding:10px;font-size:13px}
  .footer{margin-top:32px;text-align:center;color:#94a3b8;font-size:10px;border-top:1px solid #e2e8f0;padding-top:12px}
  .summary-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:16px}
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>💰 AGILI$ - Conferência Diária</h1>
    <div style="color:#64748b;margin-top:4px">Data: ${fmtDate(today)} &nbsp;|&nbsp; Gerado em: ${new Date().toLocaleTimeString('pt-BR')}</div>
  </div>
  <div class="badge">${drafts.length} ITENS PENDENTES</div>
</div>

${transactions.length > 0 ? `
<h2>📋 Lançamentos (${transactions.length})</h2>
<table>
  <thead><tr><th>Conta</th><th>Fornecedor</th><th>Descrição</th><th>Parc.</th><th>Valor</th></tr></thead>
  <tbody>
    ${txRows}
    <tr class="total-row"><td colspan="4">TOTAL LANÇAMENTOS</td><td style="text-align:right">${fmtBRL(totalOut)}</td></tr>
  </tbody>
</table>` : ''}

${nfces.length > 0 ? `
<h2>🧾 NFC-e / Cupons Fiscais (${nfces.length})</h2>
<table>
  <thead><tr><th>Emitente</th><th></th><th>Descrição</th><th colspan="2">Chave NFC-e</th></tr></thead>
  <tbody>${nfceRows}</tbody>
</table>` : ''}

${Object.keys(byAccount).length > 1 ? `
<div class="summary-box">
  <h2 style="margin:0 0 8px">📊 Resumo por Conta</h2>
  <table><tbody>${accountSummary}</tbody></table>
</div>` : ''}

<div class="footer">
  AGILI$ • Relatório de Conferência Diária • Gerado pelo Agilis Mobile App<br/>
  Este documento é um rascunho de conferência. Os dados serão importados após confirmação.
</div>
</body>
</html>`;
}
