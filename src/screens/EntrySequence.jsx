import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useDrafts } from '../context/DraftContext';
import AccountPicker from '../components/AccountPicker';
import BeneficiaryPicker from '../components/BeneficiaryPicker';
import TablePicker from '../components/TablePicker';
import { getSecurityContext } from '../lib/auth';
import { insertTransaction, addMonths, todayISO } from '../lib/transactionSync';
import { parseSpokenNumber } from '../lib/voiceParser';
import { uploadComprovante } from '../lib/storageUpload';
import { supabase } from '../lib/supabase';

const SpeechRecognitionAPI =
    typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

const STEPS = ['amount', 'flowType', 'installments', 'account', 'beneficiary', 'costCenter', 'chartAccount', 'review'];

const STEP_LABELS = {
    amount: 'Valor (R$)',
    flowType: 'Saída ou Entrada?',
    installments: 'Parcelas',
    account: 'Conta',
    beneficiary: 'Fornecedor',
    costCenter: 'Centro de Custos',
    chartAccount: 'Plano de Contas',
};

const EMPTY_VALUES = {
    amount: null,
    dc_type: 'D',
    type: 'Expense',
    installments: 1,
    firstDueDate: todayISO(),
    account: null,
    beneficiary: null,
    costCenter: null,
    chartAccount: null,
};

function fmtDateBR(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

// Campo numérico (Valor / Parcelas). Em modo voz, começa ouvindo
// automaticamente ao entrar no passo, com botão "Digitar" como
// alternativa. Em modo digitação, vai direto pro teclado.
function NumberField({ label, active, onDone, voiceEnabled }) {
    const [listening, setListening] = useState(false);
    const [manual, setManual] = useState(!voiceEnabled);
    const [manualText, setManualText] = useState('');
    const recognitionRef = useRef(null);

    useEffect(() => {
        if (!active || !voiceEnabled || !SpeechRecognitionAPI || manual) return;
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
    }, [active, manual, voiceEnabled]);

    useEffect(() => {
        if (active) { setManual(!voiceEnabled); setManualText(''); }
    }, [active]);

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

// Parcelas quase sempre é 1 — já vem preenchido, só espera Enter. Se
// precisar de outro número, edita e aperta Enter (sem voz, sem botão à
// parte).
function InstallmentsField({ active, onDone }) {
    const [text, setText] = useState('1');
    const inputRef = useRef(null);

    useEffect(() => {
        if (active) {
            setText('1');
            setTimeout(() => inputRef.current?.focus?.(), 50);
        }
    }, [active]);

    if (!active) return null;

    const confirm = () => {
        const n = Math.max(1, Math.round(parseFloat(text.replace(',', '.')) || 1));
        onDone(n);
    };

    return (
        <View style={s.stepBox}>
            <Text style={s.stepLabel}>{STEP_LABELS.installments}</Text>
            <TextInput
                ref={inputRef}
                style={s.input}
                value={text}
                onChangeText={setText}
                keyboardType="number-pad"
                selectTextOnFocus
                onSubmitEditing={confirm}
                returnKeyType="done"
            />
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

// stage: 'form' | 'photoPrompt' | 'done'
export default function EntrySequence({ navigation, voiceEnabled }) {
    const { addDraft } = useDrafts();
    const [stepIndex, setStepIndex] = useState(0);
    const [values, setValues] = useState(EMPTY_VALUES);
    const [saving, setSaving] = useState(false);
    const [stage, setStage] = useState('form');
    const [photo, setPhoto] = useState(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [showInstallmentDetail, setShowInstallmentDetail] = useState(false);
    const savedDraftRef = useRef(null);

    const step = STEPS[stepIndex];

    const advance = () => setStepIndex(i => Math.min(i + 1, STEPS.length - 1));
    const goBackStep = () => setStepIndex(i => Math.max(i - 1, 0));

    const setValue = (key, val) => {
        setValues(prev => ({ ...prev, [key]: val }));
        advance();
    };

    // Só some pra tela de conta quando: 1 parcela só (nada a detalhar), ou
    // mais de 1 parcela e o usuário já confirmou vencimento/parcelamento.
    const handleInstallmentsDone = (n) => {
        setValues(prev => ({ ...prev, installments: n }));
        if (n > 1) {
            setValues(prev => ({ ...prev, firstDueDate: todayISO() }));
            setShowInstallmentDetail(true);
        } else {
            advance();
        }
    };

    const confirmInstallmentDetail = () => {
        setShowInstallmentDetail(false);
        advance();
    };

    const resetFlow = () => {
        setValues(EMPTY_VALUES);
        setStepIndex(0);
        setStage('form');
        setPhoto(null);
        setShowInstallmentDetail(false);
        savedDraftRef.current = null;
    };

    const handleConfirm = async () => {
        if (!values.account) { Alert.alert('Selecione uma conta.'); return; }
        setSaving(true);
        const ctx = await getSecurityContext();
        const { error } = await insertTransaction(ctx, {
            account_id: values.account.id,
            amount: values.amount,
            beneficiary: values.beneficiary?.name || '',
            beneficiary_id: values.beneficiary?.id ?? null,
            beneficiary_name: values.beneficiary?.name || '',
            description: values.beneficiary?.name || '',
            installments: values.installments,
            cost_center_id: values.costCenter?.id ?? null,
            transaction_type_id: values.chartAccount?.id ?? null,
            dc_type: values.dc_type,
            type: values.type,
            first_due_date: values.installments > 1 ? values.firstDueDate : null,
        });
        setSaving(false);

        if (error) {
            Alert.alert('Aviso', 'Não foi possível gravar no banco agora. O item foi salvo no rascunho e será reenviado ao fechar o dia.');
        }

        savedDraftRef.current = addDraft({
            type: 'transaction',
            account_id: values.account.id,
            account_name: values.account.name,
            amount: values.amount,
            beneficiary: values.beneficiary?.name || '',
            description: values.beneficiary?.name || '',
            installments: values.installments,
            dc_type: values.dc_type,
            flow_type: values.type,
            synced: !error,
        });

        setStage('photoPrompt');
    };

    const handleTakePhoto = async () => {
        const { granted } = await ImagePicker.requestCameraPermissionsAsync();
        if (!granted) { Alert.alert('Permissão necessária'); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: false });
        if (!result.canceled) setPhoto(result.assets[0].uri);
    };

    const handleSavePhoto = async () => {
        if (!photo) return;
        setUploadingPhoto(true);
        const ctx = await getSecurityContext();
        const { path: filePath, error: uploadError } = await uploadComprovante(photo, ctx?.family_id);
        if (!uploadError) {
            await supabase.from('nfce_imports').insert([{
                emitente_nome: values.beneficiary?.name || 'Comprovante fotografado',
                valor_total: values.amount,
                metodo: 'foto_comprovante',
                file_path: filePath,
                raw_data: { fonte: 'app_mobile_foto', lancamento: values.beneficiary?.name || null },
                user_id: ctx?.user_id ?? null,
                family_id: ctx?.family_id ?? null,
            }]);
        } else {
            Alert.alert('Aviso', 'Não foi possível enviar a foto agora.');
        }
        setUploadingPhoto(false);
        setStage('done');
    };

    const fmtBRL = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

    if (stage === 'photoPrompt') {
        return (
            <ScrollView style={s.container} contentContainerStyle={s.content}>
                <View style={s.form}>
                    <Text style={s.stepLabel}>✓ Lançamento gravado! Deseja anexar foto do comprovante?</Text>

                    {photo ? (
                        <Image source={{ uri: photo }} style={s.photoPreview} resizeMode="contain" />
                    ) : (
                        <View style={s.photoPlaceholder}>
                            <Text style={s.photoPlaceholderIcon}>📄</Text>
                            <Text style={s.photoPlaceholderText}>Nenhuma foto tirada ainda</Text>
                        </View>
                    )}

                    <TouchableOpacity style={s.takePhotoBtn} onPress={handleTakePhoto}>
                        <Text style={s.takePhotoBtnText}>📷 {photo ? 'Tirar outra foto' : 'Tirar Foto do Comprovante'}</Text>
                    </TouchableOpacity>

                    <View style={s.rowBtns}>
                        <TouchableOpacity style={s.btnSecondary} onPress={() => setStage('done')}>
                            <Text style={s.btnSecondaryText}>Pular</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.saveBtn} onPress={handleSavePhoto} disabled={!photo || uploadingPhoto}>
                            <Text style={s.saveBtnText}>{uploadingPhoto ? 'Enviando...' : 'Salvar Foto'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        );
    }

    if (stage === 'done') {
        return (
            <ScrollView style={s.container} contentContainerStyle={s.content}>
                <View style={s.successBanner}>
                    <Text style={s.successText}>✓ Lançamento gravado com sucesso!</Text>
                    <TouchableOpacity style={s.newEntryBtn} onPress={resetFlow}>
                        <Text style={s.newEntryBtnText}>+ Novo lançamento</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        );
    }

    return (
        <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            <View style={s.form}>
                {/* Completed fields shown compact above the active one — escondido
                    na Conferência, que já repete tudo de forma organizada. */}
                {step !== 'review' && (
                    <>
                        {values.amount != null && stepIndex > 0 && <DoneRow label="Valor" value={fmtBRL(values.amount)} />}
                        {stepIndex > 1 && <DoneRow label="Tipo" value={values.dc_type === 'C' ? 'Entrada' : 'Saída'} />}
                        {stepIndex > 2 && <DoneRow label="Parcelas" value={`${values.installments}x`} />}
                        {values.account && stepIndex > 3 && <DoneRow label="Conta" value={values.account.name} />}
                        {stepIndex > 4 && <DoneRow label="Fornecedor" value={values.beneficiary?.name || '—'} />}
                        {stepIndex > 5 && <DoneRow label="Centro de Custos" value={values.costCenter?.description || '—'} />}
                        {stepIndex > 6 && <DoneRow label="Plano de Contas" value={values.chartAccount?.description || '—'} />}
                    </>
                )}

                <NumberField
                    label={STEP_LABELS.amount}
                    active={step === 'amount'}
                    onDone={(n) => setValue('amount', n)}
                    voiceEnabled={voiceEnabled}
                />

                {step === 'flowType' && (
                    <View style={s.stepBox}>
                        <Text style={s.stepLabel}>{STEP_LABELS.flowType}</Text>
                        <View style={s.flowTypeRow}>
                            <TouchableOpacity
                                style={[s.flowTypeBtn, s.flowTypeBtnOut]}
                                onPress={() => { setValues(v => ({ ...v, dc_type: 'D', type: 'Expense' })); advance(); }}
                            >
                                <Text style={s.flowTypeBtnText}>↓ Saída</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.flowTypeBtn, s.flowTypeBtnIn]}
                                onPress={() => { setValues(v => ({ ...v, dc_type: 'C', type: 'Income' })); advance(); }}
                            >
                                <Text style={s.flowTypeBtnText}>↑ Entrada</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                <InstallmentsField
                    active={step === 'installments' && !showInstallmentDetail}
                    onDone={handleInstallmentsDone}
                />

                {step === 'installments' && showInstallmentDetail && (
                    <View style={s.stepBox}>
                        <Text style={s.stepLabel}>Vencimento da 1ª parcela</Text>
                        <TextInput
                            style={s.input}
                            value={fmtDateBR(values.firstDueDate)}
                            onChangeText={(txt) => {
                                const digits = txt.replace(/\D/g, '').slice(0, 8);
                                const dd = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4, 8);
                                if (dd.length === 2 && mm.length === 2 && yyyy.length === 4) {
                                    setValues(v => ({ ...v, firstDueDate: `${yyyy}-${mm}-${dd}` }));
                                }
                            }}
                            placeholder="DD/MM/AAAA"
                            placeholderTextColor="#475569"
                            keyboardType="number-pad"
                        />

                        <Text style={[s.stepLabel, { marginTop: 16 }]}>Parcelamento</Text>
                        <View style={s.installmentPreview}>
                            {Array.from({ length: values.installments }, (_, i) => (
                                <View key={i} style={s.installmentRow}>
                                    <Text style={s.installmentRowLabel}>{i + 1}/{values.installments}</Text>
                                    <Text style={s.installmentRowDate}>{fmtDateBR(addMonths(values.firstDueDate, i))}</Text>
                                    <Text style={s.installmentRowAmount}>{fmtBRL(values.amount / values.installments)}</Text>
                                </View>
                            ))}
                        </View>

                        <TouchableOpacity style={s.saveBtn} onPress={confirmInstallmentDetail}>
                            <Text style={s.saveBtnText}>Continuar</Text>
                        </TouchableOpacity>
                    </View>
                )}

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
                        <DoneRow label="Data" value={fmtDateBR(todayISO())} />
                        <DoneRow label="Valor" value={fmtBRL(values.amount)} />
                        <DoneRow label="Tipo" value={values.dc_type === 'C' ? 'Entrada' : 'Saída'} />
                        <DoneRow label="Parcelas" value={`${values.installments}x`} />
                        {values.installments > 1 && (
                            <DoneRow label="1º Vencimento" value={fmtDateBR(values.firstDueDate)} />
                        )}
                        <DoneRow label="Conta" value={values.account?.name || '—'} />
                        <DoneRow label="Fornecedor" value={values.beneficiary?.name || '—'} />
                        <DoneRow label="Centro de Custos" value={values.costCenter?.description || '—'} />
                        <DoneRow label="Plano de Contas" value={values.chartAccount?.description || '—'} />

                        <View style={s.rowBtns}>
                            <TouchableOpacity style={s.btnSecondary} onPress={goBackStep} disabled={saving}>
                                <Text style={s.btnSecondaryText}>‹ Voltar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.saveBtn} onPress={handleConfirm} disabled={saving}>
                                <Text style={s.saveBtnText}>{saving ? 'Gravando...' : 'Gravar'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
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

    flowTypeRow: { flexDirection: 'row', gap: 10 },
    flowTypeBtn: { flex: 1, borderRadius: 10, paddingVertical: 16, alignItems: 'center', borderWidth: 1 },
    flowTypeBtnOut: { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: '#ef4444' },
    flowTypeBtnIn: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: '#22c55e' },
    flowTypeBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    input: { backgroundColor: '#0f172a', color: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 12, fontSize: 16 },
    confirmBtn: { backgroundColor: '#CCFF00', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
    confirmBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 16 },

    rowBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
    btnSecondary: { flex: 1, backgroundColor: '#0f172a', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#334155', justifyContent: 'center' },
    btnSecondaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    saveBtn: { flex: 2, backgroundColor: '#CCFF00', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center' },

    installmentPreview: { backgroundColor: '#0f172a', borderRadius: 10, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
    installmentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
    installmentRowLabel: { color: '#89962F', fontSize: 12, fontWeight: '700', width: 40 },
    installmentRowDate: { color: '#fff', fontSize: 13, flex: 1 },
    installmentRowAmount: { color: '#CCFF00', fontSize: 13, fontWeight: '700' },
    saveBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 16 },

    photoPlaceholder: { height: 180, backgroundColor: '#0f172a', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 16, marginBottom: 12 },
    photoPlaceholderIcon: { fontSize: 40, marginBottom: 8 },
    photoPlaceholderText: { color: '#475569', fontSize: 13 },
    photoPreview: { width: '100%', height: 200, borderRadius: 12, marginTop: 16, marginBottom: 12 },
    takePhotoBtn: { backgroundColor: '#004d40', borderRadius: 10, padding: 14, alignItems: 'center' },
    takePhotoBtnText: { color: '#CCFF00', fontWeight: '700', fontSize: 15 },

    successBanner: { margin: 16, backgroundColor: '#1e293b', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#CCFF00' },
    successText: { color: '#CCFF00', fontWeight: '800', fontSize: 16, marginBottom: 16 },
    newEntryBtn: { backgroundColor: '#CCFF00', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24 },
    newEntryBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 14 },
});
