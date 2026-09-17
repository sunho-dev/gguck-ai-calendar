import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { GoogleConnectBanner } from './components/GoogleConnectBanner';
import { Sidebar } from './components/Sidebar';
import type { NavKey } from './components/Sidebar';
import { colors } from './constants/colors';
import { AssistantScreen } from './screens/AssistantScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { PlaceholderScreen } from './screens/PlaceholderScreen';

const PLACEHOLDER_TITLES: Record<Exclude<NavKey, 'calendar' | 'assistant'>, string> = {
  rules: '나의 규칙',
  alerts: '알림함',
};

export default function App() {
  const [activeNav, setActiveNav] = useState<NavKey>('calendar');
  const { width } = useWindowDimensions();
  const compactSidebar = width < 700;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <GoogleConnectBanner />
        <View style={styles.shell}>
          <Sidebar active={activeNav} onSelect={setActiveNav} compact={compactSidebar} />
          <View style={styles.main}>
            {activeNav === 'calendar' ? (
              <CalendarScreen />
            ) : activeNav === 'assistant' ? (
              <AssistantScreen />
            ) : (
              <PlaceholderScreen title={PLACEHOLDER_TITLES[activeNav]} />
            )}
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  shell: {
    flex: 1,
    flexDirection: 'row',
  },
  main: {
    flex: 1,
    alignItems: 'center',
  },
});
