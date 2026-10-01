import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import SimpleListManager from '../components/SimpleListManager';

// Tela de administração/configurações do Agilis — primeira fase da
// unificação Web+Mobile num único app (ver conversa de 2026-10-01):
// cada item aqui é uma tela do Agilis-Web sendo portada aos poucos.
// kind: 'sheet' abre um BottomSheet aqui mesmo; 'screen' navega para
// uma tela própria (telas maiores, com formulário completo).
const ITEMS = [
    { key: 'account_types', kind: 'sheet', title: 'Tipos de Conta', desc: 'Categorias usadas para agrupar contas (ex: Corrente, Poupança).', icon: '🏷️' },
    { key: 'institutions', kind: 'sheet', title: 'Instituições', desc: 'Bancos e instituições financeiras das contas.', icon: '🏦' },
    { key: 'users', kind: 'screen', route: 'UserManager', title: 'Equipe', desc: 'Usuários do Agilis e seus níveis de acesso.', icon: '👥' },
    { key: 'cost-centers', kind: 'screen', route: 'CategoryManager', params: { type: 'cost-centers' }, title: 'Centros de Custo', desc: 'Classificação de receitas e despesas.', icon: '🏷️' },
    { key: 'chart-of-accounts', kind: 'screen', route: 'CategoryManager', params: { type: 'chart-of-accounts' }, title: 'Plano de Contas', desc: 'Estrutura contábil usada nos lançamentos.', icon: '📑' },
    { key: 'vendors', kind: 'screen', route: 'CategoryManager', params: { type: 'vendors' }, title: 'Fornecedores', desc: 'Cadastro de fornecedores e prestadores.', icon: '🧾' },
];

export default function GestaoScreen({ navigation }) {
    const [openManager, setOpenManager] = useState(null);

    const activeSheetItem = ITEMS.find((i) => i.kind === 'sheet' && i.key === openManager);

    const handlePress = (item) => {
        if (item.kind === 'sheet') setOpenManager(item.key);
        else navigation.navigate(item.route, item.params);
    };

    return (
        <View style={s.container}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={s.backIcon}>‹</Text>
                </TouchableOpacity>
                <Text style={s.headerTitle}>Gestão</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={s.list}>
                {ITEMS.map((item) => (
                    <TouchableOpacity key={item.key} style={s.card} onPress={() => handlePress(item)} activeOpacity={0.8}>
                        <Text style={s.cardIcon}>{item.icon}</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle}>{item.title}</Text>
                            <Text style={s.cardDesc}>{item.desc}</Text>
                        </View>
                        <Text style={s.cardArrow}>›</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {activeSheetItem && (
                <SimpleListManager
                    visible={!!openManager}
                    title={activeSheetItem.title}
                    tableName={activeSheetItem.key}
                    onClose={() => setOpenManager(null)}
                />
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
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', padding: 14 },
    cardIcon: { fontSize: 24 },
    cardTitle: { color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 2 },
    cardDesc: { color: '#94a3b8', fontSize: 11, lineHeight: 15 },
    cardArrow: { color: '#64748b', fontSize: 20 },
});
