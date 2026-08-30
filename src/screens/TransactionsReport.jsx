import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

function fmtBRL(n) {
    return `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
}

function fmtDateBR(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

// Relatório de lançamentos da conta selecionada — mesmo padrão visual do
// seletor de contas da Home: uma linha por lançamento, tocando expande
// mostrando todos os dados da movimentação (igual ao modal de edição do
// AgilisWeb, só que inline em vez de modal, por causa do espaço em tela).
export default function TransactionsReport({ account }) {
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState([]);
    const [maps, setMaps] = useState({ beneficiaries: {}, costCenters: {}, chartAccounts: {} });
    const [expandedId, setExpandedId] = useState(null);
    const [itemsByTx, setItemsByTx] = useState({});

    const load = async () => {
        setLoading(true);
        const [{ data: txs }, { data: beneficiaries }, { data: costCenters }, { data: chartAccounts }] = await Promise.all([
            supabase.from('transactions').select('*').eq('account_id', account.id).order('due_date', { ascending: false }),
            supabase.from('beneficiaries').select('id, name'),
            supabase.from('cost_centers').select('id, full_code, description'),
            supabase.from('chart_of_accounts').select('id, code, description'),
        ]);

        setMaps({
            beneficiaries: Object.fromEntries((beneficiaries || []).map(b => [b.id, b.name])),
            costCenters: Object.fromEntries((costCenters || []).map(c => [c.id, c.full_code ? `${c.full_code} - ${c.description}` : c.description])),
            chartAccounts: Object.fromEntries((chartAccounts || []).map(c => [c.id, c.code ? `${c.code} - ${c.description}` : c.description])),
        });
        setTransactions(txs || []);
        setLoading(false);
    };

    useEffect(() => { load(); }, [account?.id]);

    const toggleExpand = async (tx) => {
        const opening = expandedId !== tx.id;
        setExpandedId(opening ? tx.id : null);
        if (opening && !itemsByTx[tx.id]) {
            const { data } = await supabase.from('transaction_items').select('*').eq('transaction_id', tx.id);
            if (data?.length) setItemsByTx(prev => ({ ...prev, [tx.id]: data }));
        }
    };

    if (loading) {
        return (
            <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator color="#CCFF00" />
                <Text style={{ color: '#94a3b8', marginTop: 10, fontSize: 12 }}>Carregando lançamentos...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: 40 }}>
            {transactions.length === 0 ? (
                <TouchableOpacity style={s.emptyState} onPress={load}>
                    <Text style={s.emptyIcon}>📊</Text>
                    <Text style={s.emptyText}>Nenhum lançamento nesta conta.{'\n'}Toque para tentar novamente.</Text>
                </TouchableOpacity>
            ) : transactions.map(t => {
                const isCredit = t.dc_type === 'C';
                const open = expandedId === t.id;
                const items = itemsByTx[t.id];
                return (
                    <View key={t.id} style={s.card}>
                        <TouchableOpacity style={s.row} onPress={() => toggleExpand(t)} activeOpacity={0.7}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.rowDesc} numberOfLines={1}>{t.description || maps.beneficiaries[t.beneficiary_id] || 'Sem descrição'}</Text>
                                <Text style={s.rowDate}>{fmtDateBR(t.due_date)}</Text>
                            </View>
                            <Text style={[s.rowAmount, isCredit ? s.credit : s.debit]}>{isCredit ? '+' : '−'} {fmtBRL(t.amount)}</Text>
                            <Text style={s.rowArrow}>{open ? '▾' : '▸'}</Text>
                        </TouchableOpacity>

                        {open && (
                            <View style={s.detail}>
                                <DetailRow label="Data de emissão" value={fmtDateBR(t.emission_date)} />
                                <DetailRow label="Data de vencimento" value={fmtDateBR(t.due_date)} />
                                <DetailRow label="Descrição" value={t.description || '—'} />
                                <DetailRow label="Valor" value={fmtBRL(t.amount)} />
                                <DetailRow label="Tipo" value={t.dc_type === 'C' ? 'Entrada (Crédito)' : t.dc_type === 'T' ? 'Transferência' : 'Saída (Débito)'} />
                                <DetailRow label="Fornecedor" value={maps.beneficiaries[t.beneficiary_id] || '—'} />
                                {items?.length > 0 ? (
                                    items.map((it, idx) => (
                                        <DetailRow key={idx} label={`↳ ${it.description || maps.costCenters[it.cost_center_id] || 'Rateio'}`} value={fmtBRL(it.amount)} />
                                    ))
                                ) : (
                                    <DetailRow label="Centro de Custos" value={maps.costCenters[t.cost_center_id] || '—'} />
                                )}
                                <DetailRow label="Plano de Contas" value={maps.chartAccounts[t.transaction_type_id] || '—'} />
                            </View>
                        )}
                    </View>
                );
            })}
        </ScrollView>
    );
}

function DetailRow({ label, value }) {
    return (
        <View style={s.detailRow}>
            <Text style={s.detailLabel}>{label}</Text>
            <Text style={s.detailValue}>{value}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    list: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
    emptyState: { alignItems: 'center', marginTop: 48, opacity: 0.5 },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyText: { color: '#94a3b8', textAlign: 'center', lineHeight: 22 },

    card: { backgroundColor: '#1e293b', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
    rowDesc: { color: '#fff', fontWeight: '700', fontSize: 13 },
    rowDate: { color: '#89962F', fontSize: 11, marginTop: 2 },
    rowAmount: { fontWeight: '800', fontSize: 13 },
    credit: { color: '#22c55e' },
    debit: { color: '#ef4444' },
    rowArrow: { color: '#CCFF00', fontSize: 13, width: 14, textAlign: 'center' },

    detail: { borderTopWidth: 1, borderTopColor: '#0f172a', padding: 14, paddingTop: 10 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
    detailLabel: { color: '#89962F', fontSize: 11, flexShrink: 0, marginRight: 8 },
    detailValue: { color: '#fff', fontSize: 12, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
