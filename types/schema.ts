export type ISODate = string // "2026-09-17"
export type ISOTime = string // "19:00"
export type ISODateTime = string // "2026-09-17T19:00:00+09:00"

export interface Event {
  id: string
  userId: string
  title: string
  category: string
  startDate: ISODate
  endDate: ISODate // 기간 일정 지원 (단일 일정이면 startDate와 동일)
  time: ISOTime
  durationMin: number
  place: { name: string; address: string; lat: number; lng: number } | null // 장소 없는 일정도 있어서 nullable
  remindMin: number
  bufferMin: number
  createdFrom: 'share' | 'paste' | 'text' | 'voice'
  sharedWith: string[]
  googleEventId?: string // 구글 캘린더 자동 동기화로 만들어진 이벤트일 때만 존재
}

/**
 * 규칙의 종류/타입별 params 세부 구조는 김창민이 확정 중 (규칙 타입 목록 확정, check() 함수).
 * 여기서는 다른 엔티티들이 참조할 수 있는 최소 뼈대만 정의한다.
 */
export interface Rule {
  id: string
  userId: string
  text: string // 원문 보존: 사용자에게 자기 말로 보여주기 + 오역 시 재해석 위해
  kind: 'check' | 'auto' | 'trigger'
  type: string // 확정되면 RuleType 유니온으로 좁힐 예정 (김창민)
  params: Record<string, unknown> // 확정되면 type별 params 유니온으로 좁힐 예정 (김창민)
  severity: 'block' | 'warn' | 'auto'
  enabled: boolean
}

export interface ShiftCode {
  userId: string
  code: string // "D" | "E" | "N" 등, 사용자가 자유롭게 정의
  label: string
  start: ISOTime
  end: ISOTime
  crossesMidnight: boolean
}

export interface ShiftAssignment {
  userId: string
  date: ISODate
  code: string
  source: 'photo' | 'manual'
}

/**
 * 사용자가 텍스트로 쓰는 개인/그룹 은어 장소 이름을 실제 장소로 매핑.
 * "AI 해석 API"가 모르는 장소를 만나면 사용자에게 확인받아 여기에 쌓인다.
 */
export interface PlaceAlias {
  userId: string
  alias: string // 사용자가 쓰는 원문 표현, 예: "종숲"
  name: string // 실제 장소명, 예: "서울숲클라이밍 종로점"
  address: string | null
  createdAt: ISODateTime
}

export interface Reminder {
  id: string
  eventId: string
  fireAt: ISODateTime
  sent: boolean
}

export interface Share {
  token: string
  ownerId: string
  rangeStart: ISODate
  rangeEnd: ISODate
  expiresAt: ISODateTime
  scope: 'freeBusy' // 제목·장소는 절대 포함하지 않음
}

/**
 * 회원가입 없이 기기에서 생성되는 익명 사용자.
 * 이 id가 곧 위 모든 테이블의 userId. googleAccount는 연동 전까지 null이며,
 * null이어도 앱의 모든 기능이 정상 동작해야 한다 (구글 연동은 항상 선택 사항).
 */
export interface User {
  id: string
  createdAt: ISODateTime
  googleAccount: GoogleAccount | null
}

/**
 * OAuth로 실제 계정을 연결했을 때만 생성됨 (기본 경로인 "링크 방식" 내보내기는
 * event 필드만으로 URL을 만들 수 있어 이 엔티티가 필요 없음).
 * scope를 이벤트 단위로 좁혀서 구글의 민감 범위 심사를 피한다.
 * accessToken/refreshToken은 서버에만 저장하고 클라이언트로 내려주지 않는다.
 */
export interface GoogleAccount {
  userId: string
  googleUserId: string
  email: string
  accessToken: string
  refreshToken: string
  expiresAt: ISODateTime
  scope: 'https://www.googleapis.com/auth/calendar.events'
  connectedCalendarId: string // 기본값 "primary"
  syncEnabled: boolean
  connectedAt: ISODateTime
  lastSyncedAt: ISODateTime | null
}
