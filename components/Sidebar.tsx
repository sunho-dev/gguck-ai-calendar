import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';
import { disconnectGoogle, startGoogleConnect } from '../utils/googleSync';
import { useGoogleSyncStatus } from '../utils/useGoogleSyncStatus';
import { AppLogo } from './AppLogo';
import { GlossyBox } from './GlossyBox';
import {useStoredEvents} from '../utils/useStoredEvents';

// 구글 OAuth 검수는 개인정보처리방침이 서비스와 같은 도메인에 있어야 해서(구글 사이트 도구 등
// 소유권을 인증할 수 없는 외부 플랫폼은 거절됨) public/privacy.html, public/terms.html을
// 이 앱과 같은 도메인에서 서빙한다. 웹에서는 상대 경로, 네이티브에서는 배포 주소로 연다.
const SITE_ORIGIN = Platform.OS === 'web' ? '' : 'https://gguck-flame.vercel.app';
const PRIVACY_POLICY_URL = `${SITE_ORIGIN}/privacy`;
const TERMS_OF_SERVICE_URL = `${SITE_ORIGIN}/terms`;

export type NavKey = 'calendar' | 'categories' | 'assistant' | 'rules' | 'alerts';

export const NAV_ITEMS: { key: NavKey; label: string; icon: string }[] = [
  { key: 'calendar', label: '나의 캘린더', icon: '▦' },
  { key: 'categories', label: '내 카테고리', icon: '●' },
  { key: 'assistant', label: '일정 비서', icon: '✦' },
  { key: 'rules', label: '나의 규칙', icon: '≡' },
  { key: 'alerts', label: '알림함', icon: '◷' },
];

// 유니코드 기호(▦)는 바둑판 무늬로 보여서, 실제 달력처럼 보이도록 테두리+상단 헤더 띠+
// 날짜 점 3개로 직접 그린다. Text 기반 아이콘과 달리 선택 시 색이 하얗게 바뀌어야 해서
// color를 prop으로 받아 View 스타일에 직접 꽂는다.
function CalendarNavIcon({ color }: { color: string }) {
  return (
    <View style={[styles.calendarIcon, { borderColor: color }]}>
      <View style={[styles.calendarIconHeader, { backgroundColor: color }]} />
      <View style={styles.calendarIconDots}>
        <View style={[styles.calendarIconDot, { backgroundColor: color }]} />
        <View style={[styles.calendarIconDot, { backgroundColor: color }]} />
        <View style={[styles.calendarIconDot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

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

  if (compact) {
    const mobileLabels: Record<NavKey, string> = {
      calendar: '캘린더',
      categories: '카테고리',
      assistant: '비서',
      rules: '규칙',
      alerts: '알림',
    };

    return (
      <View style={styles.bottomNavWrap}>
        <View style={styles.mobileUtilityRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={googleStatus.connected ? 'Google 연동 해제' : 'Google 캘린더 연동'}
            onPress={() => void (googleStatus.connected ? handleDisconnect() : startGoogleConnect())}
            style={styles.mobileGoogleChip}
          >
            <View style={styles.mobileGoogleIcon}>
              <Text style={styles.mobileGoogleIconText}>G</Text>
            </View>
            <Text style={styles.mobileGoogleText} numberOfLines={1}>
              {googleStatus.connected ? '연동됨 · 눌러서 해제' : 'Google 연동'}
            </Text>
          </Pressable>
          <View style={styles.mobileLegalGroup}>
            <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
              <Text style={styles.legalLink}>개인정보처리방침</Text>
            </Pressable>
            <Text style={styles.legalDivider}>·</Text>
            <Pressable onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}>
              <Text style={styles.legalLink}>이용약관</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.bottomNav}>
          {NAV_ITEMS.map((item) => {
            const selected = item.key === active;
            const iconColor = selected ? colors.terracotta : colors.warmGray;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.label}
                key={item.key}
                onPress={() => onSelect(item.key)}
                style={[styles.bottomNavItem, selected && styles.bottomNavItemActive]}
              >
                {item.key === 'calendar' ? (
                  <CalendarNavIcon color={iconColor} />
                ) : (
                  <Text style={[styles.bottomNavIcon, selected && styles.bottomNavTextActive]}>
                    {item.icon}
                  </Text>
                )}
                <Text style={[styles.bottomNavLabel, selected && styles.bottomNavTextActive]}>
                  {mobileLabels[item.key]}
                  {item.key === 'alerts' && alertCount > 0 ? ` ${alertCount}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
      <View>
        <View style={[styles.brand, compact && styles.brandCompact]}>
          <AppLogo size={34} />
          {!compact && (
            <View>
              <Text style={styles.brandText}>kkuk</Text>
              <Text style={styles.brandSubtitle}>꾹 눌러서 빠르게, 간편하게</Text>
            </View>
          )}
        </View>

        <View style={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const selected = item.key === active;
            const content = (
              <>
                {item.key === 'calendar' ? (
                  <View style={styles.navIconWrapper}>
                    <CalendarNavIcon color={selected ? colors.white : colors.warmGray} />
                  </View>
                ) : (
                  <Text style={[styles.navIcon, selected && styles.navTextActive]}>{item.icon}</Text>
                )}
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
          {compact && (
            <Text style={styles.googleCompactStatus} numberOfLines={1}>
              {googleStatus.connected ? '연동됨' : '미연결'}
            </Text>
          )}
        </Pressable>
      </View>

      <View style={[styles.legalRow, compact && styles.legalRowCompact]}>
        <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
          <Text style={styles.legalLink}>{compact ? '방침' : '개인정보처리방침'}</Text>
        </Pressable>
        {!compact && <Text style={styles.legalDivider}>·</Text>}
        <Pressable onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}>
          <Text style={styles.legalLink}>{compact ? '약관' : '이용약관'}</Text>
        </Pressable>
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
    fontSize: 21,
    color: colors.warmGray,
    width: 24,
    textAlign: 'center',
  },
  navIconWrapper: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarIcon: {
    width: 19,
    height: 19,
    borderWidth: 1.6,
    borderRadius: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 3,
  },
  calendarIconHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },
  calendarIconDots: {
    flexDirection: 'row',
    gap: 2,
  },
  calendarIconDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
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
    marginTop: 12,
  },
  googleRowCompact: {
    flexDirection: 'column',
    justifyContent: 'center',
    paddingHorizontal: 0,
    gap: 3,
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
  googleCompactStatus: {
    fontSize: 9,
    color: colors.warmGray,
    textAlign: 'center',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  legalRowCompact: {
    gap: 4,
  },
  legalLink: {
    fontSize: 10,
    color: colors.warmGray,
    textDecorationLine: 'underline',
  },
  legalDivider: {
    fontSize: 10,
    color: colors.warmGray,
  },
  bottomNavWrap: {
    width: '100%',
  },
  mobileUtilityRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.lightBeige,
  },
  mobileGoogleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    maxWidth: '55%',
  },
  mobileGoogleIcon: {
    width: 18,
    height: 18,
    borderRadius: 6,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mobileGoogleIconText: {
    fontWeight: '800',
    fontSize: 9,
    color: colors.textDark,
  },
  mobileGoogleText: {
    fontSize: 10,
    color: colors.warmGray,
    flexShrink: 1,
  },
  mobileLegalGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bottomNav: {
    width: '100%',
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.lightBeige,
    borderTopWidth: 1,
    borderTopColor: '#E5D8CB',
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 6,
  },
  bottomNavItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 12,
    paddingVertical: 5,
  },
  bottomNavItemActive: {
    backgroundColor: '#F3E3D7',
  },
  bottomNavIcon: {
    fontSize: 19,
    color: colors.warmGray,
    lineHeight: 22,
  },
  bottomNavLabel: {
    fontSize: 10,
    color: colors.warmGray,
    fontWeight: '600',
  },
  bottomNavTextActive: {
    color: colors.terracotta,
    fontWeight: '800',
  },
});
