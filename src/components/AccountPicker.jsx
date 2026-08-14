import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';
import BottomSheet from './BottomSheet';

export default function AccountPicker({ selected, onSelect }) {
    const [accounts, setAccounts] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        const ctx = await getSecurityContext();
        if (ctx?.family_id) {
            const { data } = await supabase
                .from('accounts')
                .select('id, name, account_type')
                .eq('family_id', ctx.family_id)
                .order('name');
            setAccounts(data || []);
        }
        setLoading(false);
    };

    const handleOpen = () => {
        if (accounts.length === 0) load();
        setOpen(true);
    };

    return (
        <>
            <TouchableOpacity style={s.selector} onPress={handleOpen}>
                <Text style={s.selectorText}>{selected ? selected.name : 'Selecionar conta...'}</Text>
                <Text style={s.arrow}>›</Text>
            </TouchableOpacity>

            <BottomSheet visible={open} onClose={() => setOpen(false)}>
                <View style={s.sheetHeader}>
                    <Text style={s.sheetTitle}>Selecione a Conta</Text>
                    <TouchableOpacity onPress={() => setOpen(false)}>
                        <Text style={s.sheetClose}>✕</Text>
                    </TouchableOpacity>
                </View>
                {loading ? <ActivityIndicator color="#CCFF00" style={{ margin: 24 }} /> : (
                    <FlatList
                        data={accounts}
                        keyExtractor={i => i.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={s.accountRow} onPress={() => { onSelect(item); setOpen(false); }}>
                                <Text style={s.accountName}>{item.name}</Text>
                                <Text style={s.accountType}>{item.account_type}</Text>
                            </TouchableOpacity>
                        )}
                    />
                )}
            </BottomSheet>
        </>
    );
}

const s = StyleSheet.create({
    selector: { backgroundColor: '#0f172a', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    selectorText: { flex: 1, color: '#fff', fontSize: 15 },
    arrow: { color: '#CCFF00', fontSize: 20 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#334155' },
    sheetTitle: { color: '#CCFF00', fontWeight: '800', fontSize: 16 },
    sheetClose: { color: '#94a3b8', fontSize: 20 },
    accountRow: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
    accountName: { color: '#fff', fontSize: 16, fontWeight: '700' },
    accountType: { color: '#89962F', fontSize: 12, marginTop: 2 },
});
