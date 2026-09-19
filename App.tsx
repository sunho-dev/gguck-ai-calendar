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
import { CategoriesScreen } from './screens/CategoriesScreen';
import { RulesScreen } from './screens/RulesScreen';
import { AlertsScreen } from './screens/AlertsScreen';
import {ReminderSync} from './components/ReminderSync';

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
  // 공유된 텍스트는 일정 비서로 넘길 때 사용할 수 있게 먼저 보관한다.
  const [assistantText, setAssistantText] = useState(() => readSharedText() ?? '');
  const [activeNav, setActiveNav] = useState<NavKey>(()=>readSharedText()?'assistant':'calendar');
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
        <ReminderSync />
        <View style={styles.shell}>
          <Sidebar active={activeNav} onSelect={setActiveNav} compact={compactSidebar} />
          <View style={styles.main}>
            {activeNav === 'calendar' ? (
              <CalendarScreen onCompose={text=>{setAssistantText(text);setActiveNav('assistant');}} onCategories={()=>setActiveNav('categories')} />
            ) : activeNav === 'categories' ? (
              <CategoriesScreen onCalendar={()=>setActiveNav('calendar')} />
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
