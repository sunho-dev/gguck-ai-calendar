import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
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

// 안드로이드 공유 시트(Web Share Target)로 "/share-target?title=...&text=...&url=..."
// 형태로 열렸을 때, 카톡 등에서 공유한 텍스트를 꺼내온다. text가 비어있으면 title로 대체.
function readSharedText(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const text = params.get('text')?.trim();
  const title = params.get('title')?.trim();
  const url = params.get('url')?.trim();
  const shared = [text, title, url].filter(Boolean).join(' ').trim();
  return shared || null;
}

export default function App() {
  const [activeNav, setActiveNav] = useState<NavKey>('calendar');
  const [sharedText, setSharedText] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const compactSidebar = width < 700;

  useEffect(() => {
    const shared = readSharedText();
    if (shared) {
      setSharedText(shared);
      setActiveNav('assistant');
      // 새로고침 시 같은 내용이 다시 자동 실행되지 않도록 주소를 정리
      window.history.replaceState(null, '', '/');
    }
  }, []);

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
              <AssistantScreen
                initialText={sharedText ?? ''}
                autoRun={Boolean(sharedText)}
                onInitialTextConsumed={() => setSharedText(null)}
              />
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
