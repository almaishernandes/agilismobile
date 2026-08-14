import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useDrafts } from '../context/DraftContext';
import AccountPicker from '../components/AccountPicker';
import BeneficiaryPicker from '../components/BeneficiaryPicker';

export default function ManualScreen({ navigation }) {
    const { addDraft } = useDrafts();
    const [account, setAccount] = useState(null);
    const [amount, setAmount] = useState('');
    const [beneficiary, setBeneficiary] = useState('');
    const [description, setDescription] = useState('');
    const [installments, setInstallments] = useState('1');

    const handleSave = () => {
        const a = parseFloat(amount.replace(',', '.'));
        if (!a || a <= 0) { Alert.alert('Informe um valor válido.'); return; }
        if (!account) { Alert.alert('Selecione uma conta.'); return; }

        addDraft({
            type: 'transaction',
            account_id: account.id,
            account_name: account.name,
            amount: a,
            beneficiary,
            description,
            installments: parseInt(installments) || 1,
        });
        navigation.goBack();
    };

    return (
        <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            <View style={s.form}>
                {/* Amount — numeric keyboard, big font */}
                <Text style={s.label}>Valor (R$) *</Text>
                <TextInput
                    style={[s.input, s.inputAmount]}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0,00"
                    placeholderTextColor="#334155"
                    keyboardType="decimal-pad"
                    autoFocus
                />

                <Text style={s.label}>Fornecedor</Text>
                <BeneficiaryPicker value={beneficiary} onChange={setBeneficiary} />

                <Text style={s.label}>Descrição</Text>
                <TextInput style={s.input} value={description} onChangeText={setDescription}
                    placeholder="Ex: Compras do mês" placeholderTextColor="#475569" />

                <Text style={s.label}>Conta *</Text>
                <AccountPicker selected={account} onSelect={setAccount} />

                <Text style={s.label}>Parcelas</Text>
                <TextInput style={s.input} value={installments} onChangeText={setInstallments}
                    placeholder="1" placeholderTextColor="#475569" keyboardType="number-pad" />
                <Text style={s.fieldHint}>
                    {parseInt(installments) > 1
                        ? `${installments}x de R$ ${(parseFloat(amount.replace(',', '.') || 0) / parseInt(installments)).toFixed(2).replace('.', ',')}`
                        : 'Parcela única'}
                </Text>
            </View>

            <TouchableOpacity style={s.saveBtn} onPress={handleSave} activeOpacity={0.85}>
                <Text style={s.saveBtnText}>Incluir</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    content: { paddingBottom: 40, paddingTop: 16 },
    form: { margin: 16, marginTop: 0, backgroundColor: '#1e293b', borderRadius: 16, padding: 20 },
    label: { color: '#89962F', fontSize: 11, letterSpacing: 1, marginTop: 16, marginBottom: 6 },
    input: { backgroundColor: '#0f172a', color: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 14, fontSize: 16 },
    inputAmount: { fontSize: 36, fontWeight: '900', color: '#CCFF00', textAlign: 'center', padding: 20, letterSpacing: 2 },
    fieldHint: { color: '#89962F', fontSize: 12, marginTop: 6 },
    saveBtn: { margin: 16, backgroundColor: '#CCFF00', borderRadius: 14, padding: 20, alignItems: 'center' },
    saveBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 17 },
});
