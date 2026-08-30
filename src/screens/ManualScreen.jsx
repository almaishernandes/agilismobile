import React from 'react';
import EntrySequence from './EntrySequence';

// Digitação: sequência de campos com teclado; o campo Valor tem microfone
// embutido para quem preferir ditar em vez de digitar (ver NumberField em
// EntrySequence.jsx) — não existe mais uma aba de Voz separada.
export default function ManualScreen({ navigation, account }) {
    return <EntrySequence navigation={navigation} account={account} />;
}
