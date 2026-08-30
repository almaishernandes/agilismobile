import React from 'react';
import EntrySequence from './EntrySequence';

// Mesmos campos e mesma sequência da Voz, só que os campos numéricos
// (Valor/Parcelas) vão direto pro teclado, sem reconhecimento de voz.
export default function ManualScreen({ navigation, account }) {
    return <EntrySequence navigation={navigation} voiceEnabled={false} account={account} />;
}
