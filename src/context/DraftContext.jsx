import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@agilis_input_drafts';

const DraftContext = createContext(null);

export function DraftProvider({ children }) {
    const [drafts, setDrafts] = useState([]);
    const [loaded, setLoaded] = useState(false);

    // Load from AsyncStorage on mount
    useEffect(() => {
        AsyncStorage.getItem(STORAGE_KEY)
            .then(raw => {
                if (raw) setDrafts(JSON.parse(raw));
            })
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, []);

    // Persist whenever drafts change (after initial load)
    useEffect(() => {
        if (!loaded) return;
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(drafts)).catch(() => {});
    }, [drafts, loaded]);

    const addDraft = useCallback((item) => {
        const draft = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
            type: 'transaction',
            account_id: null,
            account_name: '',
            amount: 0,
            beneficiary: '',
            description: '',
            installments: 1,
            chave_nfce: null,
            photo_uri: null,
            date_created: new Date().toISOString(),
            ...item,
        };
        setDrafts(prev => [draft, ...prev]);
        return draft;
    }, []);

    const updateDraft = useCallback((id, patch) => {
        setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
    }, []);

    const removeDraft = useCallback((id) => {
        setDrafts(prev => prev.filter(d => d.id !== id));
    }, []);

    const clearAll = useCallback(() => {
        setDrafts([]);
    }, []);

    const totalAmount = drafts.reduce((s, d) => s + (d.amount || 0), 0);

    return (
        <DraftContext.Provider value={{ drafts, addDraft, updateDraft, removeDraft, clearAll, totalAmount, loaded }}>
            {children}
        </DraftContext.Provider>
    );
}

export function useDrafts() {
    const ctx = useContext(DraftContext);
    if (!ctx) throw new Error('useDrafts must be used inside DraftProvider');
    return ctx;
}
