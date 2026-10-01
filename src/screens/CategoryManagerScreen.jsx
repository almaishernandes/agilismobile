import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../lib/supabase';

// Versão RN do CategoryManager.jsx do Agilis-Web: mesma ideia (CRUD
// genérico orientado por config de colunas), mas em lista de cards
// expansíveis em vez de planilha — melhor pro toque.
const CONFIGS = {
    'cost-centers': {
        table: 'cost_centers',
        title: 'Centros de Custo',
        columns: [
            { label: 'Código', key: 'code' },
            { label: 'Descrição', key: 'description' },
            { label: 'Categoria', key: 'category', type: 'select', options: ['rendimento', 'despesa'] },
        ],
        defaultNew: { code: '', description: '', category: 'despesa' },
    },
    'chart-of-accounts': {
        table: 'chart_of_accounts',
        title: 'Plano de Contas',
        columns: [
            { label: 'Código', key: 'code' },
            { label: 'Descrição', key: 'description' },
        ],
        defaultNew: { code: '', description: '', level: 1 },
    },
    vendors: {
        table: 'vendors',
        title: 'Fornecedores',
        columns: [
            { label: 'Código', key: 'code' },
            { label: 'Nome do Fornecedor', key: 'name' },
            { label: 'Categoria', key: 'category' },
            { label: 'Notas', key: 'notes' },
        ],
        defaultNew: { code: '', name: '', category: '', notes: '' },
    },
};

export default function CategoryManagerScreen({ navigation, route }) {
    const type = route?.params?.type || 'cost-centers';
    const config = CONFIGS[type] || CONFIGS['cost-centers'];

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [draft, setDraft] = useState({});
    const [adding, setAdding] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase.from(config.table).select('*').order('code', { ascending: true });
        setRows(data || []);
        setLoading(false);
    }, [config.table]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const openEdit = (row) => {
        setExpandedId(row.id);
        setDraft({ ...row });
    };

    const saveEdit = async (id) => {
        const { id: _omit, ...payload } = draft;
        const { error } = await supabase.from(config.table).update(payload).eq('id', id);
        if (error) { Alert.alert('Erro', error.message); return; }
        setExpandedId(null);
        fetchData();
    };

    const deleteRow = (id) => {
        Alert.alert('Excluir', 'Excluir este item?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Excluir', style: 'destructive', onPress: async () => {
                    const { error } = await supabase.from(config.table).delete().eq('id', id);
                    if (error) { Alert.alert('Erro', error.message); return; }
                    fetchData();
                },
            },
        ]);
    };

    const startAdd = () => {
        setDraft({ ...config.defaultNew });
        setAdding(true);
    };

    const saveNew = async () => {
        if (!draft.code && !draft.name) {
            Alert.alert('Campo obrigatório', 'Preencha ao menos o código/nome.');
            return;
        }
        const { error } = await supabase.from(config.table).insert([draft]);
        if (error) { Alert.alert('Erro', error.message); return; }
        setAdding(false);
        fetchData();
    };

    const renderForm = (idPrefix) => (
        <View style={s.editArea}>
            {config.columns.map((col) => (
                <View key={col.key}>
                    <Text style={s.fieldLabel}>{col.label}</Text>
                    {col.type === 'select' ? (
                        <View style={s.rolesRow}>
                            {col.options.map((opt) => {
                                const active = draft[col.key] === opt;
                                return (
                                    <TouchableOpacity
                                        key={opt}
                                        onPress={() => setDraft((d) => ({ ...d, [col.key]: opt }))}
                                        style={[s.chip, active && s.chipActive]}
                                    >
                                        <Text style={[s.chipText, active && s.chipTextActive]}>{opt}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ) : (
                        <TextInput
                            style={s.input}
                            value={String(draft[col.key] ?? '')}
                            onChangeText={(t) => setDraft((d) => ({ ...d, [col.key]: t }))}
                            placeholder={col.label}
                            placeholderTextColor="#64748b"
                        />
                    )}
                </View>
            ))}
        </View>
    );

    return (
        <View style={s.container}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={s.backIcon}>‹</Text>
                </TouchableOpacity>
                <Text style={s.headerTitle}>{config.title}</Text>
                <View style={{ width: 24 }} />
            </View>

            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color="#CCFF00" />
                </View>
            ) : (
                <ScrollView contentContainerStyle={s.list}>
                    {rows.length === 0 && !adding && (
                        <Text style={s.emptyText}>Nenhum item cadastrado.</Text>
                    )}
                    {rows.map((row) => {
                        const open = expandedId === row.id;
                        const primary = row[config.columns[0].key];
                        const secondary = row[config.columns[1]?.key];
                        return (
                            <View key={row.id} style={s.card}>
                                <TouchableOpacity style={s.cardRow} onPress={() => (open ? setExpandedId(null) : openEdit(row))} activeOpacity={0.8}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.cardPrimary}>{primary || '—'}</Text>
                                        {secondary ? <Text style={s.cardSecondary}>{secondary}</Text> : null}
                                    </View>
                                    <TouchableOpacity onPress={() => deleteRow(row.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                        <Text style={s.deleteIcon}>🗑</Text>
                                    </TouchableOpacity>
                                </TouchableOpacity>

                                {open && (
                                    <>
                                        {renderForm(row.id)}
                                        <TouchableOpacity style={s.saveBtn} onPress={() => saveEdit(row.id)}>
                                            <Text style={s.saveBtnText}>Salvar</Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        );
                    })}

                    {adding ? (
                        <View style={s.card}>
                            {renderForm('new')}
                            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14 }}>
                                <TouchableOpacity style={[s.saveBtn, { flex: 1, marginTop: 0 }]} onPress={saveNew}>
                                    <Text style={s.saveBtnText}>Adicionar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.cancelBtn} onPress={() => setAdding(false)}>
                                    <Text style={s.cancelBtnText}>Cancelar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <TouchableOpacity style={s.addBtn} onPress={startAdd}>
                            <Text style={s.addBtnText}>+ Adicionar</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#004d40', paddingHorizontal: 16, paddingVertical: 14, paddingTop: 24 },
    backIcon: { color: '#fff', fontSize: 26, width: 24 },
    headerTitle: { color: '#CCFF00', fontSize: 16, fontWeight: '800' },

    list: { padding: 16, gap: 10 },
    emptyText: { color: '#64748b', fontSize: 12, textAlign: 'center', paddingVertical: 20 },
    card: { backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
    cardPrimary: { color: '#fff', fontWeight: '700', fontSize: 13 },
    cardSecondary: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
    deleteIcon: { fontSize: 15 },

    editArea: { padding: 14, paddingTop: 0, gap: 10 },
    fieldLabel: { color: '#89962F', fontSize: 10, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
    input: { backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: '#334155', color: '#fff', paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
    rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { borderWidth: 1, borderColor: '#334155', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
    chipActive: { backgroundColor: '#CCFF00', borderColor: '#CCFF00' },
    chipText: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
    chipTextActive: { color: '#0f172a' },

    saveBtn: { backgroundColor: '#004d40', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginHorizontal: 14, marginTop: 4, marginBottom: 14 },
    saveBtnText: { color: '#CCFF00', fontWeight: '800', fontSize: 12 },
    cancelBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
    cancelBtnText: { color: '#94a3b8', fontWeight: '700', fontSize: 12 },

    addBtn: { borderWidth: 1, borderColor: '#334155', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    addBtnText: { color: '#CCFF00', fontWeight: '700', fontSize: 13 },
});
