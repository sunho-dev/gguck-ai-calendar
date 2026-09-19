// General vocabulary describes a place type, never a verified address.
const places = [
 ['본가','personal'],['우리 집','personal'],['우리집','personal'],['집','personal'],
 ['병원','health'],['치과','health'],['안과','health'],['약국','health'],
 ['회사','work'],['사무실','work'],['학교','study'],['도서관','study'],
 ['헬스장','exercise'],['클라이밍장','exercise'],['수영장','exercise'],
 ['카페','personal'],['식당','personal'],['공원','personal']
];
const boundary = name => new RegExp('(^|\\s)'+name+'(?=$|\\s|에서|으로|에(?:\\s|$)|로(?:\\s|$))');
export function explicitActivity(text){
 const activities = [
  ['work',/회의|업무|미팅|출근|근무/],
  ['study',/공부|독서|학습|수업/],
  ['exercise',/운동|헬스|러닝|수영|요가|클라이밍|산책/],
  ['health',/진료|진찰|건강검진|검진|예방접종|치료/],
  ['personal',/약속|식사|점심|저녁|방문|친구|가족/]
 ];
 return activities.find(([,pattern])=>pattern.test(text))?.[0]||null;
}
export function commonMeaning(title){
 const found=places.find(([name])=>boundary(name).test(title));
 if(!found)return {category:explicitActivity(title),location:null};
 const [location,fallback]=found;
 const activity=explicitActivity(title.replace(boundary(location),' '));
 return {location,category:activity||fallback};
}
