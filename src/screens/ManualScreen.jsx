import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useDrafts } from '../context/DraftContext';
import AccountPicker from '../components/AccountPicker';
import BeneficiaryPicker from '../components/BeneficiaryPicker';
import TablePicker from '../components/TablePicker';
import { getSecurityContext } from '../lib/auth';
import { insertTransaction } from '../lib/transactionSync';
import { parseSpokenNumber } from '../lib/voiceParser';

const SpeechRecognitionAPI =
    typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

const STEPS = ['amount', 'installments', 'account', 'beneficiary', 'costCenter', 'chartAccount', 'review'];

const STEP_LABELS = {
    amount: 'Valor (R$)',
    installments: 'Parcelas',
    account: 'Conta',
    beneficiary: 'Fornecedor',
    costCenter: 'Centro de Custos',
    chartAccount: 'Plano de Contas',
};

const EMPTY_VALUES = {
    amount: null,
    installments: 1,
    account: null,
    beneficiary: '',
    costCenter: null,
    chartAccount: null,
};

// Campo de voz para um único valor numérico (Valor / Parcelas): começa
// ouvindo automaticamente ao entrar no passo, com botão "Digitar" como
// alternativa manual.
function NumberVoiceField({ label, active, onDone, formatValue }) {
    const [listening, setListening] = useState(false);
    const [manual, setManual] = useState(false);
    const [manualText, setManualText] = useState('');
    const recognitionRef = useRef(null);

    useEffect(() => {
        if (!active || !SpeechRecognitionAPI || manual) return;
        const recognition = new SpeechRecognitionAPI();
        recognition.lang = 'pt-BR';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (event) => {
            const text = event.results[0]?.[0]?.transcript || '';
            const n = parseSpokenNumber(text);
            if (n !== null) onDone(n);
        };
        recognition.onend = () => setListening(false);
        recognition.onerror = () => setListening(false);
        recognitionRef.current = recognition;
        recognition.start();
        setListening(true);
        return () => recognition.stop();
    }, [active, manual]);

    if (!active) return null;

    return (
        <View style={s.stepBox}>
            <Text style={s.stepLabel}>{label}</Text>
            {!manual ? (
                <View style={s.voiceRow}>
                    <View style={s.listeningPill}>
                        {listening && <ActivityIndicator color="#CCFF00" size="small" />}
                        <Text style={s.listeningText}>{listening ? 'Ouvindo...' : 'Aguardando...'}</Text>
                    </View>
                    <TouchableOpacity style={s.digitBtn} onPress={() => { recognitionRef.current?.stop(); setManual(true); }}>
                        <Text style={s.digitBtnText}>Digitar</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={s.voiceRow}>
                    <TextInput
                        style={[s.input, { flex: 1 }]}
                        value={manualText}
                        onChangeText={setManualText}
                        placeholder="0"
                        placeholderTextColor="#475569"
                        keyboardType="decimal-pad"
                        autoFocus
                        onSubmitEditing={() => {
                            const n = parseFloat(manualText.replace(',', '.'));
                            if (n) onDone(n);
                        }}
                    />
                    <TouchableOpacity
                        style={s.confirmBtn}
                        onPress={() => {
                            const n = parseFloat(manualText.replace(',', '.'));
                            if (n) onDone(n); else Alert.alert('Informe um número válido.');
                        }}
                    >
                        <Text style={s.confirmBtnText}>✓</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

function DoneRow({ label, value }) {
    return (
        <View style={s.doneRow}>
            <Text style={s.doneLabel}>{label}</Text>
            <Text style={s.doneValue}>{value}</Text>
        </View>
    );
}

export default function ManualScreen({ navigation }) {
    const { addDraft } = useDrafts();
    const [stepIndex, setStepIndex] = useState(0);
    const [values, setValues] = useState(EMPTY_VALUES);
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(false);

    const step = STEPS[stepIndex];

    const advance = () => setStepIndex(i => Math.min(i + 1, STEPS.length - 1));

    const setValue = (key, val) => {
        setValues(prev => ({ ...prev, [key]: val }));
        advance();
    };

    const resetFlow = () => {
        setValues(EMPTY_VALUES);
        setStepIndex(0);
        setLastSaved(false);
    };

    const handleConfirm = async () => {
        if (!values.account) { Alert.alert('Selecione uma conta.'); return; }
        setSaving(true);
        const ctx = await getSecurityContext();
        const { error } = await insertTransaction(ctx, {
            account_id: values.account.id,
            amount: values.amount,
            beneficiary: values.beneficiary,
            description: values.beneficiary,
            installments: values.installments,
            cost_center_id: values.costCenter?.id ?? null,
            transaction_type_id: values.chartAccount?.id ?? null,
        });
        setSaving(false);

        if (error) {
            Alert.alert('Aviso', 'Não foi possível gravar no banco agora. O item foi salvo no rascunho e será reenviado ao fechar o dia.');
        }

        addDraft({
            type: 'transaction',
            account_id: values.account.id,
            account_name: values.account.name,
            amount: values.amount,
            beneficiary: values.beneficiary,
            description: values.beneficiary,
            installments: values.installments,
            synced: !error,
        });

        setLastSaved(true);
    };

    const fmtBRL = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

    return (
        <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            {lastSaved && (
                <View style={s.successBanner}>
                    <Text style={s.successText}>✓ Lançamento gravado com sucesso!</Text>
                    <TouchableOpacity style={s.newEntryBtn} onPress={resetFlow}>
                        <Text style={s.newEntryBtnText}>+ Novo lançamento</Text>
                    </TouchableOpacity>
                </View>
            )}

            {!lastSaved && (
                <View style={s.form}>
                    {/* Completed fields shown compact above the active one */}
                    {values.amount != null && stepIndex > 0 && <DoneRow label="Valor" value={fmtBRL(values.amount)} />}
                    {stepIndex > 1 && <DoneRow label="Parcelas" value={`${values.installments}x`} />}
                    {values.account && stepIndex > 2 && <DoneRow label="Conta" value={values.account.name} />}
                    {stepIndex > 3 && <DoneRow label="Fornecedor" value={values.beneficiary || '—'} />}
                    {stepIndex > 4 && <DoneRow label="Centro de Custos" value={values.costCenter?.description || '—'} />}
                    {stepIndex > 5 && <DoneRow label="Plano de Contas" value={values.chartAccount?.description || '—'} />}

                    <NumberVoiceField
                        label={STEP_LABELS.amount}
                        active={step === 'amount'}
                        onDone={(n) => setValue('amount', n)}
                    />

                    <NumberVoiceField
                        label={STEP_LABELS.installments}
                        active={step === 'installments'}
                        onDone={(n) => setValue('installments', Math.max(1, Math.round(n)))}
                    />

                    {step === 'account' && (
                        <View style={s.stepBox}>
                            <Text style={s.stepLabel}>{STEP_LABELS.account}</Text>
                            <AccountPicker selected={values.account} onSelect={(v) => setValue('account', v)} />
                        </View>
                    )}

                    {step === 'beneficiary' && (
                        <View style={s.stepBox}>
                            <Text style={s.stepLabel}>{STEP_LABELS.beneficiary}</Text>
                            <BeneficiaryPicker value={values.beneficiary} onChange={(v) => setValue('beneficiary', v)} />
                        </View>
                    )}

                    {step === 'costCenter' && (
                        <View style={s.stepBox}>
                            <Text style={s.stepLabel}>{STEP_LABELS.costCenter}</Text>
                            <TablePicker
                                selected={values.costCenter}
                                onSelect={(v) => setValue('costCenter', v)}
                                table="cost_centers"
                                columns="id, full_code, description"
                                orderBy="full_code"
                                title="Selecione o Centro de Custos"
                                placeholder="Selecionar centro de custos"
                                buildLabel={(r) => `${r.full_code ? r.full_code + ' - ' : ''}${r.description}`}
                            />
                        </View>
                    )}

                    {step === 'chartAccount' && (
                        <View style={s.stepBox}>
                            <Text style={s.stepLabel}>{STEP_LABELS.chartAccount}</Text>
                            <TablePicker
                                selected={values.chartAccount}
                                onSelect={(v) => setValue('chartAccount', v)}
                                table="chart_of_accounts"
                                columns="id, code, description"
                                orderBy="code"
                                title="Selecione o Plano de Contas"
                                placeholder="Selecionar plano de contas"
                                buildLabel={(r) => `${r.code ? r.code + ' - ' : ''}${r.description}`}
                            />
                        </View>
                    )}

                    {step === 'review' && (
                        <View style={s.stepBox}>
                            <Text style={s.stepLabel}>Conferência</Text>
                            <DoneRow label="Valor" value={fmtBRL(values.amount)} />
                            <DoneRow label="Parcelas" value={`${values.installments}x`} />
                            <DoneRow label="Conta" value={values.account?.name || '—'} />
                            <DoneRow label="Fornecedor" value={values.beneficiary || '—'} />
                            <DoneRow label="Centro de Custos" value={values.costCenter?.description || '—'} />
                            <DoneRow label="Plano de Contas" value={values.chartAccount?.description || '—'} />

                            <TouchableOpacity style={s.saveBtn} onPress={handleConfirm} disabled={saving}>
                                <Text style={s.saveBtnText}>{saving ? 'Gravando...' : 'Confirmar e Incluir'}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            )}
        </ScrollView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    content: { paddingBottom: 40, paddingTop: 16 },
    form: { margin: 16, marginTop: 0, backgroundColor: '#1e293b', borderRadius: 16, padding: 20 },

    doneRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
    doneLabel: { color: '#89962F', fontSize: 12 },
    doneValue: { color: '#fff', fontSize: 13, fontWeight: '700' },

    stepBox: { marginTop: 8 },
    stepLabel: { color: '#89962F', fontSize: 11, letterSpacing: 1, marginBottom: 6 },

    voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    listeningPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0f172a', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 12 },
    listeningText: { color: '#94a3b8', fontSize: 14 },
    digitBtn: { backgroundColor: '#004d40', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
    digitBtnText: { color: '#CCFF00', fontWeight: '700', fontSize: 13 },

    input: { backgroundColor: '#0f172a', color: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 12, fontSize: 16 },
    confirmBtn: { backgroundColor: '#CCFF00', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
    confirmBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 16 },

    saveBtn: { backgroundColor: '#CCFF00', borderRadius: 12, padding: 18, alignItems: 'center', marginTop: 16 },
    saveBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 16 },

    successBanner: { margin: 16, backgroundColor: '#1e293b', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#CCFF00' },
    successText: { color: '#CCFF00', fontWeight: '800', fontSize: 16, marginBottom: 16 },
    newEntryBtn: { backgroundColor: '#CCFF00', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24 },
    newEntryBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 14 },
});
