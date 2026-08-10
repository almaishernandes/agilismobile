import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useDrafts } from '../context/DraftContext';
import { getSecurityContext } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { buildPdfHtml } from '../lib/pdfGenerator';

function fmtBRL(n) { return `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`; }
function addMonths(iso, n) {
    const d = new Date(iso);
    d.setMonth(d.getMonth() + n);
    return d.toISOString().split('T')[0];
}

export default function ReviewScreen({ navigation }) {
    const { drafts, totalAmount, clearAll } = useDrafts();
    const [generating, setGenerating] = useState(false);
    const [exporting, setExporting] = useState(false);

    const handleGeneratePDF = async () => {
        if (drafts.length === 0) return;
        setGenerating(true);
        try {
            const html = buildPdfHtml(drafts);
            const { uri } = await Print.printToFileAsync({ html, base64: false });
            await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Relatório de Conferência' });
        } catch (e) {
            Alert.alert('Erro ao gerar PDF', e.message);
        } finally {
            setGenerating(false);
        }
    };

    const handleExport = async () => {
        const pendingCount = drafts.filter(d => !d.synced).length;
        if (pendingCount === 0) {
            Alert.alert('Nada a exportar', 'Todos os itens já foram enviados ao banco (ex: QR Code). O rascunho será limpo.', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'LIMPAR RASCUNHO', style: 'default', onPress: doExport },
            ]);
            return;
        }
        Alert.alert(
            '🚀 Exportar para o AGILI$',
            `Confirma o envio de ${pendingCount} item(ns) pendente(s) para o banco de dados? Itens de QR Code já enviados não serão duplicados. Após a exportação, o rascunho será limpo.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'CONFIRMAR', style: 'default', onPress: doExport },
            ]
        );
    };

    const doExport = async () => {
        setExporting(true);
        try {
            const ctx = await getSecurityContext();
            if (!ctx?.user_id) throw new Error('Sessão expirada. Faça login novamente.');

            const today = new Date().toISOString().split('T')[0];

            // Separate by type — itens já sincronizados na hora (ex: QR Code)
            // não entram aqui de novo, só o que ainda está pendente de envio.
            const pending = drafts.filter(d => !d.synced);
            const txDrafts = pending.filter(d => d.type === 'transaction');
            const nfceDrafts = pending.filter(d => d.type === 'nfce_import');

            // Build transaction rows (expand installments)
            const txRows = [];
            for (const d of txDrafts) {
                const n = d.installments || 1;
                for (let i = 0; i < n; i++) {
                    txRows.push({
                        account_id: d.account_id,
                        emission_date: today,
                        due_date: addMonths(today, i),
                        description: n > 1 ? `${d.description || d.beneficiary} (${i + 1}/${n})` : (d.description || d.beneficiary),
                        amount: (d.amount || 0) / n,
                        dc_type: 'D',
                        type: 'Expense',
                        beneficiary_id: null,
                        user_id: ctx.user_id,
                        family_id: ctx.family_id,
                    });
                }
            }

            // Build nfce rows
            const nfceRows = nfceDrafts.map(d => ({
                chave: d.chave_nfce,
                emitente_nome: d.beneficiary || null,
                raw_data: { photo_uri: d.photo_uri || null, fonte: 'agilis_input' },
                user_id: ctx.user_id,
                family_id: ctx.family_id,
            }));

            // Bulk insert transactions
            if (txRows.length > 0) {
                const { error } = await supabase.from('transactions').insert(txRows);
                if (error) throw new Error(`Transactions: ${error.message}`);
            }

            // Bulk insert nfce (skip if no chave)
            const validNfce = nfceRows.filter(r => r.chave);
            if (validNfce.length > 0) {
                const { error } = await supabase.from('nfce_imports').insert(validNfce);
                if (error) throw new Error(`NFC-e: ${error.message}`);
            }

            clearAll();
            navigation.navigate('Home');
            Alert.alert('✓ Exportação concluída!', `${txRows.length} lançamento(s) e ${validNfce.length} NFC-e(s) enviados com sucesso.`);

        } catch (e) {
            Alert.alert('Erro na exportação', e.message);
        } finally {
            setExporting(false);
        }
    };

    return (
        <View style={s.container}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Text style={s.back}>‹ Voltar</Text></TouchableOpacity>
                <Text style={s.title}>📄 Conferência do Dia</Text>
                <View style={s.summary}>
                    <Text style={s.summaryText}>{drafts.length} itens · Total: {fmtBRL(totalAmount)}</Text>
                </View>
            </View>

            <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: 180 }}>
                {drafts.map((d, idx) => (
                    <View key={d.id} style={s.card}>
                        <View style={s.cardHeader}>
                            <Text style={s.cardIdx}>{idx + 1}</Text>
                            <Text style={s.cardType}>{d.type === 'nfce_import' ? '🧾 NFC-e' : '📝 Transação'}</Text>
                            {d.synced && <Text style={s.syncedBadge}>✓ Enviado</Text>}
                            <Text style={s.cardAccount}>{d.account_name || 'Sem conta'}</Text>
                        </View>
                        <View style={s.cardBody}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.cardBenef}>{d.beneficiary || d.chave_nfce || '—'}</Text>
                                <Text style={s.cardDesc}>{d.description || ''}</Text>
                                {d.installments > 1 && <Text style={s.cardInstall}>{d.installments}x de {fmtBRL((d.amount || 0) / d.installments)}</Text>}
                                {d.chave_nfce && <Text style={s.cardChave}>{d.chave_nfce}</Text>}
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                {d.amount ? <Text style={s.cardAmount}>{fmtBRL(d.amount)}</Text> : null}
                                {d.photo_uri ? <Text style={s.photoTag}>📷 Foto</Text> : null}
                            </View>
                        </View>
                    </View>
                ))}
            </ScrollView>

            {/* Action buttons */}
            <View style={s.footer}>
                <TouchableOpacity style={s.pdfBtn} onPress={handleGeneratePDF} disabled={generating}>
                    {generating ? <ActivityIndicator color="#CCFF00" /> : <Text style={s.pdfBtnText}>📄 Visualizar PDF de Conferência</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.exportBtn} onPress={handleExport} disabled={exporting || drafts.length === 0}>
                    {exporting ? <ActivityIndicator color="#0f172a" /> : <Text style={s.exportBtnText}>🚀 EXPORTAR PARA O AGILI$</Text>}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    header: { backgroundColor: '#004d40', padding: 20, paddingTop: 60 },
    back: { color: '#CCFF00', fontSize: 16, marginBottom: 8 },
    title: { color: '#fff', fontWeight: '900', fontSize: 22 },
    summary: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: 10, marginTop: 10 },
    summaryText: { color: '#CCFF00', fontWeight: '700', fontSize: 14 },
    list: { flex: 1, padding: 16 },
    card: { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
    cardIdx: { color: '#475569', fontSize: 11, fontWeight: '700', width: 20 },
    cardType: { color: '#89962F', fontSize: 11 },
    syncedBadge: { color: '#0f172a', backgroundColor: '#CCFF00', fontSize: 9, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    cardAccount: { flex: 1, color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'right' },
    cardBody: { flexDirection: 'row', alignItems: 'flex-start' },
    cardBenef: { color: '#fff', fontWeight: '700', fontSize: 15 },
    cardDesc: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
    cardInstall: { color: '#89962F', fontSize: 11, marginTop: 4 },
    cardChave: { color: '#475569', fontSize: 9, fontFamily: 'monospace', marginTop: 4 },
    cardAmount: { color: '#CCFF00', fontWeight: '900', fontSize: 18 },
    photoTag: { color: '#89962F', fontSize: 11, marginTop: 4 },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: '#1e293b' },
    pdfBtn: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#004d40' },
    pdfBtnText: { color: '#CCFF00', fontWeight: '700', fontSize: 15 },
    exportBtn: { backgroundColor: '#CCFF00', borderRadius: 14, padding: 20, alignItems: 'center' },
    exportBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
});
