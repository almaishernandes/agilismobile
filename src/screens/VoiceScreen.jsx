import React from 'react';
import EntrySequence from './EntrySequence';

// Mesmos campos e mesma sequência da Digitação, só que os campos
// numéricos (Valor/Parcelas) escutam por voz em vez de esperar teclado.
export default function VoiceScreen({ navigation }) {
    return <EntrySequence navigation={navigation} voiceEnabled />;
}
