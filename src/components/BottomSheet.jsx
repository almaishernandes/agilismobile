import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';

// Substitui o Modal do React Native: no web, Modal usa um portal que escapa
// da moldura de celular (MobileFrame) e cobre a tela inteira do PC. Este
// componente é só uma View posicionada de forma absoluta, presa ao
// container relativo mais próximo (a tela do app dentro da moldura).
export default function BottomSheet({ visible, onClose, children }) {
    if (!visible) return null;
    return (
        <View style={s.overlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
            <View style={s.sheet}>{children}</View>
        </View>
    );
}

const s = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
        zIndex: 1000,
    },
    sheet: {
        backgroundColor: '#1e293b',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '75%',
    },
});
