export type Category = 'exercise'|'work'|'personal'|'study'|'health';
export interface Recurrence {frequency:'daily'|'weekdays'|'weekly'|'monthly';days:number[];monthDay?:number;until:string}
export interface Schedule {id?:string;title:string;date:string;time:string;duration:number;category:Category;ambiguous?:boolean;location?:string;aliasTerm?:string;aliasMeaning?:string;seriesId?:string;recurrence?:Recurrence|null;cancelledAt?:string;defaultDuration?:boolean}
export interface Alias {term:string;meaning:string;location:string;category:Category}
export interface Rules {gap:number;exerciseEnd:number;weekendWork:boolean;auto:boolean;reminders:Record<Category,number>}
export const categories:Record<Category,string>;
export const initialRules:Rules;
export function restoreRules(value?:Partial<Rules>):Rules;
export function todayKST(now?:Date):string;
export function addDays(date:string,n:number):string;
export function stamp(date:string,time:string):number;
export function commonMeaning(text:string):{category:Category|null;location:string|null};
export function explicitActivity(text:string):Category|null;
export function normalizeChat(text:string,now?:Date):string;
export function interpretChat(text:string,aliases?:Alias[],now?:Date):{event:Schedule;matched:Alias|null;unknown:string|null};
export function applyAlias(event:Schedule,alias:Alias):Schedule;
export function hasCancelIntent(text:string):boolean;
export function findCancellation(text:string,events:Schedule[],now?:Date):{matches:Schedule[];scope:'one'|'following'|'all'};
export function cancellationTargets(events:Schedule[],target:Schedule,scope:'one'|'following'|'all'):Schedule[];
export function check(event:Schedule,events:Schedule[],rules:Rules,now?:number):{ok:boolean;reasons:{message:string}[]};
export function alternatives(event:Schedule,events:Schedule[],rules:Rules,now?:number):Schedule[];
export function planSeries(event:Schedule,events:Schedule[],rules:Rules,skipped?:string[],now?:number):{accepted:Schedule[];occurrences:Schedule[];conflicts:{event:Schedule;reasons:{message:string}[]}[];error:string|null};
