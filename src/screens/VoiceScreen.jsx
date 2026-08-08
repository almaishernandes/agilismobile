import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Audio } from 'expo-av';
import { parseVoicePhrase } from '../lib/voiceParser';
import { useDrafts } from '../context/DraftContext';
import AccountPicker from '../components/AccountPicker';

export default function VoiceScreen({ navigation }) {
    const { addDraft } = useDrafts();

    const [recording, setRecording] = useState(null);
    const [listening, setListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [parsed, setParsed] = useState(null);
    const [account, setAccount] = useState(null);
    const [saving, setSaving] = useState(false);
    const [permGranted, setPermGranted] = useState(false);

    const requestPerm = async () => {
        const { granted } = await Audio.requestPermissionsAsync();
        setPermGranted(granted);
        return granted;
    };

    const startRecording = async () => {
        const ok = permGranted || await requestPerm();
        if (!ok) { Alert.alert('Permissão necessária', 'Habilite o microfone nas configurações.'); return; }
        try {
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            setRecording(rec);
            setListening(true);
        } catch (e) {
            Alert.alert('Erro', 'Não foi possível iniciar a gravação.');
        }
    };

    const stopRecording = async () => {
        if (!recording) return;
        setListening(false);
        await recording.stopAndUnloadAsync();
        setRecording(null);
        // Note: expo-av doesn't do STT natively; user types or edits the transcript
        // In a production build with EAS, integrate Google STT via REST API here
    };

    const handleParse = () => {
        if (!transcript.trim()) { Alert.alert('Digite ou dite a frase antes de analisar.'); return; }
        setParsed(parseVoicePhrase(transcript));
    };

    const handleSave = () => {
        if (!parsed) return;
        if (!account) { Alert.alert('Selecione uma conta antes de salvar.'); return; }
        addDraft({
            type: 'transaction',
            account_id: account.id,
            account_name: account.name,
            amount: parsed.amount,
            beneficiary: parsed.beneficiary,
            description: parsed.description,
        });
        navigation.goBack();
    };

    return (
        <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Text style={s.back}>‹ Voltar</Text></TouchableOpacity>
                <Text style={s.title}>🎤 Comando de Voz</Text>
                <Text style={s.hint}>Fale uma frase corrida. Ex: "Cinquenta reais no mercado no débito"</Text>
            </View>

            {/* Mic button */}
            <TouchableOpacity
                style={[s.micBtn, listening && s.micBtnActive]}
                onPressIn={startRecording}
                onPressOut={stopRecording}
                activeOpacity={0.85}
            >
                <Text style={s.micIcon}>{listening ? '⏺' : '🎤'}</Text>
                <Text style={s.micLabel}>{listening ? 'Gravando... solte para parar' : 'Pressione e segure para falar'}</Text>
            </TouchableOpacity>

            {/* Manual transcript input */}
            <View style={s.section}>
                <Text style={s.sectionLabel}>Frase (edite se necessário)</Text>
                <TextInput
                    style={s.transcriptInput}
                    value={transcript}
                    onChangeText={setTranscript}
                    placeholder="Ex: cinquenta e dois reais no Bar do Mirim no débito"
                    placeholderTextColor="#475569"
                    multiline
                    numberOfLines={3}
                />
                <TouchableOpacity style={s.parseBtn} onPress={handleParse}>
                    <Text style={s.parseBtnText}>🔍 Analisar Frase</Text>
                </TouchableOpacity>
            </View>

            {/* Parsed fields */}
            {parsed && (
                <View style={s.section}>
                    <Text style={s.sectionLabel}>Campos extraídos (ajuste se necessário)</Text>

                    <Text style={s.fieldLabel}>Valor (R$)</Text>
                    <TextInput style={s.field} value={String(parsed.amount)} keyboardType="numeric"
                        onChangeText={v => setParsed(p => ({ ...p, amount: parseFloat(v) || 0 }))} />

                    <Text style={s.fieldLabel}>Fornecedor</Text>
                    <TextInput style={s.field} value={parsed.beneficiary}
                        onChangeText={v => setParsed(p => ({ ...p, beneficiary: v }))} />

                    <Text style={s.fieldLabel}>Descrição</Text>
                    <TextInput style={s.field} value={parsed.description}
                        onChangeText={v => setParsed(p => ({ ...p, description: v }))} />

                    {parsed.paymentType ? (
                        <View style={s.payTypeBadge}>
                            <Text style={s.payTypeText}>Pagamento detectado: {parsed.paymentType}</Text>
                        </View>
                    ) : null}

                    <Text style={s.fieldLabel}>Conta</Text>
                    <AccountPicker selected={account} onSelect={setAccount} />

                    <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                        <Text style={s.saveBtnText}>✓ Salvar no Rascunho</Text>
                    </TouchableOpacity>
                </View>
            )}
        </ScrollView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    content: { paddingBottom: 40 },
    header: { backgroundColor: '#004d40', padding: 20, paddingTop: 60 },
    back: { color: '#CCFF00', fontSize: 16, marginBottom: 8 },
    title: { color: '#fff', fontWeight: '900', fontSize: 22 },
    hint: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4, lineHeight: 18 },
    micBtn: { margin: 20, backgroundColor: '#1e293b', borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 2, borderColor: '#004d40' },
    micBtnActive: { backgroundColor: '#7f1d1d', borderColor: '#ef4444' },
    micIcon: { fontSize: 48, marginBottom: 10 },
    micLabel: { color: '#fff', fontSize: 13, textAlign: 'center' },
    section: { marginHorizontal: 16, marginBottom: 20, backgroundColor: '#1e293b', borderRadius: 16, padding: 20 },
    sectionLabel: { color: '#89962F', fontSize: 11, letterSpacing: 1, marginBottom: 12 },
    transcriptInput: { backgroundColor: '#0f172a', color: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 14, fontSize: 15, minHeight: 80, textAlignVertical: 'top' },
    parseBtn: { backgroundColor: '#004d40', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
    parseBtnText: { color: '#CCFF00', fontWeight: '700', fontSize: 15 },
    fieldLabel: { color: '#89962F', fontSize: 11, marginTop: 14, marginBottom: 4 },
    field: { backgroundColor: '#0f172a', color: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#334155', padding: 12, fontSize: 16, fontWeight: '700' },
    payTypeBadge: { backgroundColor: '#004d40', borderRadius: 8, padding: 8, marginTop: 10, alignSelf: 'flex-start' },
    payTypeText: { color: '#CCFF00', fontSize: 12 },
    saveBtn: { backgroundColor: '#CCFF00', borderRadius: 12, padding: 18, alignItems: 'center', marginTop: 20 },
    saveBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 16 },
});
