import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { parseVoicePhrase } from '../lib/voiceParser';
import { useDrafts } from '../context/DraftContext';
import AccountPicker from '../components/AccountPicker';

const SpeechRecognitionAPI =
    typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export default function VoiceScreen({ navigation }) {
    const { addDraft } = useDrafts();

    const [listening, setListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [account, setAccount] = useState(null);
    const [installments, setInstallments] = useState('1');
    const [unsupported, setUnsupported] = useState(!SpeechRecognitionAPI);
    const recognitionRef = useRef(null);

    const parsed = parseVoicePhrase(transcript);

    useEffect(() => {
        if (!SpeechRecognitionAPI) return;
        const recognition = new SpeechRecognitionAPI();
        recognition.lang = 'pt-BR';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
            let combined = '';
            for (let i = 0; i < event.results.length; i++) {
                combined += event.results[i][0].transcript + ' ';
            }
            setTranscript(combined.trim());
        };
        recognition.onerror = () => setListening(false);
        recognition.onend = () => setListening(false);

        recognitionRef.current = recognition;
        return () => recognition.stop();
    }, []);

    const toggleListening = () => {
        if (!SpeechRecognitionAPI) { setUnsupported(true); return; }
        if (listening) {
            recognitionRef.current?.stop();
            setListening(false);
        } else {
            setTranscript('');
            recognitionRef.current?.start();
            setListening(true);
        }
    };

    const handleSave = () => {
        if (!parsed.amount) { Alert.alert('Valor não identificado. Fale ou ajuste o valor antes de salvar.'); return; }
        if (!account) { Alert.alert('Selecione uma conta antes de salvar.'); return; }
        addDraft({
            type: 'transaction',
            account_id: account.id,
            account_name: account.name,
            amount: parsed.amount,
            beneficiary: parsed.beneficiary,
            description: parsed.description,
            installments: parseInt(installments) || 1,
        });
        navigation.goBack();
    };

    return (
        <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            <Text style={s.hint}>Toque no microfone e fale a frase completa. Ex: "Cinquenta reais no mercado no débito"</Text>

            {/* Mic button */}
            <TouchableOpacity
                style={[s.micBtn, listening && s.micBtnActive]}
                onPress={toggleListening}
                activeOpacity={0.85}
            >
                <Text style={s.micIcon}>{listening ? '⏺' : '🎤'}</Text>
                <Text style={s.micLabel}>{listening ? 'Parar' : 'Iniciar'}</Text>
            </TouchableOpacity>

            {unsupported && (
                <View style={s.section}>
                    <Text style={s.unsupportedText}>
                        Reconhecimento de voz não disponível neste navegador. Digite a frase manualmente:
                    </Text>
                    <TextInput
                        style={s.transcriptInput}
                        value={transcript}
                        onChangeText={setTranscript}
                        placeholder="Ex: cinquenta reais no mercado no débito"
                        placeholderTextColor="#475569"
                        multiline
                        numberOfLines={2}
                    />
                </View>
            )}

            {/* Fields updating live from the fala */}
            <View style={s.section}>
                <Text style={s.fieldLabel}>Valor (R$)</Text>
                <Text style={[s.field, s.fieldReadonly, !parsed.amount && s.fieldWaiting]}>
                    {parsed.amount ? parsed.amount.toFixed(2).replace('.', ',') : 'aguardando...'}
                </Text>

                <Text style={s.fieldLabel}>Fornecedor</Text>
                <Text style={[s.field, s.fieldReadonly, !parsed.beneficiary && s.fieldWaiting]}>
                    {parsed.beneficiary || 'aguardando...'}
                </Text>

                <Text style={s.fieldLabel}>Conta</Text>
                <AccountPicker selected={account} onSelect={setAccount} />

                <Text style={s.fieldLabel}>Descrição do que comprou</Text>
                <Text style={[s.field, s.fieldReadonly, !parsed.description && s.fieldWaiting]}>
                    {parsed.description || 'aguardando...'}
                </Text>

                {parsed.paymentType ? (
                    <View style={s.payTypeBadge}>
                        <Text style={s.payTypeText}>Pagamento detectado: {parsed.paymentType}</Text>
                    </View>
                ) : null}

                <Text style={s.fieldLabel}>Número de parcelas</Text>
                <TextInput style={s.input} value={installments} onChangeText={setInstallments}
                    placeholder="1" placeholderTextColor="#475569" keyboardType="number-pad" />
                <Text style={s.installHint}>
                    {parseInt(installments) > 1
                        ? `${installments}x de R$ ${((parsed.amount || 0) / parseInt(installments)).toFixed(2).replace('.', ',')}`
                        : 'Parcela única'}
                </Text>

                <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                    <Text style={s.saveBtnText}>Incluir</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    content: { paddingBottom: 40, paddingTop: 16 },
    hint: { color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 18, marginHorizontal: 16, marginBottom: 12 },
    micBtn: { alignSelf: 'center', marginBottom: 16, backgroundColor: '#1e293b', borderRadius: 50, width: 88, height: 88, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#004d40' },
    micBtnActive: { backgroundColor: '#7f1d1d', borderColor: '#ef4444' },
    micIcon: { fontSize: 28, marginBottom: 2 },
    micLabel: { color: '#fff', fontSize: 9, textAlign: 'center' },
    unsupportedText: { color: '#f59e0b', fontSize: 12, marginHorizontal: 16, marginBottom: 12, lineHeight: 18 },
    section: { marginHorizontal: 16, marginBottom: 20, backgroundColor: '#1e293b', borderRadius: 16, padding: 20 },
    sectionLabel: { color: '#89962F', fontSize: 11, letterSpacing: 1, marginBottom: 12 },
    transcriptInput: { backgroundColor: '#0f172a', color: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 14, fontSize: 15, minHeight: 60, textAlignVertical: 'top' },
    fieldLabel: { color: '#89962F', fontSize: 11, marginTop: 14, marginBottom: 4 },
    field: { backgroundColor: '#0f172a', color: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#334155', padding: 12, fontSize: 16, fontWeight: '700' },
    fieldReadonly: { paddingVertical: 12 },
    fieldWaiting: { color: '#475569', fontWeight: '400', fontStyle: 'italic' },
    input: { backgroundColor: '#0f172a', color: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#334155', padding: 12, fontSize: 16, fontWeight: '700' },
    installHint: { color: '#89962F', fontSize: 12, marginTop: 6 },
    payTypeBadge: { backgroundColor: '#004d40', borderRadius: 8, padding: 8, marginTop: 10, alignSelf: 'flex-start' },
    payTypeText: { color: '#CCFF00', fontSize: 12 },
    saveBtn: { backgroundColor: '#CCFF00', borderRadius: 12, padding: 18, alignItems: 'center', marginTop: 20 },
    saveBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 16 },
});
