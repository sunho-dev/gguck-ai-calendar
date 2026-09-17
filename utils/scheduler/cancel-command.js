import {todayKST,addDays,stamp,clock} from './engine.js';
export const hasCancelIntent=text=>/취소/.test(text);
export function findCancellation(text,events,now=new Date()){
 if(!/취소(?:\s*(?:해\s*줘|해\s*주세요|해|할래|해주세요|해줘))?[.!。]?\s*$/.test(text)||/취소\s*(?:하지|안|말|하지마)|취소.*(?:말아|아니)/.test(text))throw Error('취소 요청을 확인하지 못했어요. “내일 운동 취소”처럼 입력해 주세요. 아무 일정도 바꾸지 않았어요.');
 let q=text.trim().replace(/취소(?:\s*(?:해\s*줘|해\s*주세요|해|할래|해주세요|해줘))?[.!。]?\s*$/,'').trim();
 const scope=/전체|전부|모두/.test(q)?'all':/이후|앞으로/.test(q)?'following':'one';
 q=q.replace(/전체|전부|모두|이후|앞으로|반복|이번만|이번/g,'');
 let date=null;const dateTokens=q.match(/\d{4}-\d{2}-\d{2}|오늘|내일|모레/g)||[];
 if(dateTokens.length>1)throw Error('취소할 날짜는 하나만 입력해 주세요.');
 if(dateTokens.length){const t=dateTokens[0];date=t==='오늘'?todayKST(now):t==='내일'?addDays(todayKST(now),1):t==='모레'?addDays(todayKST(now),2):t;const ms=stamp(date,'12:00');if(!Number.isFinite(ms)||todayKST(new Date(ms))!==date)throw Error('취소할 날짜를 확인해 주세요.');q=q.replace(t,'');}
 const tm=q.match(/(?:(오전|오후|아침|저녁|밤)\s*)?(\d{1,2})(?:시(?!간)(?:\s*(\d{1,2})분|\s*(반))?|:(\d{2}))/);
 let times=null;
 if(tm){const h=+tm[2],m=+(tm[3]||tm[5]||(tm[4]?30:0));if(h>23||m>59||(tm[1]&&(h<1||h>12)))throw Error('취소할 시간을 확인해 주세요.');
 times=tm[1]?[clock((h%12+(/오후|저녁|밤/.test(tm[1])?12:0))*60+m)]:h>=1&&h<=12?[clock(h%12*60+m),clock((h%12+12)*60+m)]:[clock(h*60+m)];q=q.replace(tm[0],'');}
 q=q.replace(/일정(?:을|은|만)?/g,'').trim().replace(/(?:을|를)\s*$/,'').replace(/\s+/g,'').toLowerCase();
 if(!q&&!date&&!times)throw Error('무엇을 취소할까요? “내일 운동 취소”처럼 날짜나 일정 이름을 함께 적어 주세요.');
 const matches=events.filter(e=>!e.cancelledAt&&(date?e.date===date:stamp(e.date,e.time)>=+now)&&(!times||times.includes(e.time))&&(!q||[e.title,e.aliasTerm||'',e.location||''].some(v=>v.replace(/\s+/g,'').toLowerCase().includes(q)))).sort((a,b)=>stamp(a.date,a.time)-stamp(b.date,b.time));
 return {matches,scope,query:q,date,times};
}
