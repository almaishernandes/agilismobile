import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useDrafts } from '../context/DraftContext';
import { signOut } from '../lib/auth';
import { supabase } from '../lib/supabase';
import QRScreen from './QRScreen';
import ManualScreen from './ManualScreen';
import TransactionsReport from './TransactionsReport';

function fmtBRL(n) {
    return `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
}

function DraftDetailRow({ label, value }) {
    return (
        <View style={s.draftDetailRow}>
            <Text style={s.draftDetailLabel}>{label}</Text>
            <Text style={s.draftDetailValue}>{value}</Text>
        </View>
    );
}

// Saldo por conta, agrupado por tipo (account_type) — mesma lógica do
// AgilisWeb (SaldoContas.jsx): soma amount com sinal conforme dc_type
// ('C' credita, 'D' debita), sem filtro de family_id no client (RLS cuida).
function AccountGroupPicker({ onSelectAccount }) {
    const [loading, setLoading] = useState(true);
    const [groups, setGroups] = useState([]);
    const [openGroups, setOpenGroups] = useState({});

    const load = async () => {
        setLoading(true);
        const [{ data: accounts }, { data: txs }] = await Promise.all([
            supabase.from('accounts').select('id, name, account_type, closing_day, due_day').order('name'),
            supabase.from('transactions').select('amount, dc_type, account_id'),
        ]);

        const balanceByAccount = {};
        (txs || []).forEach(t => {
            const amt = Number(t.amount) || 0;
            balanceByAccount[t.account_id] = (balanceByAccount[t.account_id] || 0) + (t.dc_type === 'C' ? amt : -amt);
        });

        const withSaldo = (accounts || []).map(a => ({ ...a, saldo: balanceByAccount[a.id] || 0 }));
        const byType = {};
        withSaldo.forEach(a => {
            const key = a.account_type || 'Outras';
            if (!byType[key]) byType[key] = [];
            byType[key].push(a);
        });
        const groupList = Object.entries(byType).map(([type, list]) => ({
            type,
            accounts: list,
            subtotal: list.reduce((s, a) => s + a.saldo, 0),
        }));
        setGroups(groupList);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const toggleGroup = (type) => setOpenGroups(prev => ({ ...prev, [type]: !prev[type] }));

    if (loading) {
        return (
            <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator color="#CCFF00" />
                <Text style={{ color: '#94a3b8', marginTop: 10, fontSize: 12 }}>Carregando contas...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={s.groupList} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={s.groupIntro}>Selecione uma conta para lançar</Text>
            {groups.length === 0 ? (
                <TouchableOpacity style={s.emptyState} onPress={load}>
                    <Text style={s.emptyIcon}>🏦</Text>
                    <Text style={s.emptyText}>Nenhuma conta cadastrada.{'\n'}Toque para tentar novamente.</Text>
                </TouchableOpacity>
            ) : groups.map(g => (
                <View key={g.type} style={s.groupCard}>
                    <TouchableOpacity style={s.groupHeader} onPress={() => toggleGroup(g.type)} activeOpacity={0.7}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <Text style={s.groupArrow}>{openGroups[g.type] ? '▾' : '▸'}</Text>
                            <Text style={s.groupTitle}>{g.type}</Text>
                        </View>
                        <Text style={[s.groupSubtotal, g.subtotal < 0 && s.negative]}>{fmtBRL(g.subtotal)}</Text>
                    </TouchableOpacity>

                    {openGroups[g.type] && g.accounts.map(a => (
                        <TouchableOpacity key={a.id} style={s.accountRow} onPress={() => onSelectAccount(a)} activeOpacity={0.7}>
                            <Text style={s.accountName}>{a.name}</Text>
                            <Text style={[s.accountSaldo, a.saldo < 0 && s.negative]}>{fmtBRL(a.saldo)}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            ))}
        </ScrollView>
    );
}

// A foto do comprovante deixou de ser uma aba própria: agora é um passo
// oferecido logo após gravar o lançamento, em qualquer uma das 3 abas.
const TABS = {
    qr: { label: 'QR Code', icon: '📷', style: 'qBtnQR', Component: QRScreen, props: { forcedMode: 'qr' } },
    manual: { label: 'Digitação', icon: '📝', style: 'qBtnManual', Component: ManualScreen },
    report: { label: 'Lançamentos', icon: '📊', style: 'qBtnReport', Component: TransactionsReport },
};

function isToday(iso) {
    if (!iso) return false;
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function HomeScreen({ navigation }) {
    const { drafts: allDrafts, removeDraft } = useDrafts();
    const [activeTab, setActiveTab] = useState(null);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [expandedDraftId, setExpandedDraftId] = useState(null);

    // O relatório de rascunhos zera todo dia: só mostra o que foi lançado
    // hoje, mesmo que rascunhos de dias anteriores ainda estejam salvos.
    const drafts = allDrafts.filter(d => isToday(d.date_created));
    const totalAmount = drafts.reduce((s, d) => s + (d.amount || 0), 0);

    const handleDelete = (id) => {
        Alert.alert('Remover', 'Deseja remover este rascunho?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Remover', style: 'destructive', onPress: () => removeDraft(id) },
        ]);
    };

    const toggleTab = (key) => setActiveTab(prev => (prev === key ? null : key));

    const ActiveComponent = activeTab ? TABS[activeTab].Component : null;
    const activeProps = activeTab ? (TABS[activeTab].props || {}) : {};

    return (
        <View style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.logo}>Agilis Mobile</Text>
                    <Text style={s.headerSub}>Movimentação/Lançamentos</Text>
                </View>
                <TouchableOpacity onPress={signOut} style={s.logoutBtn}>
                    <Text style={s.logoutText}>Sair</Text>
                </TouchableOpacity>
            </View>

            {!selectedAccount ? (
                <AccountGroupPicker onSelectAccount={setSelectedAccount} />
            ) : (
                <>
                    {/* Conta selecionada — troca a qualquer momento */}
                    <TouchableOpacity
                        style={s.selectedAccountBar}
                        onPress={() => { setSelectedAccount(null); setActiveTab(null); }}
                        activeOpacity={0.7}
                    >
                        <View>
                            <Text style={s.selectedAccountLabel}>CONTA SELECIONADA</Text>
                            <Text style={s.selectedAccountName}>{selectedAccount.name}</Text>
                        </View>
                        <Text style={s.selectedAccountChange}>Trocar ›</Text>
                    </TouchableOpacity>

                    {/* 3 Quick-entry tabs */}
                    <View style={s.quickBtns}>
                        {Object.entries(TABS).map(([key, tab]) => (
                            <TouchableOpacity
                                key={key}
                                style={[s.qBtn, s[tab.style], activeTab === key && s.qBtnActive]}
                                onPress={() => toggleTab(key)}
                                activeOpacity={0.8}
                            >
                                <Text style={s.qIcon}>{tab.icon}</Text>
                                <Text style={s.qLabel}>{tab.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {ActiveComponent ? (
                        <ActiveComponent navigation={{ goBack: () => setActiveTab(null) }} account={selectedAccount} {...activeProps} />
                    ) : (
                        <>
                            {/* Draft summary card */}
                    <View style={s.summaryCard}>
                        <View style={s.summaryRow}>
                            <View>
                                <Text style={s.summaryLabel}>Rascunhos pendentes</Text>
                                <Text style={s.summaryCount}>{drafts.length} {drafts.length === 1 ? 'item' : 'itens'}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={s.summaryLabel}>Total acumulado</Text>
                                <Text style={s.summaryTotal}>{fmtBRL(totalAmount)}</Text>
                            </View>
                        </View>
                    </View>

                    {/* Draft list */}
                    <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: 120 }}>
                        {drafts.length === 0 ? (
                            <View style={s.emptyState}>
                                <Text style={s.emptyIcon}>📋</Text>
                                <Text style={s.emptyText}>Nenhum rascunho ainda.{'\n'}Adicione lançamentos acima.</Text>
                            </View>
                        ) : (
                            drafts.map(d => {
                                const open = expandedDraftId === d.id;
                                return (
                                    <View key={d.id} style={s.draftCard}>
                                        <TouchableOpacity
                                            style={s.draftRow}
                                            onPress={() => setExpandedDraftId(open ? null : d.id)}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={s.draftRowArrow}>{open ? '▾' : '▸'}</Text>
                                            <Text style={s.draftRowIcon}>
                                                {d.type === 'nfce_import' ? '🧾' : d.chave_nfce ? '🧾' : d.photo_uri ? '📷' : '📝'}
                                            </Text>
                                            <Text style={s.draftRowLabel} numberOfLines={1}>{d.beneficiary || d.chave_nfce || 'Sem fornecedor'}</Text>
                                            <Text style={s.draftAmount}>{d.amount ? fmtBRL(d.amount) : '—'}</Text>
                                            <TouchableOpacity onPress={() => handleDelete(d.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                                <Text style={s.draftDel}>✕</Text>
                                            </TouchableOpacity>
                                        </TouchableOpacity>

                                        {open && (
                                            <View style={s.draftDetail}>
                                                <DraftDetailRow label="Conta" value={d.account_name || '—'} />
                                                <DraftDetailRow label="Descrição" value={d.description || '—'} />
                                                <DraftDetailRow label="Valor" value={fmtBRL(d.amount)} />
                                                <DraftDetailRow label="Tipo" value={d.dc_type === 'C' ? 'Entrada' : d.dc_type === 'T' ? 'Transferência' : 'Saída'} />
                                                <DraftDetailRow label="Parcelas" value={`${d.installments || 1}x`} />
                                                <DraftDetailRow label="Registrado em" value={new Date(d.date_created).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} />
                                                <DraftDetailRow label="Status" value={d.synced ? '✓ Gravado no banco' : '⏳ Pendente de reenvio'} />
                                            </View>
                                        )}
                                    </View>
                                );
                            })
                        )}
                    </ScrollView>

                    {/* Close day button */}
                    <View style={s.footer}>
                        <TouchableOpacity
                            style={[s.closeBtn, drafts.length === 0 && s.closeBtnDisabled]}
                            disabled={drafts.length === 0}
                            onPress={() => navigation.navigate('Review')}
                            activeOpacity={0.85}
                        >
                            <Text style={s.closeBtnText}>📄 Fechar Dia e Gerar PDF de Conferência</Text>
                        </TouchableOpacity>
                    </View>
                        </>
                    )}
                </>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    header: { backgroundColor: '#004d40', paddingHorizontal: 20, paddingVertical: 14, paddingTop: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    logo: { color: '#CCFF00', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
    headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4 },
    logoutBtn: { padding: 8 },
    logoutText: { color: '#CCFF00', fontSize: 13 },

    groupList: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
    groupIntro: { color: '#94a3b8', fontSize: 12, marginBottom: 12, textAlign: 'center' },
    groupCard: { backgroundColor: '#1e293b', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
    groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
    groupArrow: { color: '#CCFF00', fontSize: 13, width: 14 },
    groupTitle: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
    groupSubtotal: { color: '#CCFF00', fontWeight: '800', fontSize: 13 },
    accountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, paddingLeft: 34, borderTopWidth: 1, borderTopColor: '#0f172a' },
    accountName: { color: '#e2e8f0', fontSize: 13 },
    accountSaldo: { color: '#89962F', fontWeight: '700', fontSize: 13 },
    negative: { color: '#ef4444' },

    selectedAccountBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginTop: 12, backgroundColor: '#004d40', borderRadius: 12, padding: 14 },
    selectedAccountLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    selectedAccountName: { color: '#CCFF00', fontSize: 15, fontWeight: '800', marginTop: 2 },
    selectedAccountChange: { color: '#fff', fontSize: 12 },

    quickBtns: { flexDirection: 'row', padding: 12, gap: 8 },
    qBtn: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', justifyContent: 'center', minHeight: 60, borderWidth: 1 },
    qBtnActive: { borderColor: '#CCFF00', borderWidth: 2, backgroundColor: '#263a1e' },
    qBtnQR: { backgroundColor: '#1e293b', borderColor: '#004d40' },
    qBtnManual: { backgroundColor: '#1e293b', borderColor: '#334155' },
    qBtnReport: { backgroundColor: '#1e293b', borderColor: '#1565c0' },
    qIcon: { fontSize: 18, marginBottom: 3 },
    qLabel: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 15 },

    summaryCard: { marginHorizontal: 16, backgroundColor: '#004d40', borderRadius: 14, padding: 18, marginBottom: 4 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    summaryLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 4 },
    summaryCount: { color: '#fff', fontSize: 22, fontWeight: '800' },
    summaryTotal: { color: '#CCFF00', fontSize: 22, fontWeight: '900' },

    list: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
    emptyState: { alignItems: 'center', marginTop: 48, opacity: 0.5 },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyText: { color: '#94a3b8', textAlign: 'center', lineHeight: 22 },

    draftCard: { backgroundColor: '#1e293b', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
    draftRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
    draftRowArrow: { color: '#CCFF00', fontSize: 13, width: 14, textAlign: 'center' },
    draftRowIcon: { fontSize: 16 },
    draftRowLabel: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 13 },
    draftAmount: { color: '#CCFF00', fontWeight: '900', fontSize: 14 },
    draftDel: { color: '#475569', fontSize: 16, paddingLeft: 4 },
    draftDetail: { borderTopWidth: 1, borderTopColor: '#0f172a', padding: 12, paddingTop: 8 },
    draftDetailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
    draftDetailLabel: { color: '#89962F', fontSize: 11, flexShrink: 0, marginRight: 8 },
    draftDetailValue: { color: '#fff', fontSize: 12, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#0f172a', borderTopWidth: 1, borderTopColor: '#1e293b' },
    closeBtn: { backgroundColor: '#CCFF00', borderRadius: 14, padding: 18, alignItems: 'center' },
    closeBtnDisabled: { opacity: 0.3 },
    closeBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 15 },
});
