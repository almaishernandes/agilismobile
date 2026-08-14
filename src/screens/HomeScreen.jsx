import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useDrafts } from '../context/DraftContext';
import { signOut } from '../lib/auth';

function fmtBRL(n) {
    return `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
}

export default function HomeScreen({ navigation }) {
    const { drafts, totalAmount, removeDraft } = useDrafts();

    const handleDelete = (id) => {
        Alert.alert('Remover', 'Deseja remover este rascunho?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Remover', style: 'destructive', onPress: () => removeDraft(id) },
        ]);
    };

    return (
        <View style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.logo}>💰 Agilis Mobile</Text>
                    <Text style={s.headerSub}>Movimentação/Lançamentos</Text>
                </View>
                <TouchableOpacity onPress={signOut} style={s.logoutBtn}>
                    <Text style={s.logoutText}>Sair</Text>
                </TouchableOpacity>
            </View>

            {/* 3 Quick-entry buttons */}
            <View style={s.quickBtns}>
                <TouchableOpacity style={[s.qBtn, s.qBtnQR]} onPress={() => navigation.navigate('QRScan')} activeOpacity={0.8}>
                    <Text style={s.qIcon}>📷</Text>
                    <Text style={s.qLabel}>QR Code{'\n'}/ Foto</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.qBtn, s.qBtnVoice]} onPress={() => navigation.navigate('Voice')} activeOpacity={0.8}>
                    <Text style={s.qIcon}>🎤</Text>
                    <Text style={s.qLabel}>Voz</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.qBtn, s.qBtnManual]} onPress={() => navigation.navigate('Manual')} activeOpacity={0.8}>
                    <Text style={s.qIcon}>📝</Text>
                    <Text style={s.qLabel}>Digitação</Text>
                </TouchableOpacity>
            </View>

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
                    drafts.map(d => (
                        <View key={d.id} style={s.draftCard}>
                            <View style={s.draftLeft}>
                                <Text style={s.draftType}>
                                    {d.type === 'nfce_import' ? '🧾 NFC-e' : d.chave_nfce ? '🧾' : d.photo_uri ? '📷' : '📝'}
                                </Text>
                                <View>
                                    <Text style={s.draftBenef}>{d.beneficiary || d.chave_nfce || 'Sem fornecedor'}</Text>
                                    <Text style={s.draftDesc}>{d.description || d.account_name || ''}</Text>
                                    {d.installments > 1 && <Text style={s.draftInstall}>{d.installments}x parcelas</Text>}
                                </View>
                            </View>
                            <View style={s.draftRight}>
                                <Text style={s.draftAmount}>{d.amount ? fmtBRL(d.amount) : '—'}</Text>
                                <TouchableOpacity onPress={() => handleDelete(d.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Text style={s.draftDel}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))
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
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    header: { backgroundColor: '#004d40', padding: 20, paddingTop: 60, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    logo: { color: '#CCFF00', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
    headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
    logoutBtn: { padding: 8 },
    logoutText: { color: '#CCFF00', fontSize: 13 },

    quickBtns: { flexDirection: 'row', padding: 16, gap: 10 },
    qBtn: { flex: 1, borderRadius: 16, padding: 20, alignItems: 'center', justifyContent: 'center', minHeight: 90, borderWidth: 1 },
    qBtnQR: { backgroundColor: '#1e293b', borderColor: '#004d40' },
    qBtnVoice: { backgroundColor: '#1e293b', borderColor: '#89962F' },
    qBtnManual: { backgroundColor: '#1e293b', borderColor: '#334155' },
    qIcon: { fontSize: 26, marginBottom: 6 },
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

    draftCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
    draftLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    draftType: { fontSize: 22 },
    draftBenef: { color: '#fff', fontWeight: '700', fontSize: 14 },
    draftDesc: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
    draftInstall: { color: '#89962F', fontSize: 11, marginTop: 2 },
    draftRight: { alignItems: 'flex-end', gap: 8 },
    draftAmount: { color: '#CCFF00', fontWeight: '900', fontSize: 15 },
    draftDel: { color: '#475569', fontSize: 16 },

    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#0f172a', borderTopWidth: 1, borderTopColor: '#1e293b' },
    closeBtn: { backgroundColor: '#CCFF00', borderRadius: 14, padding: 18, alignItems: 'center' },
    closeBtnDisabled: { opacity: 0.3 },
    closeBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 15 },
});
