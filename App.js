import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation/AppNavigator';
import MobileFrame from './src/components/MobileFrame';

export default function App() {
    return (
        <MobileFrame>
            <StatusBar style="light" />
            <AppNavigator />
        </MobileFrame>
    );
}
