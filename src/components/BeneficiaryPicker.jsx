import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import BottomSheet from './BottomSheet';

export default function BeneficiaryPicker({ value, onChange, placeholder = 'Selecionar fornecedor' }) {
    const [beneficiaries, setBeneficiaries] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    const load = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('beneficiaries')
            .select('id, name, category')
            .order('name');
        setBeneficiaries((data || []).filter(b => b.name));
        setLoading(false);
    };

    const handleOpen = () => {
        if (beneficiaries.length === 0) load();
        setSearch(value || '');
        setOpen(true);
    };

    const handlePick = (name) => {
        onChange(name);
        setOpen(false);
    };

    const filtered = beneficiaries.filter(b =>
        b.name.toLowerCase().includes(search.trim().toLowerCase())
    );
    const exactMatch = beneficiaries.some(b => b.name.toLowerCase() === search.trim().toLowerCase());

    return (
        <>
            <TouchableOpacity style={s.selector} onPress={handleOpen}>
                <Text style={value ? s.selectorText : s.selectorPlaceholder}>{value || placeholder}</Text>
                <Text style={s.arrow}>›</Text>
            </TouchableOpacity>

            <BottomSheet visible={open} onClose={() => setOpen(false)}>
                <View style={s.sheetHeader}>
                    <Text style={s.sheetTitle}>Selecione o Fornecedor</Text>
                    <TouchableOpacity onPress={() => setOpen(false)}>
                        <Text style={s.sheetClose}>✕</Text>
                    </TouchableOpacity>
                </View>

                <View style={s.searchWrap}>
                    <TextInput
                        style={s.searchInput}
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Buscar ou digitar novo fornecedor..."
                        placeholderTextColor="#475569"
                        autoFocus
                    />
                </View>

                {loading ? <ActivityIndicator color="#CCFF00" style={{ margin: 24 }} /> : (
                    <FlatList
                        data={filtered}
                        keyExtractor={i => i.id}
                        ListHeaderComponent={
                            search.trim() && !exactMatch ? (
                                <TouchableOpacity style={s.newRow} onPress={() => handlePick(search.trim())}>
                                    <Text style={s.newRowText}>+ Usar "{search.trim()}"</Text>
                                    <Text style={s.newRowHint}>Novo fornecedor (não cadastrado)</Text>
                                </TouchableOpacity>
                            ) : null
                        }
                        renderItem={({ item }) => (
                            <TouchableOpacity style={s.row} onPress={() => handlePick(item.name)}>
                                <Text style={s.rowName}>{item.name}</Text>
                                {!!item.category && <Text style={s.rowCategory}>{item.category}</Text>}
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={!search.trim() ? (
                            <Text style={s.emptyText}>Nenhum fornecedor cadastrado ainda.</Text>
                        ) : null}
                    />
                )}
            </BottomSheet>
        </>
    );
}

const s = StyleSheet.create({
    selector: { backgroundColor: '#0f172a', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    selectorText: { flex: 1, color: '#fff', fontSize: 16 },
    selectorPlaceholder: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
    arrow: { color: '#CCFF00', fontSize: 20 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 },
    sheetTitle: { color: '#CCFF00', fontWeight: '800', fontSize: 16 },
    sheetClose: { color: '#94a3b8', fontSize: 20 },
    searchWrap: { paddingHorizontal: 20, paddingBottom: 12 },
    searchInput: { backgroundColor: '#0f172a', color: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 12, fontSize: 15 },
    newRow: { padding: 18, backgroundColor: 'rgba(204,255,0,0.08)', borderBottomWidth: 1, borderBottomColor: '#0f172a' },
    newRowText: { color: '#CCFF00', fontSize: 15, fontWeight: '700' },
    newRowHint: { color: '#89962F', fontSize: 11, marginTop: 2 },
    row: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
    rowName: { color: '#fff', fontSize: 15, fontWeight: '600' },
    rowCategory: { color: '#89962F', fontSize: 11, marginTop: 2 },
    emptyText: { color: '#475569', textAlign: 'center', padding: 30, fontSize: 13 },
});
