import { supabase } from './supabase';

export function addMonths(iso, n) {
    const d = new Date(iso);
    d.setMonth(d.getMonth() + n);
    return d.toISOString().split('T')[0];
}

export function todayISO() {
    return new Date().toISOString().split('T')[0];
}

// Resolve o id do fornecedor em `beneficiaries` a partir do que veio do
// BeneficiaryPicker: se já veio com id (escolhido da lista), usa direto.
// Se veio só o nome (digitado, ainda não cadastrado), tenta achar por nome
// exato (evita duplicar por causa de reenvio) e, não achando, cadastra —
// mesmo comportamento do "cadastrar agora" do formulário web (Transactions.jsx).
export async function resolveBeneficiaryId(beneficiary_id, beneficiary_name) {
    if (beneficiary_id) return beneficiary_id;
    const name = (beneficiary_name || '').trim();
    if (!name) return null;

    const { data: existing } = await supabase
        .from('beneficiaries')
        .select('id')
        .ilike('name', name)
        .maybeSingle();
    if (existing?.id) return existing.id;

    const { data: created, error } = await supabase
        .from('beneficiaries')
        .insert([{ name, level: 2 }])
        .select()
        .single();
    if (error) {
        console.warn('Não foi possível cadastrar novo fornecedor:', error.message);
        return null;
    }
    return created.id;
}

// Grava um lançamento (com parcelas, se houver) direto na tabela transactions,
// dentro da movimentação (conta) selecionada — mesmo formato usado no
// fechamento do dia (ReviewScreen), só que na hora, sem esperar o export.
export async function insertTransaction(ctx, {
    account_id, amount, beneficiary, description, installments = 1,
    cost_center_id = null, transaction_type_id = null,
    beneficiary_id = null, beneficiary_name = '',
    dc_type = 'D', type = 'Expense',
    first_due_date = null,
}) {
    const resolvedBeneficiaryId = await resolveBeneficiaryId(beneficiary_id, beneficiary_name || beneficiary);

    const today = todayISO();
    const dueBase = first_due_date || today;
    const n = installments || 1;
    const rows = [];
    for (let i = 0; i < n; i++) {
        rows.push({
            account_id,
            emission_date: today,
            due_date: addMonths(dueBase, i),
            description: n > 1 ? `${description || beneficiary} (${i + 1}/${n})` : (description || beneficiary),
            amount: amount / n,
            dc_type,
            type,
            beneficiary_id: resolvedBeneficiaryId,
            cost_center_id,
            transaction_type_id,
            user_id: ctx?.user_id ?? null,
            family_id: ctx?.family_id ?? null,
        });
    }
    return supabase.from('transactions').insert(rows);
}
