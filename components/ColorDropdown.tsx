import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, shiftColorPalette } from '../constants/colors';

// 드롭다운을 누르면 목록이 그 자리에서 펼쳐지는(내용을 밀어내는) 단순한 방식.
// 절대 위치 팝오버 대신 이렇게 만든 이유는 스크롤 카드 안에서 겹침/잘림 문제를 피하기 위함.
export function ColorDropdown({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = shiftColorPalette.find((c) => c.value === value) ?? shiftColorPalette[0];

  return (
    <View>
      <Pressable style={styles.trigger} onPress={() => setOpen((v) => !v)}>
        <View style={[styles.swatch, { backgroundColor: selected.value }]} />
        <Text style={styles.triggerText}>{selected.name}</Text>
        <Text style={styles.caret}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && (
        <View style={styles.optionList}>
          {shiftColorPalette.map((c) => (
            <Pressable
              key={c.value}
              style={styles.option}
              onPress={() => {
                onChange(c.value);
                setOpen(false);
              }}
            >
              <View style={[styles.swatch, { backgroundColor: c.value }]} />
              <Text style={styles.optionText}>{c.name}</Text>
              {c.value === value && <Text style={styles.checkMark}>✓</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.lightBeige,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  triggerText: {
    fontSize: 12,
    color: colors.textDark,
    fontWeight: '600',
  },
  caret: {
    fontSize: 10,
    color: colors.warmGray,
  },
  optionList: {
    marginTop: 4,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.lightBeige,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  optionText: {
    fontSize: 12,
    color: colors.textDark,
    flex: 1,
  },
  checkMark: {
    fontSize: 12,
    color: colors.terracotta,
    fontWeight: '700',
  },
});
