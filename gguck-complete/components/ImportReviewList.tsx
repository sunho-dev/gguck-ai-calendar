import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';
import type { ImportedEventDraft } from '../utils/icsImport';

const PAGE_SIZE = 15;

// .ics/엑셀/사진 근무표 가져오기가 공통으로 쓰는 "가져올 일정 미리보기 + 선택" 화면.
// 바로 전부 등록하지 않고 한 번 확인받는 이유: OCR/엑셀 해석은 틀릴 수 있어서
// 사용자가 잘못 뽑힌 항목을 빼고 등록할 수 있어야 한다.
export function ImportReviewList({
  title,
  drafts,
  onConfirm,
  onCancel,
}: {
  title: string;
  drafts: ImportedEventDraft[];
  onConfirm: (selected: ImportedEventDraft[]) => void;
  onCancel: () => void;
}) {
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);

  const toggle = (index: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectedCount = drafts.length - excluded.size;
  const totalPages = Math.max(1, Math.ceil(drafts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const pageDrafts = drafts.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>
        총 {drafts.length}개 중 {selectedCount}개 선택됨 · 잘못 인식된 항목은 체크 해제하세요
      </Text>

      <View>
        {pageDrafts.map((draft, localIndex) => {
          const index = pageStart + localIndex;
          const isExcluded = excluded.has(index);
          return (
            <Pressable
              key={index}
              onPress={() => toggle(index)}
              style={[styles.row, isExcluded && styles.rowExcluded]}
            >
              <View style={[styles.checkbox, !isExcluded && styles.checkboxChecked]}>
                {!isExcluded && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, isExcluded && styles.rowTextExcluded]}>{draft.title}</Text>
                <Text style={[styles.rowMeta, isExcluded && styles.rowTextExcluded]}>
                  {draft.startDate} {draft.time} · {draft.durationMin}분
                  {draft.place ? ` · ${draft.place.name}` : ''}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {totalPages > 1 ? (
        <View style={styles.pagination}>
          <Pressable
            onPress={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            style={[styles.pageButton, currentPage === 0 && styles.pageButtonDisabled]}
          >
            <Text style={styles.pageButtonText}>‹ 이전</Text>
          </Pressable>
          <Text style={styles.pageIndicator}>
            {currentPage + 1} / {totalPages} 페이지
          </Text>
          <Pressable
            onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            style={[styles.pageButton, currentPage === totalPages - 1 && styles.pageButtonDisabled]}
          >
            <Text style={styles.pageButtonText}>다음 ›</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        <Pressable onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>취소</Text>
        </Pressable>
        <Pressable
          onPress={() => onConfirm(drafts.filter((_, index) => !excluded.has(index)))}
          disabled={selectedCount === 0}
          style={[styles.confirmButton, selectedCount === 0 && styles.confirmButtonDisabled]}
        >
          <Text style={styles.confirmButtonText}>{selectedCount}개 일정 등록</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: colors.warmGray,
    marginBottom: 14,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.lightBeige,
  },
  pageButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.lightBeige,
  },
  pageButtonDisabled: {
    opacity: 0.4,
  },
  pageButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textDark,
  },
  pageIndicator: {
    fontSize: 12,
    color: colors.warmGray,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  rowExcluded: {
    opacity: 0.5,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.warmGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.terracotta,
    borderColor: colors.terracotta,
  },
  checkboxMark: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.warmGray,
    marginTop: 2,
  },
  rowTextExcluded: {
    textDecorationLine: 'line-through',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.lightBeige,
  },
  cancelButtonText: {
    color: colors.textDark,
    fontSize: 13,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.terracotta,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.4,
  },
  confirmButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
});
