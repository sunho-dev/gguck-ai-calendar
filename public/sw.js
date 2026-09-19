self.addEventListener('push',event=>{
 let data;try{data=event.data.json();}catch{data={title:'꾹',body:'일정을 확인해 주세요.'};}
 event.waitUntil(self.registration.showNotification(data.title||'꾹',{body:data.body,tag:data.tag,data:{url:'/'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
 const existing=list.find(c=>new URL(c.url).origin===self.location.origin);return existing?existing.focus():clients.openWindow('/');
 }));
});
