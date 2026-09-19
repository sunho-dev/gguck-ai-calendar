import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, shiftColorPalette } from '../constants/colors';

// 옵션 목록을 절대 위치로 띄워서 카드 높이에 영향을 안 주게 한다(예전엔 내용을 밀어내는
// 방식이라 드롭다운을 펼 때마다 카드가 길어졌었음). 펼쳐졌을 때만 zIndex를 높여서
// 아래에 있는 다른 드롭다운 행 위로 확실히 겹쳐 보이게 한다.
export function ColorDropdown({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = shiftColorPalette.find((c) => c.value === value) ?? shiftColorPalette[0];

  return (
    <View style={[styles.container, open && styles.containerOpen]}>
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
  container: {
    position: 'relative',
  },
  containerOpen: {
    zIndex: 100,
  },
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
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    minWidth: 110,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.lightBeige,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
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
