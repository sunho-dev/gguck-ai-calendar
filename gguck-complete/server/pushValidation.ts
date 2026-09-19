import type {PushJob} from '../utils/reminderPlan';
export function validateSubscription(s:any){
 if(!s||typeof s.endpoint!=='string')throw Error('구독 정보가 필요해요.');
 const u=new URL(s.endpoint);
 // Never let arbitrary client URLs become server-side fetch targets.
 const allowed=u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.notify.windows.com')||u.hostname==='web.push.apple.com';
 if(u.protocol!=='https:'||u.port||u.username||u.password||!allowed)throw Error('지원하지 않는 푸시 서버예요.');
 if(!/^[A-Za-z0-9_-]{80,100}$/.test(s.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{20,30}$/.test(s.keys?.auth||''))throw Error('구독 키를 확인해 주세요.');
 return {endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
export function validateJobs(input:unknown,now=Date.now()):PushJob[]{
 if(!Array.isArray(input)||input.length>500)throw Error('한 기기에서 최대 500개 알림을 예약할 수 있어요.');
 const seen=new Set();return input.map((j:any)=>{
  if(!j||typeof j.id!=='string'||j.id.length>200||seen.has(j.id)||!Number.isFinite(j.at)||!Number.isFinite(j.expires)||j.expires<=j.at||j.expires>now+367*86400000||typeof j.title!=='string'||j.title.length>200||typeof j.body!=='string'||j.body.length>300)throw Error('알림 내용을 확인해 주세요.');
  seen.add(j.id);return {id:j.id,at:j.at,expires:j.expires,title:j.title,body:j.body};
 }).filter(j=>j.expires>now);
}
