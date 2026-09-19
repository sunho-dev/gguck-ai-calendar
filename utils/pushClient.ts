import {buildReminderPlan} from './reminderPlan';
import {loadStoredEvents} from './eventsStorage';
const KEY='gguck-push-token';
export const pushEnabled=()=>{try{return typeof window!=='undefined'&&!!localStorage.getItem(KEY);}catch{return false;}};
let queue:Promise<unknown>=Promise.resolve();
function serial<T>(task:()=>Promise<T>):Promise<T>{const next=queue.then(task,task);queue=next.catch(()=>{});return next;}
export async function pushRequest(action:string,body:unknown={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch('/api/push?action='+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(localStorage.getItem(KEY)||'')},body:JSON.stringify(body),signal:controller.signal});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(Error(data?.error||'알림 서버 연결 실패 ('+response.status+'). 알림함에서 다시 연결해 주세요.'),{status:response.status});
  return data;
 }catch(e){if(controller.signal.aborted)throw Error('알림 서버 응답이 늦어요. 잠시 후 다시 시도해 주세요.');throw e;}
 finally{clearTimeout(timer);}
}
export async function syncPush(){return serial(async()=>{if(pushEnabled())return pushRequest('sync',{jobs:buildReminderPlan(loadStoredEvents()||[])});});}
export async function testPush(){
 if(!pushEnabled())throw Error('전체 알림을 먼저 켜 주세요.');
 return serial(()=>pushRequest('test'));
}
export async function enablePush(sendTest=true){
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('이 브라우저는 웹 푸시를 지원하지 않아요. 지원 브라우저 또는 설치된 웹앱에서 열어 주세요.');
 if(await Notification.requestPermission()!=='granted')throw Error('브라우저 설정에서 알림을 허용해 주세요.');
 const response=await fetch('/api/push?action=config',{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('알림 서버 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
 const config=await response.json();if(!config.configured)throw Error('아직 서버 알림 설정이 완료되지 않았어요. 관리자에게 알려 주세요.');
 await navigator.serviceWorker.register('/sw.js');const registration=await navigator.serviceWorker.ready;
 const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 if(pushEnabled()){try{await serial(()=>pushRequest('subscription',{subscription:subscription.toJSON()}));}catch(e){if((e as {status?:number}).status===401)localStorage.removeItem(KEY);else throw e;}}
 if(!pushEnabled()){const result=await pushRequest('register',{subscription:subscription.toJSON()});localStorage.setItem(KEY,result.token);}
 await syncPush();if(sendTest)await testPush();
}
export async function disablePush(){return serial(async()=>{try{await pushRequest('disable');}catch(e){if((e as {status?:number}).status!==401)throw e;}localStorage.removeItem(KEY);const registration=await navigator.serviceWorker.getRegistration();await (await registration?.pushManager.getSubscription())?.unsubscribe();});}
