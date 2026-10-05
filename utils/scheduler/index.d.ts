export type Category = 'exercise' | 'work' | 'personal' | 'study' | 'health';
export interface Recurrence {
  frequency: 'daily' | 'weekdays' | 'weekly' | 'monthly';
  days: number[];
  monthDay?: number;
  until: string;
}
export interface Schedule {
  id?: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  category: Category;
  ambiguous?: boolean;
  location?: string;
  aliasTerm?: string;
  aliasMeaning?: string;
  seriesId?: string;
  recurrence?: Recurrence | null;
  cancelledAt?: string;
  defaultDuration?: boolean;
  ruleExceptions?: string[];
  imported?: boolean;
}
export interface Alias {
  term: string;
  meaning: string;
  location: string;
  category: Category;
}
export type RuleAction = 'warn' | 'confirm' | 'suggest';
export interface PersonalRule {
  id: string;
  text: string;
  type: 'rest' | 'weeklyLimit' | 'timeBlock' | 'weekdayBlock' | 'reminder' | 'auto';
  category: Category | 'all';
  keyword: string;
  action: RuleAction;
  enabled: boolean;
  params: {
    days?: number | number[];
    weekdays?: number[];
    count?: number;
    from?: number;
    to?: number;
    minutes?: number;
    message?: string;
  };
}
export interface Reason {
  type: string;
  ruleId?: string;
  message: string;
  action?: RuleAction | 'block';
  overridable?: boolean;
}
export interface Rules {
  gap: number;
  exerciseEnd: number;
  weekendWork: boolean;
  auto: boolean;
  reminders: Record<Category, number>;
  items?: PersonalRule[];
  actions?: Record<string, RuleAction>;
}
export const actionLabels: Record<RuleAction, string>;
export function validateRule(input: unknown): PersonalRule;
export function parseRule(text: string): PersonalRule;
export function assertPermanentRule(text: string): void;
export const PERIOD_RULE_MESSAGE: string;
export function describeRule(rule: PersonalRule): string;
export function matchesRule(event: Schedule, rule: PersonalRule): boolean;
export function reminderFor(event: Schedule, rules: Rules): { minutes: number; message: string };
export const categories: Record<Category, string>;
export const initialRules: Rules;
export function restoreRules(value?: Partial<Rules>): Rules;
export function todayKST(now?: Date): string;
export function addDays(date: string, n: number): string;
export function stamp(date: string, time: string): number;
export function commonMeaning(text: string): { category: Category | null; location: string | null };
export function explicitActivity(text: string): Category | null;
export function normalizeChat(text: string, now?: Date): string;
export function interpretChat(
  text: string,
  aliases?: Alias[],
  now?: Date,
): { event: Schedule; matched: Alias | null; unknown: string | null };
export function applyAlias(event: Schedule, alias: Alias): Schedule;
export function hasCancelIntent(text: string): boolean;
export interface CancelQuery {
  query?: string;
  category?: Category | null;
  date?: string | null;
  month?: string | null;
  times?: string[] | null;
  scope?: 'one' | 'following' | 'all';
}
export interface CancelResult {
  matches: Schedule[];
  scope: 'one' | 'following' | 'all';
  query: string;
  date: string | null;
  month: string | null;
  times: string[] | null;
  category: Category | null;
}
export function parseCancelText(text: string, now?: Date): CancelQuery;
export function matchCancellation(
  parsed: CancelQuery,
  events: Schedule[],
  now?: Date,
): CancelResult;
export function findCancellation(text: string, events: Schedule[], now?: Date): CancelResult;
export function cancellationTargets(
  events: Schedule[],
  target: Schedule,
  scope: 'one' | 'following' | 'all',
): Schedule[];
export function check(
  event: Schedule,
  events: Schedule[],
  rules: Rules,
  now?: number,
): { ok: boolean; reasons: Reason[]; warnings?: Reason[] };
export function alternatives(
  event: Schedule,
  events: Schedule[],
  rules: Rules,
  now?: number,
): Schedule[];
export function planSeries(
  event: Schedule,
  events: Schedule[],
  rules: Rules,
  skipped?: string[],
  now?: number,
): {
  accepted: Schedule[];
  occurrences: Schedule[];
  conflicts: { event: Schedule; reasons: Reason[] }[];
  error: string | null;
};
