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
import { RulesScreen } from './screens/RulesScreen';
import { AlertsScreen } from './screens/AlertsScreen';

const PLACEHOLDER_TITLES: Record<Exclude<NavKey, 'calendar' | 'assistant'>, string> = {
  rules: '나의 규칙',
  alerts: '알림함',
};

// 안드로이드 공유 시트(Web Share Target)로 "/share-target.html?title=...&text=...&url=..."
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
  // 초기 state를 렌더링 전에 동기적으로 계산해야 한다: activeNav 기본값이 이미
  // 'assistant'라 AssistantScreen이 최초 렌더에서 바로 마운트되고, 그 내부 text
  // state(useState(initialText))는 최초 마운트 값만 사용하므로 useEffect로 나중에
  // assistantText를 바꿔도 반영되지 않는다.
  const [assistantText, setAssistantText] = useState(() => readSharedText() ?? '');
  const [activeNav, setActiveNav] = useState<NavKey>('assistant');
  const { width } = useWindowDimensions();
  const compactSidebar = width < 700;

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
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
              <CalendarScreen onCompose={text=>{setAssistantText(text);setActiveNav('assistant');}} />
            ) : activeNav === 'assistant' ? (
              <AssistantScreen initialText={assistantText} onRules={()=>setActiveNav('rules')} onCalendar={()=>setActiveNav('calendar')} />
            ) : (
              activeNav==='rules'?<RulesScreen />:<AlertsScreen onCompose={()=>setActiveNav('assistant')} />
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
