import {parseText,todayKST,addDays,stamp,check} from './engine.js';
export const repeatNames={none:'반복 없음',daily:'매일',weekdays:'평일',weekly:'매주',monthly:'매월'};
export const weekday=d=>new Date(d+'T12:00:00+09:00').getUTCDay();
export function parseSchedule(text,now=new Date()){
 let clean=text,frequency='none',days=[],monthDay;
 if(/격주|격월|매년|매\s*\d+\s*(일|주|개월)|마다/.test(text))throw Error('이 반복 표현은 아직 지원하지 않아요. 매일·평일·매주·매월로 입력해 주세요.');
 const weekly=text.match(/매주\s*((?:[월화수목금토일](?:요일)?[\s,·]*)+)/);
 const monthly=text.match(/매[월달]\s*(\d{1,2})일/);
 if(/매일/.test(text)){frequency='daily';clean=clean.replace(/매일/g,'');}
 else if(/평일/.test(text)){frequency='weekdays';clean=clean.replace(/평일/g,'');days=[1,2,3,4,5];}
 else if(/매주/.test(text)){frequency='weekly';if(weekly){days=[...new Set(weekly[1].replace(/요일/g,'').match(/[일월화수목금토]/g))].map(x=>'일월화수목금토'.indexOf(x));clean=clean.replace(weekly[0],'');}else clean=clean.replace('매주','');}
 else if(/매월|매달/.test(text)){frequency='monthly';if(monthly){monthDay=+monthly[1];if(monthDay<1||monthDay>31)throw Error('반복 날짜는 1~31일로 입력해 주세요.');clean=clean.replace(monthly[0],'');}else clean=clean.replace(/매월|매달/,'');}
 const explicit=/오늘|내일|모레|\d{4}-\d{2}-\d{2}/.test(clean);
 if(frequency!=='none'&&!explicit)clean='내일 '+clean;
 const event=parseText(clean,now);
 if(frequency==='weekly'&&!days.length)days=[weekday(event.date)];
 if(frequency==='monthly'&&!monthDay)monthDay=+event.date.slice(-2);
 return {...event,recurrence:frequency==='none'?null:{frequency,days,monthDay,until:addDays(event.date,27)}};
}
function validDate(d){const n=Date.parse(d+'T12:00:00+09:00');return /^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(n)&&todayKST(new Date(n))===d;}
export function expandSeries(event){
 const r=event.recurrence;if(!r)return [event];
 if(!validDate(event.date)||!validDate(r.until)||r.until<event.date)throw Error('종료일은 시작일 이후로 선택해 주세요.');
 if(r.until>addDays(event.date,365))throw Error('프로토타입에서는 시작일부터 최대 1년까지 등록할 수 있어요.');
 if(!['daily','weekdays','weekly','monthly'].includes(r.frequency))throw Error('반복 방식을 선택해 주세요.');
 if(r.frequency==='weekly'&&(!r.days?.length||r.days.some(x=>!Number.isInteger(x)||x<0||x>6)))throw Error('반복할 요일을 하나 이상 선택해 주세요.');
 if(r.frequency==='monthly'&&(!Number.isInteger(r.monthDay)||r.monthDay<1||r.monthDay>31))throw Error('매월 반복 날짜를 확인해 주세요.');
 const out=[];
 for(let d=event.date;d<=r.until;d=addDays(d,1)){
 const w=weekday(d);if(r.frequency==='daily'||(r.frequency==='weekdays'&&w>=1&&w<=5)||(r.frequency==='weekly'&&r.days.includes(w))||(r.frequency==='monthly'&&+d.slice(-2)===r.monthDay))out.push({...event,date:d});
 }
 if(!out.length)throw Error('선택한 기간에 해당하는 반복 날짜가 없어요. 종료일을 늘려 주세요.');
 return out;
}
export function planSeries(event,events,rules,skipped=[],now=Date.now()){
 try{const occurrences=expandSeries(event),accepted=[],conflicts=[];
 for(const e of occurrences){if(skipped.includes(e.date))continue;const verdict=check(e,[...events.filter(x=>!x.cancelledAt),...accepted],rules,now);if(verdict.ok)accepted.push(e);else conflicts.push({event:e,reasons:verdict.reasons});}
 return {occurrences,accepted,conflicts,error:null};
 }catch(e){return {occurrences:[],accepted:[],conflicts:[],error:e.message};}
}
export function cancellationTargets(events,target,scope){
 if(!['one','following','all'].includes(scope))throw Error('취소 범위가 올바르지 않아요.');
 const current=events.find(e=>e.id===target.id&&!e.cancelledAt);if(!current)return [];
 return events.filter(e=>!e.cancelledAt&&(scope==='one'||!current.seriesId?e.id===current.id:e.seriesId===current.seriesId&&(scope==='all'||stamp(e.date,e.time)>=stamp(current.date,current.time))));
}
export function cancelEvents(events,target,scope,at=new Date().toISOString()){
 const ids=new Set(cancellationTargets(events,target,scope).map(e=>e.id));return events.map(e=>ids.has(e.id)?{...e,cancelledAt:at}:e);
}
