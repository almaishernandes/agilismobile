import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { DraftProvider } from '../context/DraftContext';

import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import ReviewScreen from '../screens/ReviewScreen';

const Stack = createStackNavigator();

const NAV_THEME = {
    dark: true,
    colors: { background: '#0f172a', card: '#004d40', text: '#fff', border: 'transparent', primary: '#CCFF00' },
};

export default function AppNavigator() {
    const [session, setSession] = useState(undefined);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
        return () => subscription.unsubscribe();
    }, []);

    if (session === undefined) {
        return (
            <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color="#CCFF00" size="large" />
            </View>
        );
    }

    return (
        <DraftProvider>
            <NavigationContainer theme={NAV_THEME}>
                <Stack.Navigator screenOptions={{ headerShown: false, animationEnabled: true }}>
                    {!session ? (
                        <Stack.Screen name="Login" component={LoginScreen} />
                    ) : (
                        <>
                            <Stack.Screen name="Home" component={HomeScreen} />
                            <Stack.Screen name="Review" component={ReviewScreen} />
                        </>
                    )}
                </Stack.Navigator>
            </NavigationContainer>
        </DraftProvider>
    );
}
