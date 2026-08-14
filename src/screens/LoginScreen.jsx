import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async () => {
        if (!email || !password) { setError('Preencha e-mail e senha.'); return; }
        setLoading(true); setError('');
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        setLoading(false);
        if (err) setError(err.message);
    };

    return (
        <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.card}>
                <Text style={s.logo}>💰 AGILI$</Text>
                <Text style={s.appName}>Agilis Mobile</Text>
                <Text style={s.sub}>Fila de Rascunhos Diários</Text>

                <TextInput style={s.input} placeholder="E-mail" placeholderTextColor="#475569"
                    value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                <TextInput style={s.input} placeholder="Senha" placeholderTextColor="#475569"
                    value={password} onChangeText={setPassword} secureTextEntry />

                {!!error && <Text style={s.error}>{error}</Text>}

                <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
                    {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={s.btnText}>ENTRAR</Text>}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    wrap: { flex: 1, width: '100%', backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 24, boxSizing: 'border-box' },
    card: { width: '100%', maxWidth: 380, backgroundColor: '#1e293b', borderRadius: 20, padding: 36, alignItems: 'center' },
    logo: { fontSize: 40, fontWeight: '900', color: '#CCFF00', letterSpacing: 2 },
    appName: { fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 4, letterSpacing: 1 },
    sub: { fontSize: 12, color: '#89962F', marginBottom: 36, marginTop: 4, letterSpacing: 0.5 },
    input: { width: '100%', backgroundColor: '#0f172a', color: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 16, fontSize: 15, marginBottom: 14 },
    error: { color: '#ff8a80', fontSize: 13, marginBottom: 12, textAlign: 'center' },
    btn: { width: '100%', backgroundColor: '#CCFF00', borderRadius: 12, padding: 18, alignItems: 'center', marginTop: 8 },
    btnText: { color: '#0f172a', fontWeight: '900', fontSize: 17, letterSpacing: 1 },
});
