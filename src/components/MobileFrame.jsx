import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { setPortalNode } from '../lib/portalHost';

const PHONE_WIDTH = 430;
const PHONE_HEIGHT = 900;
const WIDE_SCREEN_BREAKPOINT = 700;

// No web, quando a janela é larga (PC), envolve o app numa "moldura" do
// tamanho de um celular, centralizada na tela. Em telas estreitas (celular
// de verdade) ou fora da web, renderiza o app normalmente, sem moldura.
//
// Em ambos os casos, a View que envolve o app é registrada como "teto" dos
// menus suspensos (BottomSheet) — assim eles sempre aparecem presos à tela
// do app inteira, não a um container pequeno no meio do formulário onde
// foram disparados.
export default function MobileFrame({ children }) {
    const { width, height } = useWindowDimensions();
    const [isWideWeb, setIsWideWeb] = useState(false);

    useEffect(() => {
        setIsWideWeb(Platform.OS === 'web' && width >= WIDE_SCREEN_BREAKPOINT);
    }, [width]);

    const portalRef = (node) => {
        if (node && Platform.OS === 'web') setPortalNode(node);
    };

    if (!isWideWeb) {
        return (
            <View ref={portalRef} style={s.fullBleed}>
                {children}
            </View>
        );
    }

    return (
        <View style={s.backdrop}>
            <View ref={portalRef} style={[s.phone, { maxHeight: Math.min(PHONE_HEIGHT, height - 40) }]}>
                {children}
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    fullBleed: {
        flex: 1,
        position: 'relative',
    },
    backdrop: {
        flex: 1,
        minHeight: '100vh',
        backgroundColor: '#020617',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    phone: {
        position: 'relative',
        width: PHONE_WIDTH,
        height: '100%',
        maxWidth: '100%',
        borderRadius: 40,
        overflow: 'hidden',
        borderWidth: 8,
        borderColor: '#1e293b',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
    },
});
