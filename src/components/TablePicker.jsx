import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import BottomSheet from './BottomSheet';

// Seletor genérico para tabelas de referência simples (conta, centro de
// custo, plano de contas...). `buildLabel(row)` monta o texto exibido.
export default function TablePicker({
    selected,
    onSelect,
    table,
    columns,
    orderBy,
    title,
    placeholder,
    buildLabel,
}) {
    const [rows, setRows] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    const load = async () => {
        setLoading(true);
        const { data } = await supabase.from(table).select(columns).order(orderBy);
        setRows(data || []);
        setLoading(false);
    };

    const handleOpen = () => {
        if (rows.length === 0) load();
        setSearch('');
        setOpen(true);
    };

    const filtered = rows.filter(r =>
        buildLabel(r).toLowerCase().includes(search.trim().toLowerCase())
    );

    return (
        <>
            <TouchableOpacity style={s.selector} onPress={handleOpen}>
                <Text style={selected ? s.selectorText : s.selectorPlaceholder}>
                    {selected ? buildLabel(selected) : placeholder}
                </Text>
                <Text style={s.arrow}>›</Text>
            </TouchableOpacity>

            <BottomSheet visible={open} onClose={() => setOpen(false)}>
                <View style={s.sheetHeader}>
                    <Text style={s.sheetTitle}>{title}</Text>
                    <TouchableOpacity onPress={() => setOpen(false)}>
                        <Text style={s.sheetClose}>✕</Text>
                    </TouchableOpacity>
                </View>

                <View style={s.searchWrap}>
                    <TextInput
                        style={s.searchInput}
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Buscar..."
                        placeholderTextColor="#475569"
                        autoFocus
                    />
                </View>

                {loading ? <ActivityIndicator color="#CCFF00" style={{ margin: 24 }} /> : (
                    <FlatList
                        style={s.list}
                        data={filtered}
                        keyExtractor={i => String(i.id)}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={s.row} onPress={() => { onSelect(item); setOpen(false); }}>
                                <Text style={s.rowName}>{buildLabel(item)}</Text>
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={<Text style={s.emptyText}>Nenhum registro encontrado.</Text>}
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
    list: { maxHeight: 320 },
    searchWrap: { paddingHorizontal: 20, paddingBottom: 12 },
    searchInput: { backgroundColor: '#0f172a', color: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 12, fontSize: 15 },
    row: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
    rowName: { color: '#fff', fontSize: 15, fontWeight: '600' },
    emptyText: { color: '#475569', textAlign: 'center', padding: 30, fontSize: 13 },
});
