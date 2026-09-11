import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function fmtBRL(n) {
    return `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
}

function fmtDateBR(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

function todayISO() {
    return new Date().toISOString().split('T')[0];
}

const isCreditCard = (acc) => (acc?.account_type || '').toLowerCase().includes('cart');

// Extrato bancário (conta corrente/poupança etc.) e Extrato de Fatura
// (cartão de crédito) — mesma lógica de cálculo usada no AgilisWeb
// (Transactions.jsx: fetchTransactions + ExtratoModal), só que lendo tudo
// de uma vez (a conta não costuma ter volume grande o bastante pra paginar).
export default function AccountStatement({ account, navigation }) {
    const [loading, setLoading] = useState(true);
    const [accountFull, setAccountFull] = useState(account);
    const [transactions, setTransactions] = useState([]);
    const [maps, setMaps] = useState({ beneficiaries: {}, costCenters: {}, chartAccounts: {} });

    const creditCard = isCreditCard(accountFull);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const [{ data: acc }, { data: txs }, { data: beneficiaries }, { data: costCenters }, { data: chartAccounts }] = await Promise.all([
                supabase.from('accounts').select('*').eq('id', account.id).single(),
                supabase.from('transactions').select('*').eq('account_id', account.id).order('emission_date', { ascending: true }),
                supabase.from('beneficiaries').select('id, name'),
                supabase.from('cost_centers').select('id, full_code, description'),
                supabase.from('chart_of_accounts').select('id, code, description'),
            ]);
            setAccountFull(acc || account);
            setTransactions(txs || []);
            setMaps({
                beneficiaries: Object.fromEntries((beneficiaries || []).map(b => [b.id, b.name])),
                costCenters: Object.fromEntries((costCenters || []).map(c => [c.id, c.full_code ? `${c.full_code} - ${c.description}` : c.description])),
                chartAccounts: Object.fromEntries((chartAccounts || []).map(c => [c.id, c.code ? `${c.code} - ${c.description}` : c.description])),
            });
            setLoading(false);
        };
        load();
    }, [account.id]);

    if (loading) {
        return (
            <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator color="#CCFF00" />
                <Text style={{ color: '#94a3b8', marginTop: 10, fontSize: 12 }}>Carregando extrato...</Text>
            </View>
        );
    }

    return creditCard
        ? <InvoiceStatement account={accountFull} transactions={transactions} maps={maps} />
        : <AccountLedger account={accountFull} transactions={transactions} maps={maps} />;
}

// ── Extrato de Fatura (Cartão de Crédito) ───────────────────────────────────
function InvoiceStatement({ account, transactions, maps }) {
    const creditLimit = Number(account?.credit_limit || 0);

    const valorUtilizado = useMemo(() => transactions.reduce((sum, t) => {
        const amt = Number(t.amount) || 0;
        return sum + (t.dc_type === 'C' ? -amt : amt);
    }, 0), [transactions]);
    const aUtilizar = creditLimit - Math.max(0, valorUtilizado);

    // Agrupa por fatura (YYYY-MM do vencimento, já calculado na gravação).
    const faturaMap = useMemo(() => {
        const map = {};
        transactions.forEach(t => {
            if (!t.due_date) return;
            const key = t.due_date.slice(0, 7);
            if (!map[key]) map[key] = [];
            map[key].push(t);
        });
        return map;
    }, [transactions]);

    const faturaKeys = Object.keys(faturaMap).sort();
    const years = [...new Set(faturaKeys.map(k => k.slice(0, 4)))].sort();
    const currentFaturaKey = todayISO().slice(0, 7);
    const defaultYear = years.includes(currentFaturaKey.slice(0, 4)) ? currentFaturaKey.slice(0, 4) : (years[years.length - 1] || currentFaturaKey.slice(0, 4));

    const [selectedYear, setSelectedYear] = useState(defaultYear);
    const [selectedMonth, setSelectedMonth] = useState(faturaKeys.includes(currentFaturaKey) ? currentFaturaKey.slice(5, 7) : null);

    const saldoAnt = faturaKeys
        .filter(k => k.slice(0, 4) < selectedYear)
        .reduce((sum, k) => sum + faturaMap[k].reduce((s, t) => s + (t.dc_type === 'C' ? -Number(t.amount || 0) : Number(t.amount || 0)), 0), 0);

    const monthsInYear = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    const selectedKey = selectedMonth ? `${selectedYear}-${selectedMonth}` : null;
    const monthTxs = selectedKey ? (faturaMap[selectedKey] || []).sort((a, b) => (a.due_date < b.due_date ? -1 : 1)) : [];

    return (
        <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={s.invoiceHeader}>
                <View style={s.invoiceStatsRow}>
                    <View style={s.invoiceStat}>
                        <Text style={s.invoiceStatLabel}>LIMITE TOTAL</Text>
                        <Text style={s.invoiceStatValue}>{fmtBRL(creditLimit)}</Text>
                    </View>
                    <View style={s.invoiceStat}>
                        <Text style={s.invoiceStatLabel}>UTILIZADO</Text>
                        <Text style={[s.invoiceStatValue, { color: '#ef4444' }]}>{fmtBRL(Math.max(0, valorUtilizado))}</Text>
                    </View>
                    <View style={s.invoiceStat}>
                        <Text style={s.invoiceStatLabel}>A UTILIZAR</Text>
                        <Text style={[s.invoiceStatValue, { color: '#22c55e' }]}>{fmtBRL(aUtilizar)}</Text>
                    </View>
                </View>
                {(account.closing_day || account.due_day) && (
                    <Text style={s.invoiceClosing}>Fechamento: dia {account.closing_day || '—'} · Vencimento: dia {account.due_day || '—'}</Text>
                )}
            </View>

            <View style={s.yearTabs}>
                {years.length === 0 && <Text style={s.emptyText}>Nenhuma fatura registrada.</Text>}
                {years.map(y => (
                    <TouchableOpacity key={y} style={[s.yearTab, y === selectedYear && s.yearTabActive]} onPress={() => { setSelectedYear(y); setSelectedMonth(null); }}>
                        <Text style={[s.yearTabText, y === selectedYear && s.yearTabTextActive]}>{y}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {saldoAnt !== 0 && (
                <View style={s.saldoAntRow}>
                    <Text style={s.saldoAntLabel}>Saldo Ant. (anos anteriores)</Text>
                    <Text style={[s.saldoAntValue, saldoAnt < 0 && s.negative]}>{fmtBRL(saldoAnt)}</Text>
                </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.monthTabsScroll}>
                {monthsInYear.map(m => {
                    const key = `${selectedYear}-${m}`;
                    const total = (faturaMap[key] || []).reduce((sum, t) => sum + (t.dc_type === 'C' ? -Number(t.amount || 0) : Number(t.amount || 0)), 0);
                    const hasData = !!faturaMap[key];
                    return (
                        <TouchableOpacity
                            key={m}
                            style={[s.monthTab, selectedMonth === m && s.monthTabActive, !hasData && s.monthTabEmpty]}
                            onPress={() => hasData && setSelectedMonth(m)}
                            disabled={!hasData}
                        >
                            <Text style={[s.monthTabName, selectedMonth === m && s.monthTabNameActive]}>{MONTH_NAMES[Number(m) - 1]}</Text>
                            <Text style={[s.monthTabTotal, selectedMonth === m && s.monthTabTotalActive]}>{hasData ? fmtBRL(total) : '—'}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {selectedKey && (
                <View style={s.txList}>
                    {monthTxs.length === 0 ? (
                        <Text style={s.emptyText}>Nenhum lançamento nesta fatura.</Text>
                    ) : monthTxs.map(t => (
                        <View key={t.id} style={s.txRowSingle}>
                            <Text style={s.txDesc} numberOfLines={1}>{t.description || maps.beneficiaries[t.beneficiary_id] || 'Sem descrição'}</Text>
                            <Text style={[s.txAmount, t.dc_type === 'C' ? s.credit : s.debit]}>{t.dc_type === 'C' ? '+' : '−'} {fmtBRL(t.amount)}</Text>
                        </View>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

// ── Extrato bancário (Conta Corrente e demais tipos) ───────────────────────
function AccountLedger({ account, transactions, maps }) {
    const [periodMonth, setPeriodMonth] = useState(() => todayISO().slice(0, 7)); // 'YYYY-MM'

    const [year, month] = periodMonth.split('-').map(Number);
    const periodStart = `${periodMonth}-01`;
    const periodEndDate = new Date(year, month, 0).getDate();
    const periodEnd = `${periodMonth}-${String(periodEndDate).padStart(2, '0')}`;

    const saldoAnterior = useMemo(() => {
        let saldo = Number(account?.initial_balance || 0);
        transactions.forEach(t => {
            if (t.emission_date && t.emission_date < periodStart) {
                const amt = Number(t.amount) || 0;
                saldo += t.dc_type === 'C' ? amt : -amt;
            }
        });
        return saldo;
    }, [transactions, periodStart, account]);

    const periodTxs = transactions
        .filter(t => t.emission_date >= periodStart && t.emission_date <= periodEnd)
        .sort((a, b) => (a.emission_date < b.emission_date ? -1 : 1));

    let running = saldoAnterior;
    const rows = periodTxs.map(t => {
        const amt = Number(t.amount) || 0;
        running += t.dc_type === 'C' ? amt : -amt;
        return { ...t, saldo: running };
    });

    const totalSaidas = periodTxs.filter(t => t.dc_type !== 'C').reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalEntradas = periodTxs.filter(t => t.dc_type === 'C').reduce((s, t) => s + Number(t.amount || 0), 0);
    const saldoFinal = saldoAnterior + totalEntradas - totalSaidas;

    const shiftMonth = (delta) => {
        const d = new Date(year, month - 1 + delta, 1);
        setPeriodMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };

    return (
        <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={s.monthNavRow}>
                <TouchableOpacity style={s.monthNavBtn} onPress={() => shiftMonth(-1)}>
                    <Text style={s.monthNavBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.monthNavLabel}>{MONTH_NAMES[month - 1]} / {year}</Text>
                <TouchableOpacity style={s.monthNavBtn} onPress={() => shiftMonth(1)}>
                    <Text style={s.monthNavBtnText}>›</Text>
                </TouchableOpacity>
            </View>

            <View style={s.saldoAntRow}>
                <Text style={s.saldoAntLabel}>Saldo Anterior no Período</Text>
                <Text style={[s.saldoAntValue, saldoAnterior < 0 && s.negative]}>{fmtBRL(saldoAnterior)}</Text>
            </View>

            <View style={s.txList}>
                {rows.length === 0 ? (
                    <Text style={s.emptyText}>Nenhum lançamento neste período.</Text>
                ) : rows.map(t => (
                    <View key={t.id} style={s.txRowSingle}>
                        <Text style={s.txDesc} numberOfLines={1}>{t.description || maps.beneficiaries[t.beneficiary_id] || 'Sem descrição'}</Text>
                        <Text style={[s.txAmount, t.dc_type === 'C' ? s.credit : s.debit]}>{t.dc_type === 'C' ? '+' : '−'} {fmtBRL(t.amount)}</Text>
                    </View>
                ))}
            </View>

            <View style={s.saldoAntRow}>
                <Text style={s.saldoAntLabel}>Saldo Final</Text>
                <Text style={[s.saldoAntValue, saldoFinal < 0 && s.negative]}>{fmtBRL(saldoFinal)}</Text>
            </View>

            <View style={s.ledgerSummary}>
                <SummaryItem label="Saídas" value={fmtBRL(totalSaidas)} color="#ef4444" />
                <SummaryItem label="Entradas" value={fmtBRL(totalEntradas)} color="#22c55e" />
                <SummaryItem label="Lançamentos" value={String(periodTxs.length)} />
            </View>
        </ScrollView>
    );
}

function SummaryItem({ label, value, color = '#fff' }) {
    return (
        <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={s.summaryLabel}>{label}</Text>
            <Text style={[s.summaryValue, { color }]}>{value}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 12 },
    emptyText: { color: '#475569', textAlign: 'center', padding: 24, fontSize: 13 },

    invoiceHeader: { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#334155' },
    invoiceStatsRow: { flexDirection: 'row', gap: 8 },
    invoiceStat: { flex: 1 },
    invoiceStatLabel: { color: '#64748b', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
    invoiceStatValue: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 2 },
    invoiceClosing: { color: '#89962F', fontSize: 11, marginTop: 12 },

    yearTabs: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
    yearTab: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
    yearTabActive: { backgroundColor: '#CCFF00', borderColor: '#CCFF00' },
    yearTabText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
    yearTabTextActive: { color: '#0f172a' },

    monthTabsScroll: { marginTop: 10 },
    monthTab: { backgroundColor: '#1e293b', borderRadius: 10, borderWidth: 1, borderColor: '#334155', paddingVertical: 8, paddingHorizontal: 12, marginRight: 8, alignItems: 'center', minWidth: 64 },
    monthTabActive: { backgroundColor: '#004d40', borderColor: '#CCFF00' },
    monthTabEmpty: { opacity: 0.35 },
    monthTabName: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
    monthTabNameActive: { color: '#CCFF00' },
    monthTabTotal: { color: '#fff', fontSize: 10, marginTop: 3 },
    monthTabTotalActive: { color: '#fff', fontWeight: '700' },

    monthNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 4 },
    monthNavBtn: { backgroundColor: '#1e293b', borderRadius: 8, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 14, paddingVertical: 6 },
    monthNavBtnText: { color: '#CCFF00', fontSize: 18, fontWeight: '800' },
    monthNavLabel: { color: '#fff', fontSize: 15, fontWeight: '800', minWidth: 110, textAlign: 'center' },

    ledgerSummary: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginTop: 14, borderWidth: 1, borderColor: '#334155' },
    summaryLabel: { color: '#64748b', fontSize: 10, fontWeight: '700' },
    summaryValue: { fontSize: 14, fontWeight: '800', marginTop: 4 },

    saldoAntRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, marginTop: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1e293b' },
    saldoAntLabel: { color: '#89962F', fontSize: 12, fontWeight: '700' },
    saldoAntValue: { color: '#22c55e', fontSize: 14, fontWeight: '800' },
    negative: { color: '#ef4444' },

    txList: { marginTop: 2 },
    txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
    txRowSingle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
    txDesc: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 13 },
    txDate: { color: '#64748b', fontSize: 11, marginTop: 2 },
    txAmount: { fontWeight: '800', fontSize: 13 },
    credit: { color: '#22c55e' },
    debit: { color: '#ef4444' },
});
