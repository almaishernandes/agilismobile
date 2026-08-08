import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { CameraView } from 'expo-camera';

const { width: SCREEN_W } = Dimensions.get('window');
const FRAME_SIZE = Math.min(SCREEN_W * 0.7, 260);

export default function CameraScanner({ active = true, onScanned, hint = 'Aponte para o QR Code' }) {
    const scanY = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!active) return;
        scanY.setValue(0);
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(scanY, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true }),
                Animated.timing(scanY, { toValue: 0, duration: 0, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [active]);

    const translateY = scanY.interpolate({
        inputRange: [0, 1],
        outputRange: [-FRAME_SIZE / 2 + 4, FRAME_SIZE / 2 - 4],
    });

    return (
        <View style={s.container}>
            <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={active ? onScanned : undefined}
            />

            {/* Dark mask with cutout, built from 4 rectangles around the center frame */}
            <View style={s.maskTop} />
            <View style={s.maskBottom} />
            <View style={s.maskRow}>
                <View style={s.maskSide} />
                <View style={s.frame}>
                    <View style={[s.corner, s.cornerTL]} />
                    <View style={[s.corner, s.cornerTR]} />
                    <View style={[s.corner, s.cornerBL]} />
                    <View style={[s.corner, s.cornerBR]} />
                    {active && (
                        <Animated.View style={[s.scanLine, { transform: [{ translateY }] }]} />
                    )}
                </View>
                <View style={s.maskSide} />
            </View>

            <Text style={s.hint}>{hint}</Text>
        </View>
    );
}

const MASK_BG = 'rgba(0,0,0,0.55)';
const ACCENT = '#CCFF00';

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    maskTop: { flex: 1, backgroundColor: MASK_BG },
    maskBottom: { flex: 1, backgroundColor: MASK_BG },
    maskRow: { height: FRAME_SIZE, flexDirection: 'row' },
    maskSide: { flex: 1, backgroundColor: MASK_BG },
    frame: { width: FRAME_SIZE, height: FRAME_SIZE, overflow: 'hidden' },
    corner: { position: 'absolute', width: 32, height: 32, borderColor: ACCENT },
    cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
    cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
    cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
    cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
    scanLine: {
        position: 'absolute',
        left: 8,
        right: 8,
        top: '50%',
        height: 2,
        backgroundColor: ACCENT,
        shadowColor: ACCENT,
        shadowOpacity: 0.9,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
    },
    hint: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        textAlign: 'center',
        color: '#fff',
        fontSize: 14,
        paddingHorizontal: 24,
    },
});
