import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function fmtBRL(n) {
    return `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
}

// Relatórios não pertencem a uma conta específica (diferente de Lançamentos)
// — olham a família inteira, mês a mês, igual ao AgilisWeb (reports/
// FinancialBalance.jsx e FinancialAnalysis.jsx), só que simplificado pro
// espaço de uma tela de celular: sem o quadro de previsão manual do
// Equilíbrio nem as quebras por centro de custo/plano de contas em árvore
// da Análise — o essencial de cada um, navegável mês a mês.
export default function ReportsScreen() {
    const [subTab, setSubTab] = useState('equilibrio'); // 'equilibrio' | 'analise'

    return (
        <View style={s.container}>
            <View style={s.subTabs}>
                <TouchableOpacity
                    style={[s.subTab, subTab === 'equilibrio' && s.subTabActive]}
                    onPress={() => setSubTab('equilibrio')}
                >
                    <Text style={[s.subTabText, subTab === 'equilibrio' && s.subTabTextActive]}>Equilíbrio Financeiro</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[s.subTab, subTab === 'analise' && s.subTabActive]}
                    onPress={() => setSubTab('analise')}
                >
                    <Text style={[s.subTabText, subTab === 'analise' && s.subTabTextActive]}>Análise Financeira</Text>
                </TouchableOpacity>
            </View>

            <View style={s.body}>
                {subTab === 'equilibrio' ? <FinancialBalance /> : <FinancialAnalysis />}
            </View>
        </View>
    );
}

// ── Equilíbrio Financeiro: saldo dia a dia dentro do mês selecionado ───────
function FinancialBalance() {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth() + 1); // 1-12
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState([]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const { data } = await supabase
                .from('transactions')
                .select('emission_date, amount, dc_type')
                .gte('emission_date', `${year}-01-01`)
                .lte('emission_date', `${year}-${String(month).padStart(2, '0')}-31`);
            setTransactions(data || []);
            setLoading(false);
        };
        load();
    }, [year, month]);

    const { saldoInicial, dayRows, totalEntradas, totalSaidas } = useMemo(() => {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        let saldoInicial = 0;
        transactions.forEach(t => {
            if (t.emission_date && t.emission_date.slice(0, 7) < monthKey) {
                const amt = Number(t.amount) || 0;
                saldoInicial += t.dc_type === 'C' ? amt : -amt;
            }
        });

        const daysInMonth = new Date(year, month, 0).getDate();
        const byDay = {};
        transactions.forEach(t => {
            if (!t.emission_date || t.emission_date.slice(0, 7) !== monthKey) return;
            const day = Number(t.emission_date.slice(8, 10));
            if (!byDay[day]) byDay[day] = { entradas: 0, saidas: 0 };
            const amt = Number(t.amount) || 0;
            if (t.dc_type === 'C') byDay[day].entradas += amt; else byDay[day].saidas += amt;
        });

        let running = saldoInicial;
        const dayRows = [];
        let totalEntradas = 0, totalSaidas = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const { entradas = 0, saidas = 0 } = byDay[d] || {};
            running += entradas - saidas;
            totalEntradas += entradas;
            totalSaidas += saidas;
            dayRows.push({ day: d, entradas, saidas, saldoDia: entradas - saidas, saldoAcumulado: running });
        }
        return { saldoInicial, dayRows, totalEntradas, totalSaidas };
    }, [transactions, year, month]);

    const shiftMonth = (delta) => {
        let m = month + delta, y = year;
        if (m > 12) { m = 1; y += 1; } else if (m < 1) { m = 12; y -= 1; }
        setMonth(m); setYear(y);
    };
    const goToday = () => { setMonth(today.getMonth() + 1); setYear(today.getFullYear()); };
    const isCurrent = month === today.getMonth() + 1 && year === today.getFullYear();
    const saldoFinal = saldoInicial + totalEntradas - totalSaidas;

    return (
        <ScrollView style={s.reportScroll} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={s.monthNavRow}>
                <TouchableOpacity style={s.monthNavBtn} onPress={() => shiftMonth(-1)}>
                    <Text style={s.monthNavBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.monthNavLabel}>{MONTH_NAMES[month - 1]} / {year}</Text>
                <TouchableOpacity style={s.monthNavBtn} onPress={() => shiftMonth(1)}>
                    <Text style={s.monthNavBtnText}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.todayBtn, isCurrent && s.todayBtnDisabled]} onPress={goToday} disabled={isCurrent}>
                    <Text style={s.todayBtnText}>Mês Atual</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator color="#CCFF00" style={{ marginTop: 30 }} />
            ) : (
                <>
                    <View style={s.kpiRow}>
                        <KpiCard label="Entradas" value={fmtBRL(totalEntradas)} color="#22c55e" />
                        <KpiCard label="Saídas" value={fmtBRL(totalSaidas)} color="#ef4444" />
                        <KpiCard label="Saldo" value={fmtBRL(saldoFinal)} color={saldoFinal < 0 ? '#ef4444' : '#CCFF00'} />
                    </View>

                    <View style={s.saldoAntRow}>
                        <Text style={s.saldoAntLabel}>Saldo Inicial do Mês</Text>
                        <Text style={[s.saldoAntValue, saldoInicial < 0 && s.negative]}>{fmtBRL(saldoInicial)}</Text>
                    </View>

                    <View style={s.dayList}>
                        {dayRows.map(r => (
                            <View key={r.day} style={s.dayRow}>
                                <Text style={s.dayNum}>{String(r.day).padStart(2, '0')}</Text>
                                <Text style={[s.dayCell, { color: r.entradas ? '#22c55e' : '#334155' }]}>{r.entradas ? `+${fmtBRL(r.entradas)}` : '—'}</Text>
                                <Text style={[s.dayCell, { color: r.saidas ? '#ef4444' : '#334155' }]}>{r.saidas ? `−${fmtBRL(r.saidas)}` : '—'}</Text>
                                <Text style={[s.dayCellSaldo, r.saldoAcumulado < 0 && s.negative]}>{fmtBRL(r.saldoAcumulado)}</Text>
                            </View>
                        ))}
                    </View>
                </>
            )}
        </ScrollView>
    );
}

// ── Análise Financeira: receita x despesa por mês no ano, + top centros ────
function FinancialAnalysis() {
    const [year, setYear] = useState(new Date().getFullYear());
    const [loading, setLoading] = useState(true);
    const [monthly, setMonthly] = useState(Array.from({ length: 12 }, () => ({ entradas: 0, saidas: 0 })));
    const [topCostCenters, setTopCostCenters] = useState([]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const [{ data: txs }, { data: costCenters }] = await Promise.all([
                supabase.from('transactions').select('emission_date, amount, dc_type, cost_center_id')
                    .gte('emission_date', `${year}-01-01`).lte('emission_date', `${year}-12-31`),
                supabase.from('cost_centers').select('id, full_code, description'),
            ]);

            const months = Array.from({ length: 12 }, () => ({ entradas: 0, saidas: 0 }));
            const ccTotals = {};
            (txs || []).forEach(t => {
                if (!t.emission_date) return;
                const m = Number(t.emission_date.slice(5, 7)) - 1;
                const amt = Number(t.amount) || 0;
                if (t.dc_type === 'C') months[m].entradas += amt;
                else {
                    months[m].saidas += amt;
                    if (t.cost_center_id) ccTotals[t.cost_center_id] = (ccTotals[t.cost_center_id] || 0) + amt;
                }
            });

            const ccMap = Object.fromEntries((costCenters || []).map(c => [c.id, c.full_code ? `${c.full_code} - ${c.description}` : c.description]));
            const top = Object.entries(ccTotals)
                .map(([id, total]) => ({ id, label: ccMap[id] || 'Sem centro de custos', total }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 6);

            setMonthly(months);
            setTopCostCenters(top);
            setLoading(false);
        };
        load();
    }, [year]);

    const totalEntradas = monthly.reduce((s, m) => s + m.entradas, 0);
    const totalSaidas = monthly.reduce((s, m) => s + m.saidas, 0);
    const resultado = totalEntradas - totalSaidas;
    const margem = totalEntradas ? (resultado / totalEntradas) * 100 : 0;
    const maxBar = Math.max(1, ...monthly.map(m => Math.max(m.entradas, m.saidas)));
    const maxCc = Math.max(1, ...topCostCenters.map(c => c.total));

    return (
        <ScrollView style={s.reportScroll} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={s.monthNavRow}>
                <TouchableOpacity style={s.monthNavBtn} onPress={() => setYear(y => y - 1)}>
                    <Text style={s.monthNavBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.monthNavLabel}>{year}</Text>
                <TouchableOpacity style={s.monthNavBtn} onPress={() => setYear(y => y + 1)}>
                    <Text style={s.monthNavBtnText}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[s.todayBtn, year === new Date().getFullYear() && s.todayBtnDisabled]}
                    onPress={() => setYear(new Date().getFullYear())}
                    disabled={year === new Date().getFullYear()}
                >
                    <Text style={s.todayBtnText}>Ano Atual</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator color="#CCFF00" style={{ marginTop: 30 }} />
            ) : (
                <>
                    <View style={s.kpiRow}>
                        <KpiCard label="Receita" value={fmtBRL(totalEntradas)} color="#22c55e" />
                        <KpiCard label="Despesa" value={fmtBRL(totalSaidas)} color="#ef4444" />
                        <KpiCard label="Resultado" value={fmtBRL(resultado)} color={resultado < 0 ? '#ef4444' : '#CCFF00'} />
                    </View>
                    <View style={s.marginRow}>
                        <Text style={s.marginText}>Margem: {margem.toFixed(1)}%</Text>
                    </View>

                    <Text style={s.sectionTitle}>Mês a mês</Text>
                    <View style={s.monthList}>
                        {monthly.map((m, i) => (
                            <View key={i} style={s.monthAnalysisRow}>
                                <Text style={s.monthAnalysisName}>{MONTH_NAMES[i]}</Text>
                                <View style={s.monthBars}>
                                    <View style={[s.monthBar, s.monthBarIn, { width: `${(m.entradas / maxBar) * 100}%` }]} />
                                    <View style={[s.monthBar, s.monthBarOut, { width: `${(m.saidas / maxBar) * 100}%` }]} />
                                </View>
                                <Text style={[s.monthAnalysisResult, (m.entradas - m.saidas) < 0 && s.negative]}>
                                    {fmtBRL(m.entradas - m.saidas)}
                                </Text>
                            </View>
                        ))}
                    </View>

                    {topCostCenters.length > 0 && (
                        <>
                            <Text style={s.sectionTitle}>Maiores Centros de Custo (saídas)</Text>
                            <View style={s.monthList}>
                                {topCostCenters.map(c => (
                                    <View key={c.id} style={s.ccAnalysisRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.ccAnalysisLabel} numberOfLines={1}>{c.label}</Text>
                                            <View style={s.ccBarTrack}>
                                                <View style={[s.ccBarFill, { width: `${(c.total / maxCc) * 100}%` }]} />
                                            </View>
                                        </View>
                                        <Text style={s.ccAnalysisValue}>{fmtBRL(c.total)}</Text>
                                    </View>
                                ))}
                            </View>
                        </>
                    )}
                </>
            )}
        </ScrollView>
    );
}

function KpiCard({ label, value, color }) {
    return (
        <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>{label}</Text>
            <Text style={[s.kpiValue, { color }]}>{value}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, minHeight: 0, backgroundColor: '#0f172a' },
    body: { flex: 1, minHeight: 0 },
    reportScroll: { flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 12 },

    subTabs: { flexDirection: 'row', padding: 10, gap: 8 },
    subTab: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
    subTabActive: { backgroundColor: '#004d40', borderColor: '#CCFF00' },
    subTabText: { color: '#94a3b8', fontSize: 11.5, fontWeight: '700', textAlign: 'center' },
    subTabTextActive: { color: '#CCFF00' },

    monthNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 4 },
    monthNavBtn: { backgroundColor: '#1e293b', borderRadius: 8, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 14, paddingVertical: 6 },
    monthNavBtnText: { color: '#CCFF00', fontSize: 18, fontWeight: '800' },
    monthNavLabel: { color: '#fff', fontSize: 15, fontWeight: '800', minWidth: 90, textAlign: 'center' },
    todayBtn: { backgroundColor: '#004d40', borderRadius: 8, borderWidth: 1, borderColor: '#89962F', paddingHorizontal: 12, paddingVertical: 7 },
    todayBtnDisabled: { opacity: 0.35 },
    todayBtnText: { color: '#CCFF00', fontSize: 12, fontWeight: '800' },

    kpiRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    kpiCard: { flex: 1, backgroundColor: '#1e293b', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#334155' },
    kpiLabel: { color: '#64748b', fontSize: 10, fontWeight: '700' },
    kpiValue: { fontSize: 13, fontWeight: '800', marginTop: 4 },
    marginRow: { alignItems: 'center', marginTop: 8 },
    marginText: { color: '#89962F', fontSize: 12, fontWeight: '700' },

    saldoAntRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, marginTop: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1e293b' },
    saldoAntLabel: { color: '#89962F', fontSize: 12, fontWeight: '700' },
    saldoAntValue: { color: '#22c55e', fontSize: 14, fontWeight: '800' },
    negative: { color: '#ef4444' },

    dayList: { marginTop: 6 },
    dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
    dayNum: { color: '#64748b', fontWeight: '700', fontSize: 12, width: 20 },
    dayCell: { flex: 1, fontSize: 11, fontWeight: '700' },
    dayCellSaldo: { color: '#fff', fontWeight: '800', fontSize: 12, minWidth: 80, textAlign: 'right' },

    sectionTitle: { color: '#89962F', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 18, marginBottom: 6 },
    monthList: { marginTop: 2 },
    monthAnalysisRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
    monthAnalysisName: { color: '#fff', fontWeight: '700', fontSize: 12, width: 32 },
    monthBars: { flex: 1, gap: 2 },
    monthBar: { height: 5, borderRadius: 3, minWidth: 2 },
    monthBarIn: { backgroundColor: '#22c55e' },
    monthBarOut: { backgroundColor: '#ef4444' },
    monthAnalysisResult: { color: '#CCFF00', fontWeight: '800', fontSize: 12, minWidth: 80, textAlign: 'right' },

    ccAnalysisRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
    ccAnalysisLabel: { color: '#fff', fontSize: 12, fontWeight: '600', marginBottom: 4 },
    ccBarTrack: { height: 5, borderRadius: 3, backgroundColor: '#1e293b' },
    ccBarFill: { height: 5, borderRadius: 3, backgroundColor: '#ef4444' },
    ccAnalysisValue: { color: '#ef4444', fontWeight: '800', fontSize: 12 },
});
