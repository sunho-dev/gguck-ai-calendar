import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';

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
  return (
    <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
      <View style={[styles.brand, compact && styles.brandCompact]}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>꾹</Text>
        </View>
        {!compact && <Text style={styles.brandText}>kkuk</Text>}
      </View>

      <View style={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const selected = item.key === active;
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              style={[styles.navItem, compact && styles.navItemCompact, selected && styles.navItemActive]}
            >
              <Text style={[styles.navIcon, selected && styles.navTextActive]}>{item.icon}</Text>
              {!compact && (
                <Text style={[styles.navLabel, selected && styles.navTextActive]}>{item.label}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 200,
    backgroundColor: colors.lightBeige,
    paddingVertical: 24,
    paddingHorizontal: 14,
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
  logo: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textDark,
  },
  nav: {
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  navItemCompact: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: colors.terracotta,
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
});
