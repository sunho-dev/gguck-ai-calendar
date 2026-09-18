import type {VercelRequest,VercelResponse} from '@vercel/node';
import {Redis} from '@upstash/redis';
import webpush from 'web-push';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {validateJobs,validateSubscription} from '../server/pushValidation';
import type {PushJob} from '../utils/reminderPlan';
type Device={subscription:ReturnType<typeof validateSubscription>;jobs:PushJob[]};
export const maxDuration=60;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const equal=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 const action=req.query.action,configured=!!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT&&process.env.KV_REST_API_URL&&process.env.KV_REST_API_TOKEN);
 if(action==='config'&&req.method==='GET')return res.json({configured,publicKey:configured?process.env.VAPID_PUBLIC_KEY:null});
 if(!configured)return res.status(503).json({error:'서버 푸시 설정이 아직 준비되지 않았어요.'});
 const redis=new Redis({url:process.env.KV_REST_API_URL!,token:process.env.KV_REST_API_TOKEN!});
 webpush.setVapidDetails(process.env.VAPID_SUBJECT!,process.env.VAPID_PUBLIC_KEY!,process.env.VAPID_PRIVATE_KEY!);
 if(action==='cron'){
  if(req.method!=='GET')return res.status(405).end();
  if(!process.env.CRON_SECRET||!equal(req.headers.authorization||'','Bearer '+process.env.CRON_SECRET))return res.status(401).end();
  let sent=0,failed=0;
  const ids=await redis.zrange<string[]>('push:due',0,Date.now(),{byScore:true,offset:0,count:5});
  for(const id of ids){
   const lock=randomBytes(16).toString('hex');if(!await redis.set('push:lock:'+id,lock,{nx:true,ex:120}))continue;
   try{
    const device=await redis.get<Device>('push:device:'+id);if(!device){await redis.zrem('push:due',id);continue;}
    const now=Date.now(),keep:PushJob[]=[];let attempts=0;
    for(const job of device.jobs){
     if(job.expires<=now)continue;if(job.at>now){keep.push(job);continue;}
     const dedupe='push:sent:'+hash(id+job.id);
     if(await redis.exists(dedupe))continue;
     if(attempts>=5){keep.push(job);continue;}attempts++;
     try{await webpush.sendNotification(device.subscription,JSON.stringify({title:job.title,body:job.body,tag:hash(job.id),url:'/'}),{TTL:Math.min(3600,Math.max(1,Math.floor((job.expires-now)/1000))),timeout:1500});await redis.set(dedupe,'1',{ex:368*86400});sent++;}
     catch(e:any){if(e.statusCode===404||e.statusCode===410){device.jobs=[];keep.length=0;await redis.del('push:device:'+id);break;}keep.push(job);failed++;}
    }
    if(await redis.exists('push:device:'+id)){await redis.set('push:device:'+id,{...device,jobs:keep},{ex:370*86400});}
    if(keep.length)await redis.zadd('push:due',{score:Math.min(...keep.map(j=>j.at)),member:id});else await redis.zrem('push:due',id);
   }finally{await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) end return 0",['push:lock:'+id],[lock]);}
  }return res.json({sent,failed});
 }
 if(req.method!=='POST')return res.status(405).end();
 // Browser requests must be same-origin. Capability tokens isolate each device.
 if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return res.status(403).end();
 const ip=req.headers['x-forwarded-for']?.toString().split(',')[0]||'unknown',rateKey='push:rate:'+hash(ip)+':'+Math.floor(Date.now()/60000);
 if(await redis.incr(rateKey)>60)return res.status(429).json({error:'잠시 후 다시 시도해 주세요.'});await redis.expire(rateKey,120);
 try{
  if(action==='register'){
   const subscription=validateSubscription(req.body?.subscription),token=randomBytes(32).toString('hex'),id=hash(token);
   await redis.set('push:device:'+id,{subscription,jobs:[]},{ex:370*86400});return res.json({token});
  }
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token))return res.status(401).end();
  const id=hash(token),lock=randomBytes(16).toString('hex');
  if(!await redis.set('push:lock:'+id,lock,{nx:true,ex:120}))return res.status(409).json({error:'알림 갱신 중이에요. 곧 다시 시도해 주세요.'});
  try{
   const device=await redis.get<Device>('push:device:'+id);if(!device)return res.status(401).json({error:'이 기기의 알림을 다시 연결해 주세요.'});
   if(action==='disable'){await redis.del('push:device:'+id);await redis.zrem('push:due',id);return res.json({ok:true});}
   if(action==='sync'){
    const jobs=validateJobs(req.body?.jobs);await redis.set('push:device:'+id,{...device,jobs},{ex:370*86400});
    if(jobs.length)await redis.zadd('push:due',{score:Math.min(...jobs.map(j=>j.at)),member:id});else await redis.zrem('push:due',id);
    return res.json({ok:true,count:jobs.length});
   }
   if(action==='test'){await webpush.sendNotification(device.subscription,JSON.stringify({title:'꾹 알림 연결 완료',body:'이 기기로 알림을 보낼 수 있어요.',tag:'gguck-test',url:'/'}),{TTL:60,timeout:10000});return res.json({ok:true});}
   return res.status(400).end();
  }finally{await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) end return 0",['push:lock:'+id],[lock]);}
 }catch{return res.status(400).json({error:'알림 요청을 처리하지 못했어요. 구독 정보와 서버 설정을 확인해 주세요.'});}
}
