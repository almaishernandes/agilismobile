import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image, FlatList } from 'react-native';
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

const STEP_LABELS = {
    amount: 'Valor (R$)',
    flowType: 'Tipo de Lançamento',
    account: 'Conta',
    destinoAccount: 'Conta de Destino',
    installments: 'Parcelas',
    beneficiary: 'Fornecedor',
    costCenter: 'Centro de Custos',
    chartAccount: 'Plano de Contas',
};

const EMPTY_VALUES = {
    amount: null,
    dc_type: 'D',        // 'D' Saída | 'C' Entrada | 'T' Transferência
    type: 'Expense',
    installments: 1,
    firstDueDate: todayISO(),
    account: null,
    destinoAccount: null,
    beneficiary: null,
    costCenterItems: [], // [{ id, full_code, description, amount }]
    chartAccount: null,
};

const isCreditCard = (account) => (account?.account_type || '').toLowerCase().includes('cart');

// Transferência é um fluxo curto (Valor → Tipo → Conta → Conta Destino →
// Conferência); Saída/Entrada seguem o fluxo completo, com Parcelas só
// aparecendo quando a conta escolhida é Cartão de Crédito.
function buildSteps(dcType, account) {
    if (dcType === 'T') return ['amount', 'flowType', 'account', 'destinoAccount', 'review'];
    const steps = ['amount', 'flowType', 'account'];
    if (isCreditCard(account)) steps.push('installments');
    steps.push('beneficiary', 'costCenter', 'chartAccount', 'review');
    return steps;
}

// Vencimento padrão de fatura de Cartão de Crédito: emissão até o dia de
// fechamento cai na fatura do mês seguinte; após o fechamento, cai na fatura
// do segundo mês subsequente. Mesma regra usada no AgilisWeb.
function calculateDueDate(emissionDateStr, acc) {
    const type = (acc?.account_type || '').toLowerCase();
    const isCC = type.includes('crédito') || type.includes('credito');
    if (!isCC || !acc?.closing_day || !acc?.due_day) return emissionDateStr;

    const [year, month, day] = emissionDateStr.split('-').map(Number);
    const closingDay = Number(acc.closing_day);
    const dueDay = Number(acc.due_day);

    let targetMonth = month - 1;
    targetMonth += day <= closingDay ? 1 : 2;

    const targetDate = new Date(year, targetMonth, dueDay);
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

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
    const [otherAccounts, setOtherAccounts] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [rateioPickerOpen, setRateioPickerOpen] = useState(false);
    const savedDraftRef = useRef(null);

    const STEPS = buildSteps(values.dc_type, values.account);
    const step = STEPS[stepIndex] || STEPS[0];

    useEffect(() => {
        getSecurityContext().then(ctx => {
            if (!ctx?.family_id) return;
            supabase.from('accounts').select('id, name, account_type').eq('family_id', ctx.family_id).order('name')
                .then(({ data }) => setOtherAccounts(data || []));
        });
        supabase.from('cost_centers').select('id, full_code, description').order('full_code')
            .then(({ data }) => setCostCenters(data || []));
    }, []);

    const advance = () => setStepIndex(i => Math.min(i + 1, STEPS.length - 1));
    const goBackStep = () => setStepIndex(i => Math.max(i - 1, 0));

    // ── Rateio do Centro de Custos (mesmo modelo do AgilisWeb) ──────────────
    const ccAllocated = values.costCenterItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    const ccRemaining = Math.round(((values.amount || 0) - ccAllocated) * 100) / 100;

    const pickFirstCostCenter = (cc) => {
        setValues(v => ({ ...v, costCenterItems: [{ ...cc, amount: v.amount }] }));
    };
    const pickRateioCostCenter = (cc) => {
        setValues(v => ({ ...v, costCenterItems: [...v.costCenterItems, { ...cc, amount: ccRemaining }] }));
        setRateioPickerOpen(false);
    };
    const removeCcItem = (idx) => {
        setValues(v => ({ ...v, costCenterItems: v.costCenterItems.filter((_, i) => i !== idx) }));
    };

    const setValue = (key, val) => {
        setValues(prev => ({ ...prev, [key]: val }));
        advance();
    };

    // Sempre pede o vencimento (mesmo com 1 parcela só — normalmente é o
    // vencimento da fatura no mês subsequente à emissão, já pré-preenchido).
    const handleInstallmentsDone = (n) => {
        setValues(prev => ({
            ...prev,
            installments: n,
            firstDueDate: calculateDueDate(todayISO(), prev.account),
        }));
        setShowInstallmentDetail(true);
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
        setRateioPickerOpen(false);
        savedDraftRef.current = null;
    };

    const handleConfirm = async () => {
        if (!values.account) { Alert.alert('Selecione uma conta.'); return; }
        setSaving(true);
        const ctx = await getSecurityContext();

        // ── Transferência entre contas ──────────────────────────────────────
        if (values.dc_type === 'T') {
            if (!values.destinoAccount) { Alert.alert('Selecione a conta de destino.'); setSaving(false); return; }
            const today = todayISO();
            const { error } = await supabase.from('transactions').insert([
                {
                    account_id: values.account.id, emission_date: today, due_date: today,
                    description: `Transferência (Transf.Conta ${values.destinoAccount.name})`,
                    amount: values.amount, dc_type: 'D', type: 'Expense',
                    user_id: ctx?.user_id ?? null, family_id: ctx?.family_id ?? null,
                },
                {
                    account_id: values.destinoAccount.id, emission_date: today, due_date: today,
                    description: `Transferência (Transf.Conta ${values.account.name})`,
                    amount: values.amount, dc_type: 'C', type: 'Income',
                    user_id: ctx?.user_id ?? null, family_id: ctx?.family_id ?? null,
                },
            ]);
            setSaving(false);
            if (error) { Alert.alert('Erro', 'Não foi possível gravar a transferência: ' + error.message); return; }
            setStage('done');
            return;
        }

        const singleCc = values.costCenterItems.length === 1 ? values.costCenterItems[0] : null;
        const { data, error } = await insertTransaction(ctx, {
            account_id: values.account.id,
            amount: values.amount,
            beneficiary: values.beneficiary?.name || '',
            beneficiary_id: values.beneficiary?.id ?? null,
            beneficiary_name: values.beneficiary?.name || '',
            description: values.beneficiary?.name || '',
            installments: values.installments,
            cost_center_id: singleCc?.id ?? null,
            transaction_type_id: values.chartAccount?.id ?? null,
            dc_type: values.dc_type,
            type: values.type,
            first_due_date: values.firstDueDate || null,
        });

        // Rateio (mais de um Centro de Custos): grava em transaction_items,
        // mesmo modelo do AgilisWeb, replicando a proporção digitada em cada
        // parcela gerada.
        if (!error && values.costCenterItems.length > 1 && data?.length) {
            const total = values.amount;
            const proporcoes = values.costCenterItems.map(it => ({
                cost_center_id: it.id,
                description: it.full_code ? `${it.full_code} - ${it.description}` : it.description,
                ratio: Number(it.amount || 0) / total,
            }));
            const itemRows = [];
            data.forEach(row => proporcoes.forEach(p => itemRows.push({
                transaction_id: row.id,
                cost_center_id: p.cost_center_id,
                description: p.description,
                amount: Math.round(row.amount * p.ratio * 100) / 100,
            })));
            await supabase.from('transaction_items').insert(itemRows);
        }

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
            beneficiary_id: values.beneficiary?.id ?? null,
            beneficiary_name: values.beneficiary?.name || '',
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
                        {STEPS.slice(0, stepIndex).includes('amount') && <DoneRow label="Valor" value={fmtBRL(values.amount)} />}
                        {STEPS.slice(0, stepIndex).includes('flowType') && <DoneRow label="Tipo" value={values.dc_type === 'C' ? 'Entrada' : values.dc_type === 'T' ? 'Transferência' : 'Saída'} />}
                        {STEPS.slice(0, stepIndex).includes('account') && <DoneRow label="Conta" value={values.account?.name || '—'} />}
                        {STEPS.slice(0, stepIndex).includes('installments') && <DoneRow label="Parcelas" value={`${values.installments}x`} />}
                        {STEPS.slice(0, stepIndex).includes('destinoAccount') && <DoneRow label="Conta Destino" value={values.destinoAccount?.name || '—'} />}
                        {STEPS.slice(0, stepIndex).includes('beneficiary') && <DoneRow label="Fornecedor" value={values.beneficiary?.name || '—'} />}
                        {STEPS.slice(0, stepIndex).includes('costCenter') && <DoneRow label="Centro de Custos" value={values.costCenterItems.length > 1 ? `${values.costCenterItems.length} (rateio)` : (values.costCenterItems[0]?.description || '—')} />}
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
                            <TouchableOpacity
                                style={[s.flowTypeBtn, s.flowTypeBtnTransfer]}
                                onPress={() => { setValues(v => ({ ...v, dc_type: 'T', type: 'Transfer' })); advance(); }}
                            >
                                <Text style={s.flowTypeBtnText}>⇄ Transf.</Text>
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
                        <Text style={s.stepLabel}>{values.installments > 1 ? 'Vencimento da 1ª parcela' : 'Vencimento'}</Text>
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

                        {values.installments > 1 && (
                            <>
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
                            </>
                        )}

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

                {step === 'destinoAccount' && (
                    <View style={s.stepBox}>
                        <Text style={s.stepLabel}>{STEP_LABELS.destinoAccount}</Text>
                        <FlatList
                            style={{ maxHeight: 320 }}
                            data={otherAccounts.filter(a => a.id !== values.account?.id)}
                            keyExtractor={i => i.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={s.pickRow} onPress={() => setValue('destinoAccount', item)}>
                                    <Text style={s.pickRowText}>{item.name}</Text>
                                    <Text style={s.pickRowSub}>{item.account_type}</Text>
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={<Text style={s.photoPlaceholderText}>Nenhuma outra conta cadastrada.</Text>}
                        />
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
                        {values.costCenterItems.length === 0 ? (
                            <TablePicker
                                selected={null}
                                onSelect={pickFirstCostCenter}
                                table="cost_centers"
                                columns="id, full_code, description"
                                orderBy="full_code"
                                title="Selecione o Centro de Custos"
                                placeholder="Selecionar centro de custos"
                                buildLabel={(r) => `${r.full_code ? r.full_code + ' - ' : ''}${r.description}`}
                            />
                        ) : (
                            <>
                                {values.costCenterItems.map((it, idx) => (
                                    <View key={idx} style={s.ccRow}>
                                        <Text style={s.ccRowLabel}>{it.full_code ? `${it.full_code} - ` : ''}{it.description}</Text>
                                        <Text style={s.ccRowAmount}>{fmtBRL(it.amount)}</Text>
                                        {values.costCenterItems.length > 1 && (
                                            <TouchableOpacity onPress={() => removeCcItem(idx)}>
                                                <Text style={s.ccRemove}>✕</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ))}
                                <View style={s.ccRemainingRow}>
                                    <Text style={s.ccRemainingLabel}>Restante a alocar</Text>
                                    <Text style={[s.ccRemainingValue, { color: ccRemaining === 0 ? '#22c55e' : '#f59e0b' }]}>{fmtBRL(ccRemaining)}</Text>
                                </View>

                                {!rateioPickerOpen ? (
                                    <View style={s.rowBtns}>
                                        <TouchableOpacity style={s.btnSecondary} onPress={() => setRateioPickerOpen(true)}>
                                            <Text style={s.btnSecondaryText}>↗ Rateio</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={s.saveBtn} onPress={advance}>
                                            <Text style={s.saveBtnText}>Avançar</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={s.rateioPanel}>
                                        <Text style={s.rateioPanelTitle}>SELECIONE OUTRO CENTRO DE CUSTOS</Text>
                                        <FlatList
                                            style={{ maxHeight: 220 }}
                                            data={costCenters.filter(cc => !values.costCenterItems.some(it => it.id === cc.id))}
                                            keyExtractor={i => i.id}
                                            renderItem={({ item }) => (
                                                <TouchableOpacity style={s.pickRow} onPress={() => pickRateioCostCenter(item)}>
                                                    <Text style={s.pickRowText}>{item.full_code ? `${item.full_code} - ` : ''}{item.description}</Text>
                                                </TouchableOpacity>
                                            )}
                                        />
                                        <TouchableOpacity style={[s.btnSecondary, { marginTop: 8 }]} onPress={() => setRateioPickerOpen(false)}>
                                            <Text style={s.btnSecondaryText}>Fechar</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </>
                        )}
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
                        <DoneRow label="Tipo" value={values.dc_type === 'C' ? 'Entrada' : values.dc_type === 'T' ? 'Transferência' : 'Saída'} />
                        {values.dc_type === 'T' ? (
                            <>
                                <DoneRow label="Conta Origem" value={values.account?.name || '—'} />
                                <DoneRow label="Conta Destino" value={values.destinoAccount?.name || '—'} />
                            </>
                        ) : (
                            <>
                                <DoneRow label="Parcelas" value={`${values.installments}x`} />
                                <DoneRow label={values.installments > 1 ? '1º Vencimento' : 'Vencimento'} value={fmtDateBR(values.firstDueDate)} />
                                <DoneRow label="Conta" value={values.account?.name || '—'} />
                                <DoneRow label="Fornecedor" value={values.beneficiary?.name || '—'} />
                                {values.costCenterItems.length <= 1 ? (
                                    <DoneRow label="Centro de Custos" value={values.costCenterItems[0]?.description || '—'} />
                                ) : values.costCenterItems.map((it, idx) => (
                                    <DoneRow key={idx} label={`↳ ${it.description}`} value={fmtBRL(it.amount)} />
                                ))}
                                <DoneRow label="Plano de Contas" value={values.chartAccount?.description || '—'} />
                            </>
                        )}

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
    flowTypeBtnTransfer: { backgroundColor: 'rgba(21,101,192,0.10)', borderColor: '#1565c0' },

    pickRow: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#0f172a', backgroundColor: '#0f172a', borderRadius: 8, marginBottom: 4 },
    pickRowText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    pickRowSub: { color: '#89962F', fontSize: 11, marginTop: 2 },

    ccRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 8, padding: 12, marginBottom: 6, gap: 8 },
    ccRowLabel: { flex: 1, color: '#fff', fontSize: 13 },
    ccRowAmount: { color: '#00e5c0', fontWeight: '700', fontSize: 13 },
    ccRemove: { color: '#ef4444', fontWeight: '900', fontSize: 14, paddingLeft: 4 },
    ccRemainingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
    ccRemainingLabel: { color: '#94a3b8', fontSize: 12 },
    ccRemainingValue: { fontWeight: '800', fontSize: 12 },
    rateioPanel: { marginTop: 8, backgroundColor: '#0d2137', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#1565c0' },
    rateioPanelTitle: { color: '#64b5f6', fontSize: 10, fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 },
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
