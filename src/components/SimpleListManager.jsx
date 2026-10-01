import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import BottomSheet from './BottomSheet';
import { supabase } from '../lib/supabase';

// Versão RN do SimpleListManager do Agilis-Web (AccountTypesManager.jsx):
// CRUD simples de uma tabela só com coluna "name" (ex: account_types,
// institutions). Mesmo contrato de props para ficar fácil de reusar.
export default function SimpleListManager({ visible, title, tableName, onClose }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editingValue, setEditingValue] = useState('');
    const [newValue, setNewValue] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase.from(tableName).select('id, name').order('name');
        setRows(data || []);
        setLoading(false);
    }, [tableName]);

    useEffect(() => {
        if (visible) fetchData();
    }, [visible, fetchData]);

    const startEdit = (row) => {
        setEditingId(row.id);
        setEditingValue(row.name);
    };

    const saveEdit = async () => {
        if (!editingValue.trim()) { setEditingId(null); return; }
        await supabase.from(tableName).update({ name: editingValue.trim() }).eq('id', editingId);
        setEditingId(null);
        fetchData();
    };

    const deleteRow = (id) => {
        Alert.alert('Excluir', 'Excluir este item?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Excluir', style: 'destructive', onPress: async () => {
                    await supabase.from(tableName).delete().eq('id', id);
                    fetchData();
                },
            },
        ]);
    };

    const addNew = async () => {
        if (!newValue.trim()) return;
        await supabase.from(tableName).insert([{ name: newValue.trim() }]);
        setNewValue('');
        fetchData();
    };

    const handleClose = () => {
        setEditingId(null);
        onClose();
    };

    return (
        <BottomSheet visible={visible} onClose={handleClose}>
            <View style={s.header}>
                <Text style={s.title}>{title}</Text>
                <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={s.closeIcon}>✕</Text>
                </TouchableOpacity>
            </View>

            <View style={s.addRow}>
                <TextInput
                    value={newValue}
                    onChangeText={setNewValue}
                    onSubmitEditing={addNew}
                    placeholder="Novo item..."
                    placeholderTextColor="#64748b"
                    style={s.input}
                    returnKeyType="done"
                />
                <TouchableOpacity onPress={addNew} style={s.addBtn}>
                    <Text style={s.addBtnText}>+ Adicionar</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={s.loadingBox}>
                    <ActivityIndicator color="#CCFF00" />
                </View>
            ) : (
                <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: 24 }}>
                    {rows.length === 0 && (
                        <Text style={s.emptyText}>Nenhum item cadastrado.</Text>
                    )}
                    {rows.map((row) => (
                        <View key={row.id} style={s.row}>
                            {editingId === row.id ? (
                                <TextInput
                                    value={editingValue}
                                    onChangeText={setEditingValue}
                                    onBlur={saveEdit}
                                    onSubmitEditing={saveEdit}
                                    style={[s.input, s.editInput]}
                                    autoFocus
                                    returnKeyType="done"
                                />
                            ) : (
                                <TouchableOpacity style={s.rowLabelBox} onPress={() => startEdit(row)}>
                                    <Text style={s.rowLabel}>{row.name}</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => deleteRow(row.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Text style={s.deleteIcon}>🗑</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
            )}

            <Text style={s.hint}>Toque num item pra editar · toque fora pra fechar</Text>
        </BottomSheet>
    );
}

const s = StyleSheet.create({
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, paddingBottom: 12 },
    title: { color: '#CCFF00', fontSize: 15, fontWeight: '800' },
    closeIcon: { color: '#94a3b8', fontSize: 18 },

    addRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, marginBottom: 10 },
    input: { flex: 1, backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: '#334155', color: '#fff', paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
    editInput: { borderColor: '#CCFF00' },
    addBtn: { backgroundColor: '#004d40', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
    addBtnText: { color: '#CCFF00', fontWeight: '700', fontSize: 12 },

    loadingBox: { padding: 30, alignItems: 'center' },
    list: { paddingHorizontal: 18 },
    emptyText: { color: '#64748b', fontSize: 12, textAlign: 'center', paddingVertical: 20 },

    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#334155' },
    rowLabelBox: { flex: 1 },
    rowLabel: { color: '#e2e8f0', fontSize: 13 },
    deleteIcon: { fontSize: 15 },

    hint: { color: '#475569', fontSize: 10, textAlign: 'center', paddingVertical: 10 },
});
