import { supabase } from './supabase';

function addMonths(iso, n) {
    const d = new Date(iso);
    d.setMonth(d.getMonth() + n);
    return d.toISOString().split('T')[0];
}

// Grava um lançamento (com parcelas, se houver) direto na tabela transactions,
// dentro da movimentação (conta) selecionada — mesmo formato usado no
// fechamento do dia (ReviewScreen), só que na hora, sem esperar o export.
export async function insertTransaction(ctx, { account_id, amount, beneficiary, description, installments = 1 }) {
    const today = new Date().toISOString().split('T')[0];
    const n = installments || 1;
    const rows = [];
    for (let i = 0; i < n; i++) {
        rows.push({
            account_id,
            emission_date: today,
            due_date: addMonths(today, i),
            description: n > 1 ? `${description || beneficiary} (${i + 1}/${n})` : (description || beneficiary),
            amount: amount / n,
            dc_type: 'D',
            type: 'Expense',
            beneficiary_id: null,
            user_id: ctx?.user_id ?? null,
            family_id: ctx?.family_id ?? null,
        });
    }
    return supabase.from('transactions').insert(rows);
}
