import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';

const PHONE_WIDTH = 430;
const PHONE_HEIGHT = 900;
const WIDE_SCREEN_BREAKPOINT = 700;

// No web, quando a janela é larga (PC), envolve o app numa "moldura" do
// tamanho de um celular, centralizada na tela. Em telas estreitas (celular
// de verdade) ou fora da web, renderiza o app normalmente, sem moldura.
export default function MobileFrame({ children }) {
    const { width, height } = useWindowDimensions();
    const [isWideWeb, setIsWideWeb] = useState(false);

    useEffect(() => {
        setIsWideWeb(Platform.OS === 'web' && width >= WIDE_SCREEN_BREAKPOINT);
    }, [width]);

    if (!isWideWeb) return children;

    return (
        <View style={s.backdrop}>
            <View style={[s.phone, { maxHeight: Math.min(PHONE_HEIGHT, height - 40) }]}>
                {children}
            </View>
        </View>
    );
}

const s = StyleSheet.create({
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
