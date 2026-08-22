import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image, ScrollView, ActivityIndicator } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useDrafts } from '../context/DraftContext';
import AccountPicker from '../components/AccountPicker';
import CameraScanner from '../components/CameraScanner';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';

function extractChave(data) {
    const m = data.match(/\b(\d{44})\b/);
    return m ? m[1] : null;
}

function extractEmitente(url) {
    try {
        const u = new URL(url);
        return u.searchParams.get('xNome') || u.searchParams.get('cNPJ') || '';
    } catch { return ''; }
}

export default function QRScreen({ navigation, forcedMode }) {
    const { addDraft } = useDrafts();
    const [permission, requestPermission] = useCameraPermissions();
    const [mode, setMode] = useState(forcedMode || 'qr'); // 'qr' | 'photo'
    const [scanned, setScanned] = useState(false);
    const [scannedData, setScannedData] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [nfceData, setNfceData] = useState(null);
    const [photo, setPhoto] = useState(null);
    const [account, setAccount] = useState(null);

    const handleBarcode = async ({ data }) => {
        if (scanned) return;
        setScanned(true);
        setScannedData(data);
        setProcessing(true);
        try {
            const { data: result, error } = await supabase.functions.invoke('process-nfce', {
                body: { url: data },
            });
            if (error) throw error;
            setNfceData(result);
        } catch (err) {
            Alert.alert('Aviso', 'Não foi possível processar a nota automaticamente. Você pode preencher os dados manualmente.');
        } finally {
            setProcessing(false);
        }
    };

    const handlePickPhoto = async () => {
        const { granted } = await ImagePicker.requestCameraPermissionsAsync();
        if (!granted) { Alert.alert('Permissão necessária'); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: false });
        if (!result.canceled) setPhoto(result.assets[0].uri);
    };

    const handleSaveQR = async () => {
        if (!account) { Alert.alert('Selecione uma conta antes de salvar.'); return; }
        const chave = nfceData?.chave_nfce || extractChave(scannedData);
        const emitente = nfceData?.emitente || extractEmitente(scannedData);

        // Grava em nfce_imports para aparecer em tempo real no painel web
        // (Integração → NFC-App Agilis), que compartilha o mesmo banco. O QR
        // Code já vem com dados completos e confiáveis, então vai direto —
        // diferente de voz/digitação, que ficam pendentes de revisão.
        const ctx = await getSecurityContext();
        const { error } = await supabase.from('nfce_imports').insert([{
            chave,
            emitente_nome: emitente || 'Lido via QR Code',
            valor_total: nfceData?.amount ?? null,
            metodo: 'app_mobile',
            raw_data: { qr_url: scannedData, fonte: 'app_mobile' },
            user_id: ctx?.user_id ?? null,
            family_id: ctx?.family_id ?? null,
        }]);

        if (error) {
            Alert.alert('Aviso', 'Não foi possível enviar ao banco agora. O item foi salvo no rascunho e será reenviado ao fechar o dia.');
        }

        addDraft({
            type: 'nfce_import',
            account_id: account.id,
            account_name: account.name,
            beneficiary: emitente,
            description: 'NFC-e via QR Code',
            chave_nfce: chave,
            amount: nfceData?.amount,
            synced: !error,
        });

        navigation.goBack();
    };

    const handleSavePhoto = () => {
        if (!photo) { Alert.alert('Tire uma foto antes de salvar.'); return; }
        if (!account) { Alert.alert('Selecione uma conta antes de salvar.'); return; }
        addDraft({
            type: 'nfce_import',
            account_id: account.id,
            account_name: account.name,
            description: 'Comprovante fotografado',
            photo_uri: photo,
        });
        navigation.goBack();
    };

    if (!permission) return <View style={s.container} />;
    if (!permission.granted) {
        return (
            <View style={s.container}>
                <Text style={s.msg}>Permissão de câmera necessária</Text>
                <TouchableOpacity style={s.btn} onPress={requestPermission}>
                    <Text style={s.btnText}>Permitir Câmera</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <ScrollView style={s.container} contentContainerStyle={{ flexGrow: 1 }}>
            {/* Mode toggle — só aparece se não vier de uma aba dedicada */}
            {!forcedMode && (
                <View style={s.header}>
                    <View style={s.tabs}>
                        <TouchableOpacity style={[s.tab, mode === 'qr' && s.tabActive]} onPress={() => { setMode('qr'); setScanned(false); }}>
                            <Text style={[s.tabText, mode === 'qr' && s.tabTextActive]}>QR Code</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.tab, mode === 'photo' && s.tabActive]} onPress={() => setMode('photo')}>
                            <Text style={[s.tabText, mode === 'photo' && s.tabTextActive]}>Foto Fallback</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {mode === 'qr' && !scanned && (
                <View style={s.cameraWrap}>
                    <CameraScanner active={!scanned} onScanned={handleBarcode} hint="Aponte para o QR Code do cupom fiscal" />
                    {!forcedMode && (
                        <TouchableOpacity style={s.photoFallbackBtn} onPress={() => setMode('photo')}>
                            <Text style={s.photoFallbackText}>QR rasurado? Tire uma foto</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {mode === 'qr' && scanned && scannedData && (
                <View style={s.resultCard}>
                    {processing ? (
                        <View style={s.processingRow}>
                            <ActivityIndicator color="#CCFF00" />
                            <Text style={s.processingText}>Processando NFC-e...</Text>
                        </View>
                    ) : (
                        <Text style={s.resultTitle}>✓ QR Code Detectado</Text>
                    )}
                    <Text style={s.resultLabel}>Emitente</Text>
                    <Text style={s.resultVal}>{nfceData?.emitente || extractEmitente(scannedData) || 'Não identificado'}</Text>
                    <Text style={s.resultLabel}>Chave NFC-e (44 dígitos)</Text>
                    <Text style={s.resultChave}>{nfceData?.chave_nfce || extractChave(scannedData) || 'Não encontrada'}</Text>
                    {nfceData?.amount != null && (
                        <>
                            <Text style={s.resultLabel}>Valor</Text>
                            <Text style={s.resultVal}>R$ {Number(nfceData.amount).toFixed(2).replace('.', ',')}</Text>
                        </>
                    )}

                    <Text style={s.resultLabel}>Conta</Text>
                    <AccountPicker selected={account} onSelect={setAccount} />

                    <View style={s.rowBtns}>
                        <TouchableOpacity style={s.btnSecondary} onPress={() => { setScanned(false); setScannedData(null); setNfceData(null); }}>
                            <Text style={s.btnSecondaryText}>Reler</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.btnPrimary} onPress={handleSaveQR} disabled={processing}>
                            <Text style={s.btnPrimaryText}>✓ Salvar Rascunho</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {mode === 'photo' && (
                <View style={s.resultCard}>
                    <Text style={s.resultTitle}>📷 Foto do Comprovante</Text>
                    {photo ? (
                        <Image source={{ uri: photo }} style={s.photoPreview} resizeMode="contain" />
                    ) : (
                        <View style={s.photoPlaceholder}>
                            <Text style={s.photoPlaceholderIcon}>📄</Text>
                            <Text style={s.photoPlaceholderText}>Nenhuma foto tirada ainda</Text>
                        </View>
                    )}
                    <TouchableOpacity style={s.takePhotoBtn} onPress={handlePickPhoto}>
                        <Text style={s.takePhotoBtnText}>📷 {photo ? 'Tirar outra foto' : 'Tirar Foto do Comprovante'}</Text>
                    </TouchableOpacity>

                    {photo && (
                        <>
                            <Text style={s.resultLabel}>Conta</Text>
                            <AccountPicker selected={account} onSelect={setAccount} />
                            <TouchableOpacity style={[s.btnPrimary, { marginTop: 16 }]} onPress={handleSavePhoto}>
                                <Text style={s.btnPrimaryText}>✓ Salvar Rascunho com Foto</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            )}
        </ScrollView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    header: { backgroundColor: '#0f172a', padding: 16, paddingBottom: 8 },
    tabs: { flexDirection: 'row', gap: 8 },
    tab: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
    tabActive: { backgroundColor: '#CCFF00', borderColor: '#CCFF00' },
    tabText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
    tabTextActive: { color: '#0f172a', fontWeight: '700' },
    cameraWrap: { height: 420, position: 'relative', backgroundColor: '#000' },
    photoFallbackBtn: { position: 'absolute', bottom: 12, left: 0, right: 0, alignItems: 'center' },
    photoFallbackText: { color: '#CCFF00', fontSize: 13, textDecorationLine: 'underline' },
    resultCard: { margin: 16, backgroundColor: '#1e293b', borderRadius: 16, padding: 20 },
    resultTitle: { color: '#CCFF00', fontSize: 20, fontWeight: '800', marginBottom: 16 },
    processingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    processingText: { color: '#CCFF00', fontSize: 15, fontWeight: '700' },
    resultLabel: { color: '#89962F', fontSize: 11, marginTop: 12, marginBottom: 4 },
    resultVal: { color: '#fff', fontSize: 16, fontWeight: '700' },
    resultChave: { color: '#CCFF00', fontSize: 10, fontFamily: 'monospace', lineHeight: 16 },
    rowBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
    btnPrimary: { flex: 2, backgroundColor: '#CCFF00', borderRadius: 12, padding: 16, alignItems: 'center' },
    btnPrimaryText: { color: '#0f172a', fontWeight: '900', fontSize: 15 },
    btnSecondary: { flex: 1, backgroundColor: '#0f172a', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
    btnSecondaryText: { color: '#fff', fontSize: 14 },
    photoPlaceholder: { height: 180, backgroundColor: '#0f172a', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    photoPlaceholderIcon: { fontSize: 40, marginBottom: 8 },
    photoPlaceholderText: { color: '#475569', fontSize: 13 },
    photoPreview: { width: '100%', height: 200, borderRadius: 12, marginBottom: 12 },
    takePhotoBtn: { backgroundColor: '#004d40', borderRadius: 10, padding: 14, alignItems: 'center' },
    takePhotoBtnText: { color: '#CCFF00', fontWeight: '700', fontSize: 15 },
    msg: { color: '#fff', textAlign: 'center', margin: 40, fontSize: 16 },
    btn: { backgroundColor: '#CCFF00', borderRadius: 10, padding: 16, paddingHorizontal: 32, alignSelf: 'center' },
    btnText: { color: '#0f172a', fontWeight: '800', fontSize: 15 },
});
