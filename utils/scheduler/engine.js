import {commonMeaning} from './common-language.js';
import {policyReasons,validateRule} from './policy.js';
export const categories = {exercise:'운동',work:'업무',personal:'개인',study:'공부',health:'건강'};
export const initialRules = {gap:15, exerciseEnd:22, weekendWork:true, auto:true, reminders:{exercise:30,work:10,personal:60,study:10,health:60}};
export function restoreRules(saved={}){return {...initialRules,...saved,items:(saved.items||[]).flatMap(r=>{try{return [validateRule(r)];}catch{return [];}}),actions:saved.actions||{},reminders:{...initialRules.reminders,...saved.reminders}};}
export function todayKST(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function addDays(date,n){return new Date(Date.parse(date+'T12:00:00+09:00')+n*86400000).toISOString().slice(0,10);}
export function stamp(date,time){return Date.parse(`${date}T${time}:00+09:00`);}
export function clock(n){return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
export function timeOf(ms){return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(ms);}
export function dateLabel(date){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'}).format(new Date(date+'T12:00:00+09:00'));}
export function parseText(text,now=new Date()){
 const input=text.trim(); if(!input)throw Error('등록할 일정을 먼저 입력해 주세요.');
 if(/매주|매일|마다/.test(input))throw Error('반복 일정은 아직 지원하지 않아요. 날짜를 지정해 주세요.');
 const base=todayKST(now); let date='';
 if(input.includes('모레'))date=addDays(base,2);else if(input.includes('내일'))date=addDays(base,1);else if(input.includes('오늘'))date=base;
 const iso=input.match(/(\d{4}-\d{2}-\d{2})/);if(iso){date=iso[1];const d=new Date(date+'T12:00:00+09:00');if(isNaN(+d)||todayKST(d)!==date)throw Error('날짜를 확인해 주세요.');}
 const tm=input.match(/(?:(오전|오후|아침|저녁|밤)\s*)?(\d{1,2})(?:시(?!간)(?:\s*(\d{1,2})분|\s*(반))?|:(\d{2}))/);
 if(!date||!tm)throw Error('오늘·내일·모레 또는 YYYY-MM-DD와 시간을 함께 적어 주세요. 예: 내일 오후 8시 운동');
 let hour=Number(tm[2]), minute=Number(tm[3]||tm[5]||(tm[4]?30:0));
 if(hour>23||minute>59||(tm[1]&&(hour<1||hour>12)))throw Error('올바른 시간을 입력해 주세요.');
 const ambiguous=!tm[1]&&hour>=1&&hour<=12;
 if(tm[1])hour=hour%12+(/오후|저녁|밤/.test(tm[1])?12:0);
 const dur=input.match(/(\d+)\s*시간\s*(?:동안|운동|공부|회의|일정|$)/);const dm=input.match(/(\d+)분\s*동안/);
 const duration=dur?Number(dur[1])*60:dm?Number(dm[1]):60;
 if(duration<15||duration>480)throw Error('소요 시간은 15분~8시간 범위로 입력해 주세요.');
 const category=/운동|헬스|러닝|수영|요가/.test(input)?'exercise':/회의|업무|미팅|출근/.test(input)?'work':/공부|독서|학습|수업/.test(input)?'study':'personal';
 let title=input.replace(/\d{4}-\d{2}-\d{2}|오늘|내일|모레/g,'').replace(tm[0],'').replace(/\d+\s*시간\s*(동안)?|\d+분\s*동안/g,'').replace(/일정|등록해줘|등록|추가해줘/g,'').trim();
 const general=commonMeaning(title);
 return {title:title||categories[category],date,time:clock(hour*60+minute),duration,category:general.category||category,...(general.location?{location:general.location,interpretationSource:'common_vocabulary'}:{}),ambiguous,defaultDuration:!dur&&!dm};
}
export function check(event,events,rules,now=Date.now()){
 const start=stamp(event.date,event.time),end=start+Number(event.duration)*60000;
 const reasons=[];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(event.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time)||!Number.isFinite(start)||!Number.isFinite(end)||todayKST(new Date(start))!==event.date||event.duration<(event.imported?1:15)||event.duration>(event.imported?527040:480))return {ok:false,reasons:[{type:'invalid',message:'날짜와 소요 시간을 확인해 주세요.',overridable:false,action:'block'}]};
 if(start<=now&&!event.imported)reasons.push({type:'past',message:'이미 지난 시간에는 등록할 수 없어요.'});
 for(const e of events){if(e.cancelledAt||(event.id&&e.id===event.id))continue;const s=stamp(e.date,e.time),t=s+e.duration*60000;const gap=rules.gap*60000;
 if(start<t&&end>s)reasons.push({type:'overlap',message:`‘${e.title}’ (${e.time}–${timeOf(t)})과 겹쳐요.`,event:e});
 else if(start<t+gap&&end>s-gap)reasons.push({type:'gap',message:`‘${e.title}’ 앞뒤로 ${rules.gap}분의 여유가 필요해요.`,event:e});}
 if(event.category==='exercise' && (end>stamp(event.date,clock(rules.exerciseEnd*60))||start<stamp(event.date,'06:00')))reasons.push({type:'category',message:`운동은 오전 6시부터 ${rules.exerciseEnd}시 안에 마치도록 설정했어요.`});
 const day=new Date(event.date+'T12:00:00+09:00').getUTCDay();
 if(event.category==='work'&&rules.weekendWork&&(day===0||day===6))reasons.push({type:'weekend',message:'주말에는 업무 일정을 등록하지 않는 규칙이 있어요.'});
 const combined=[...reasons.map(r=>({...r,ruleId:'base:'+r.type,action:['past','invalid'].includes(r.type)?'block':rules.actions?.[r.type]||'suggest',overridable:!['past','invalid'].includes(r.type)})),...policyReasons(event,events,rules.items)];
 const active=combined.filter(r=>!r.overridable||!(event.ruleExceptions||[]).includes(r.ruleId));
 return {ok:!active.some(r=>r.action!=='warn'),reasons:active,warnings:active.filter(r=>r.action==='warn')};
}
export function alternatives(event,events,rules,now=Date.now()){
 if(!Number.isFinite(stamp(event.date,event.time)))return [];
 const slots=[];const original=stamp(event.date,event.time);
 for(let d=0;d<14;d++)for(let minute=6*60;minute+event.duration<=22*60;minute+=15){const candidate={...event,ruleExceptions:[],date:addDays(event.date,d),time:clock(minute),ambiguous:false};if(stamp(candidate.date,candidate.time)===original)continue;if(check(candidate,events,rules,now).reasons.length===0)slots.push(candidate);}
 return slots.sort((a,b)=>Math.abs(stamp(a.date,a.time)-original)-Math.abs(stamp(b.date,b.time)-original)).slice(0,3);
}
export function seedEvents(base=todayKST()) {return [
 {id:'demo1',title:'팀 데일리 미팅',date:addDays(base,1),time:'10:00',duration:60,category:'work'},
 {id:'demo2',title:'친구와 저녁 약속',date:addDays(base,1),time:'19:30',duration:90,category:'personal'},
 {id:'demo3',title:'프로젝트 집중 작업',date:base,time:'14:00',duration:120,category:'work'}];}
