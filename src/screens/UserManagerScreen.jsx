import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';
import { adminCreateUser, adminUpdateUser, adminDeleteUser } from '../lib/adminApi';

const ROLES = ['Suporte', 'Administrador', 'Gestor', 'Operacional'];
const SUPPORT_EMAIL = 'almaishernandes@gmail.com';
const emptyNew = () => ({ id: `new-${Date.now()}`, full_name: '', email: '', password: '', role: 'Operacional', isNew: true });

// Versão RN do UserManager.jsx do Agilis-Web: a tabela estilo planilha
// vira uma lista de cards expansíveis, mais adequada ao toque/mobile.
export default function UserManagerScreen({ navigation }) {
    const [security, setSecurity] = useState(null);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [draft, setDraft] = useState({});
    const [newUser, setNewUser] = useState(null);

    const fetchUsers = useCallback(async (ctx) => {
        setLoading(true);
        const resolved = ctx || security;
        const isSupport = resolved?.role?.includes('Suporte') || resolved?.email?.toLowerCase() === SUPPORT_EMAIL;
        let query = supabase.from('profiles').select('*');
        if (!isSupport && resolved?.family_id) query = query.eq('family_id', resolved.family_id);
        const { data } = await query.order('role').order('full_name');
        setUsers(data || []);
        setLoading(false);
    }, [security]);

    useEffect(() => {
        (async () => {
            const ctx = await getSecurityContext();
            setSecurity(ctx);
            await fetchUsers(ctx);
        })();
    }, []);

    const isSuporte = security?.role?.split(',').map((r) => r.trim()).includes('Suporte')
        || security?.email?.toLowerCase() === SUPPORT_EMAIL;

    const openEdit = (user) => {
        setExpandedId(user.id);
        setDraft({ full_name: user.full_name || '', email: user.email || '', password: '', role: user.role || '' });
    };

    const toggleRole = (roleName) => {
        const arr = (draft.role || '').split(',').map((r) => r.trim()).filter(Boolean);
        const has = arr.includes(roleName);
        const next = has ? arr.filter((r) => r !== roleName) : [...arr, roleName];
        setDraft((d) => ({ ...d, role: next.join(',') }));
    };

    const saveEdit = async (id) => {
        try {
            const payload = { full_name: draft.full_name, email: draft.email, role: draft.role, family_id: security.family_id };
            if (draft.password) payload.password = draft.password;
            await adminUpdateUser({ user_id: id, ...payload });
            setExpandedId(null);
            fetchUsers();
        } catch (err) {
            Alert.alert('Erro', err.message);
        }
    };

    const saveNewUser = async () => {
        if (!newUser.email || !newUser.password) {
            Alert.alert('Campos obrigatórios', 'E-mail e senha são obrigatórios para criar um usuário.');
            return;
        }
        try {
            await adminCreateUser({ ...newUser, family_id: security.family_id });
            setNewUser(null);
            fetchUsers();
        } catch (err) {
            Alert.alert('Erro', err.message);
        }
    };

    const deleteUser = (id) => {
        Alert.alert('Excluir', 'Tem certeza que deseja excluir este usuário?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Excluir', style: 'destructive', onPress: async () => {
                    try {
                        await adminDeleteUser(id);
                        fetchUsers();
                    } catch (err) {
                        Alert.alert('Erro', err.message);
                    }
                },
            },
        ]);
    };

    const roleBadgeColor = (roleStr) => {
        const r = (roleStr || '').split(',').map((x) => x.trim());
        if (r.includes('Suporte')) return '#0891b2';
        if (r.includes('Administrador')) return '#CCFF00';
        if (r.includes('Gestor')) return '#2563eb';
        return '#16a34a';
    };

    if (loading) {
        return (
            <View style={s.container}>
                <Header navigation={navigation} />
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color="#CCFF00" />
                </View>
            </View>
        );
    }

    if (!isSuporte) {
        return (
            <View style={s.container}>
                <Header navigation={navigation} />
                <View style={s.restricted}>
                    <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
                    <Text style={s.restrictedTitle}>Acesso Exclusivo Suporte</Text>
                    <Text style={s.restrictedText}>
                        Esta área é reservada para administração técnica do Agili$. Apenas usuários com
                        perfil de Suporte podem gerenciar a equipe.
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={s.container}>
            <Header navigation={navigation} />
            <ScrollView contentContainerStyle={s.list}>
                {users.map((user) => {
                    const open = expandedId === user.id;
                    return (
                        <View key={user.id} style={s.card}>
                            <TouchableOpacity style={s.cardRow} onPress={() => (open ? setExpandedId(null) : openEdit(user))} activeOpacity={0.8}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.cardName}>{user.full_name || '—'}</Text>
                                    <Text style={s.cardEmail}>{user.email}</Text>
                                </View>
                                <View style={[s.roleBadge, { backgroundColor: roleBadgeColor(user.role) }]}>
                                    <Text style={s.roleBadgeText} numberOfLines={1}>{(user.role || '').split(',')[0] || '—'}</Text>
                                </View>
                                <TouchableOpacity onPress={() => deleteUser(user.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                    <Text style={s.deleteIcon}>🗑</Text>
                                </TouchableOpacity>
                            </TouchableOpacity>

                            {open && (
                                <View style={s.editArea}>
                                    <TextInput style={s.input} value={draft.full_name} onChangeText={(t) => setDraft((d) => ({ ...d, full_name: t }))} placeholder="Nome completo" placeholderTextColor="#64748b" />
                                    <TextInput style={s.input} value={draft.email} onChangeText={(t) => setDraft((d) => ({ ...d, email: t }))} placeholder="E-mail" placeholderTextColor="#64748b" autoCapitalize="none" />
                                    <TextInput style={s.input} value={draft.password} onChangeText={(t) => setDraft((d) => ({ ...d, password: t }))} placeholder="Nova senha (deixe vazio p/ manter)" placeholderTextColor="#64748b" secureTextEntry />
                                    <View style={s.rolesRow}>
                                        {ROLES.map((r) => {
                                            const active = (draft.role || '').split(',').map((x) => x.trim()).includes(r);
                                            return (
                                                <TouchableOpacity key={r} onPress={() => toggleRole(r)} style={[s.roleChip, active && s.roleChipActive]}>
                                                    <Text style={[s.roleChipText, active && s.roleChipTextActive]}>{r}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                    <TouchableOpacity style={s.saveBtn} onPress={() => saveEdit(user.id)}>
                                        <Text style={s.saveBtnText}>Salvar</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    );
                })}

                {newUser ? (
                    <View style={s.card}>
                        <View style={s.editArea}>
                            <TextInput style={s.input} value={newUser.full_name} onChangeText={(t) => setNewUser((d) => ({ ...d, full_name: t }))} placeholder="Nome completo" placeholderTextColor="#64748b" />
                            <TextInput style={s.input} value={newUser.email} onChangeText={(t) => setNewUser((d) => ({ ...d, email: t }))} placeholder="E-mail" placeholderTextColor="#64748b" autoCapitalize="none" />
                            <TextInput style={s.input} value={newUser.password} onChangeText={(t) => setNewUser((d) => ({ ...d, password: t }))} placeholder="Senha" placeholderTextColor="#64748b" secureTextEntry />
                            <View style={s.rolesRow}>
                                {ROLES.map((r) => {
                                    const active = newUser.role.split(',').map((x) => x.trim()).includes(r);
                                    return (
                                        <TouchableOpacity
                                            key={r}
                                            onPress={() => {
                                                const arr = newUser.role.split(',').map((x) => x.trim()).filter(Boolean);
                                                const next = active ? arr.filter((x) => x !== r) : [...arr, r];
                                                setNewUser((d) => ({ ...d, role: next.join(',') }));
                                            }}
                                            style={[s.roleChip, active && s.roleChipActive]}
                                        >
                                            <Text style={[s.roleChipText, active && s.roleChipTextActive]}>{r}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity style={[s.saveBtn, { flex: 1 }]} onPress={saveNewUser}>
                                    <Text style={s.saveBtnText}>Gravar Cadastro</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.cancelBtn} onPress={() => setNewUser(null)}>
                                    <Text style={s.cancelBtnText}>Cancelar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity style={s.addBtn} onPress={() => setNewUser(emptyNew())}>
                        <Text style={s.addBtnText}>+ Novo usuário</Text>
                    </TouchableOpacity>
                )}
            </ScrollView>
        </View>
    );
}

function Header({ navigation }) {
    return (
        <View style={s.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={s.backIcon}>‹</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>Equipe Agili$</Text>
            <View style={{ width: 24 }} />
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#004d40', paddingHorizontal: 16, paddingVertical: 14, paddingTop: 24 },
    backIcon: { color: '#fff', fontSize: 26, width: 24 },
    headerTitle: { color: '#CCFF00', fontSize: 16, fontWeight: '800' },

    restricted: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    restrictedTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 10 },
    restrictedText: { color: '#94a3b8', fontSize: 13, textAlign: 'center', lineHeight: 19 },

    list: { padding: 16, gap: 10 },
    card: { backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
    cardName: { color: '#fff', fontWeight: '700', fontSize: 13 },
    cardEmail: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
    roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, maxWidth: 100 },
    roleBadgeText: { color: '#0f172a', fontSize: 10, fontWeight: '800' },
    deleteIcon: { fontSize: 15, marginLeft: 4 },

    editArea: { padding: 14, paddingTop: 0, gap: 8 },
    input: { backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: '#334155', color: '#fff', paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
    rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    roleChip: { borderWidth: 1, borderColor: '#334155', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
    roleChipActive: { backgroundColor: '#CCFF00', borderColor: '#CCFF00' },
    roleChipText: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
    roleChipTextActive: { color: '#0f172a' },
    saveBtn: { backgroundColor: '#004d40', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
    saveBtnText: { color: '#CCFF00', fontWeight: '800', fontSize: 12 },
    cancelBtn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: '#334155' },
    cancelBtnText: { color: '#94a3b8', fontWeight: '700', fontSize: 12 },

    addBtn: { borderWidth: 1, borderColor: '#334155', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    addBtnText: { color: '#CCFF00', fontWeight: '700', fontSize: 13 },
});
