import {buildReminderPlan} from './reminderPlan';
import {loadStoredEvents} from './eventsStorage';
const KEY='gguck-push-token';
export const pushEnabled=()=>typeof window!=='undefined'&&!!localStorage.getItem(KEY);
export async function pushRequest(action:string,body:unknown={}){
 const response=await fetch('/api/push?action='+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(localStorage.getItem(KEY)||'')},body:JSON.stringify(body)});
 if(!response.ok)throw Object.assign(Error('알림 서버 연결 실패 ('+response.status+'). 알림함에서 다시 연결해 주세요.'),{status:response.status});return response.json();
}
export async function syncPush(){if(pushEnabled())return pushRequest('sync',{jobs:buildReminderPlan(loadStoredEvents()||[])});}
export async function enablePush(){
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('이 브라우저는 웹 푸시를 지원하지 않아요. 지원 브라우저 또는 설치된 웹앱에서 열어 주세요.');
 if(await Notification.requestPermission()!=='granted')throw Error('브라우저 설정에서 알림을 허용해 주세요.');
 const config=await (await fetch('/api/push?action=config')).json();if(!config.configured)throw Error('서버 알림 설정이 필요해요. PUSH_SETUP.md를 확인해 주세요.');
 await navigator.serviceWorker.register('/sw.js');const registration=await navigator.serviceWorker.ready;
 const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 if(pushEnabled()){try{await syncPush();}catch(e){if((e as {status?:number}).status===401)localStorage.removeItem(KEY);else throw e;}}
 if(!pushEnabled()){const result=await pushRequest('register',{subscription:subscription.toJSON()});localStorage.setItem(KEY,result.token);}
 await syncPush();await pushRequest('test');
}
export async function disablePush(){try{await pushRequest('disable');}catch(e){if((e as {status?:number}).status!==401)throw e;}localStorage.removeItem(KEY);const registration=await navigator.serviceWorker.getRegistration();await (await registration?.pushManager.getSubscription())?.unsubscribe();}
