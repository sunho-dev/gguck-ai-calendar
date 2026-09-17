import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';
import { disconnectGoogle, startGoogleConnect } from '../utils/googleSync';
import { useGoogleSyncStatus } from '../utils/useGoogleSyncStatus';
import { AppLogo } from './AppLogo';
import { GlossyBox } from './GlossyBox';
import {useStoredEvents} from '../utils/useStoredEvents';

export type NavKey = 'calendar' | 'assistant' | 'rules' | 'alerts';

export const NAV_ITEMS: { key: NavKey; label: string; icon: string }[] = [
  { key: 'calendar', label: '나의 캘린더', icon: '▦' },
  { key: 'assistant', label: '일정 비서', icon: '✦' },
  { key: 'rules', label: '나의 규칙', icon: '≡' },
  { key: 'alerts', label: '알림함', icon: '◷' },
];

export function Sidebar({
  active,
  onSelect,
  compact,
}: {
  active: NavKey;
  onSelect: (key: NavKey) => void;
  compact: boolean;
}) {
  const googleStatus = useGoogleSyncStatus();
  const alertCount=useStoredEvents().filter(e=>!e.cancelledAt).length;

  const handleDisconnect = async () => {
    await disconnectGoogle();
    window.location.reload();
  };

  return (
    <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
      <View>
        <View style={[styles.brand, compact && styles.brandCompact]}>
          <AppLogo size={34} />
          {!compact && (
            <View>
              <Text style={styles.brandText}>kkuk</Text>
              <Text style={styles.brandSubtitle}>가볍게 말하고, 꾹.</Text>
            </View>
          )}
        </View>

        <View style={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const selected = item.key === active;
            const content = (
              <>
                <Text style={[styles.navIcon, selected && styles.navTextActive]}>{item.icon}</Text>
                {!compact && (
                  <Text style={[styles.navLabel, selected && styles.navTextActive]}>{item.label}{item.key==='alerts'?` ${alertCount}`:''}</Text>
                )}
              </>
            );
            return (
              <Pressable accessibilityRole="button" accessibilityLabel={item.label} key={item.key} onPress={() => onSelect(item.key)}>
                {selected ? (
                  <GlossyBox
                    colors={['#cf8f71', '#b56d52']}
                    shadowColor="#ac7041"
                    borderRadius={12}
                    contentStyle={[
                      styles.navItemContent,
                      compact && styles.navItemContentCompact,
                    ]}
                  >
                    {content}
                  </GlossyBox>
                ) : (
                  <View style={[styles.navItemContent, compact && styles.navItemContentCompact]}>
                    {content}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={googleStatus.connected ? undefined : startGoogleConnect}
        style={[styles.googleRow, compact && styles.googleRowCompact]}
      >
        <View style={styles.googleIcon}>
          <Text style={styles.googleIconText}>G</Text>
        </View>
        {!compact && (
          <View style={styles.googleTextGroup}>
            <Text style={styles.googleTitle}>Google Calendar</Text>
            <Text style={styles.googleSubtitle}>
              {googleStatus.connected ? (
                <>
                  {`연동됨 · ${googleStatus.email} · `}
                  <Text onPress={handleDisconnect} style={styles.googleDisconnectLink}>
                    다시 눌러서 취소
                  </Text>
                </>
              ) : (
                '미연결 · 눌러서 연동'
              )}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 200,
    backgroundColor: colors.lightBeige,
    paddingVertical: 24,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
  },
  sidebarCompact: {
    width: 64,
    paddingHorizontal: 8,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
    paddingHorizontal: 6,
  },
  brandCompact: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textDark,
  },
  brandSubtitle: {
    fontSize: 11,
    color: colors.warmGray,
    marginTop: 1,
  },
  nav: {
    gap: 4,
  },
  navItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  navItemContentCompact: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  navIcon: {
    fontSize: 16,
    color: colors.warmGray,
    width: 18,
    textAlign: 'center',
  },
  navLabel: {
    fontSize: 14,
    color: colors.textDark,
    fontWeight: '500',
  },
  navTextActive: {
    color: colors.white,
  },
  googleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  googleRowCompact: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  googleIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconText: {
    fontWeight: '800',
    fontSize: 13,
    color: colors.textDark,
  },
  googleTextGroup: {
    flex: 1,
  },
  googleTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textDark,
  },
  googleSubtitle: {
    fontSize: 10,
    color: colors.warmGray,
    marginTop: 1,
  },
  googleDisconnectLink: {
    textDecorationLine: 'underline',
  },
});
