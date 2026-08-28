import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { getPortalNode } from '../lib/portalHost';

let createPortal = null;
if (Platform.OS === 'web') {
    // eslint-disable-next-line global-require
    createPortal = require('react-dom').createPortal;
}

// Substitui o Modal do React Native: no web, Modal usa um portal que escapa
// da moldura de celular (MobileFrame) e cobre a tela inteira do PC. Este
// componente é uma View posicionada de forma absoluta, mas renderizada via
// portal direto na tela do app (registrada por MobileFrame) — assim ela
// nunca fica presa a um container pequeno no meio do formulário onde foi
// disparada, e nunca escapa pra fora da moldura/tela do app.
export default function BottomSheet({ visible, onClose, children }) {
    if (!visible) return null;

    const content = (
        <View style={s.overlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
            <View style={s.sheet}>{children}</View>
        </View>
    );

    if (Platform.OS === 'web' && createPortal) {
        const node = getPortalNode();
        if (node) return createPortal(content, node);
    }
    return content;
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
