import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as XLSX from 'xlsx';
import {useRef,useState} from 'react';
import {ActivityIndicator,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View,Switch,useWindowDimensions} from 'react-native';
import {AgendaPreview} from '../components/AgendaPreview';
import DateTimeField from '../components/DateTimeField';
import {ColorDropdown} from '../components/ColorDropdown';
import {RuleAwareImportReview} from '../components/RuleAwareImportReview';
import {Choice,RepeatChoices,RepeatFields,recurrenceFor,type RepeatMode} from '../components/ScheduleControls';
import {useScheduleStaging} from '../utils/useScheduleStaging';
import {colors} from '../constants/colors';
import type {Event} from '../types/schema';
import {interpretEvent} from '../utils/interpretEvent';
import {getPlaceAliases,savePlaceAlias} from '../utils/placeAliasStore';
import {loadStoredEvents,saveStoredEvents} from '../utils/eventsStorage';
import {getGoogleSyncStatus,syncEventCreate,syncEventDelete} from '../utils/googleSync';
import {categoryKey,loadRules,toEvent,toSchedule} from '../utils/scheduleAdapter';
import {applyAlias,interpretChat,normalizeChat,hasCancelIntent,findCancellation,cancellationTargets,check,alternatives,planSeries,categories,addDays,stamp,todayKST,matchesRule,reminderFor,type Schedule,type Category} from '../utils/scheduler';
import {generateEventId} from '../utils/quickEntry';
import {parseIcsContent,type ImportedEventDraft} from '../utils/icsImport';
import {interpretBulkImage,interpretBulkTable} from '../utils/bulkInterpret';
import {loadMyName,saveMyName} from '../utils/myNameStorage';
import {classifyShift} from '../utils/shiftClassify';
import {SHIFT_TYPES,loadShiftColors,saveShiftColors,type ShiftColorMap} from '../utils/shiftColorStore';

type Scope='one'|'following'|'all';
export function AssistantScreen({initialText='',onRules=()=>{},onCalendar=()=>{}}:{initialText?:string;onRules?:()=>void;onCalendar?:()=>void}){
 const [repeatMode,setRepeatMode]=useState<RepeatMode>('none'),[selectedDate,setSelectedDate]=useState(todayKST());
 const [failure,setFailure]=useState('');
 const wide=useWindowDimensions().width>=1100;
 const [text,setText]=useState(initialText),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [draft,setDraft]=useState<Schedule|null>(null),[unknown,setUnknown]=useState<string|null>(null);
 const [name,setName]=useState(''),[address,setAddress]=useState(''),[category,setCategory]=useState<Category>('personal'),[remember,setRemember]=useState(true);
 const [issues,setIssues]=useState<string[]>([]),[choices,setChoices]=useState<Schedule[]>([]),[skipped,setSkipped]=useState<string[]>([]);
 const [cancelChoices,setCancelChoices]=useState<Schedule[]>([]),[target,setTarget]=useState<Schedule|null>(null),[scope,setScope]=useState<Scope>('one');
 const [importDrafts,setImportDrafts]=useState<ImportedEventDraft[]|null>(null),[importSource,setImportSource]=useState<string|null>(null);
 const [importError,setImportError]=useState<string|null>(null),[isImporting,setIsImporting]=useState(false),[myName,setMyName]=useState(()=>loadMyName());
 const [shiftColors,setShiftColors]=useState<ShiftColorMap>(()=>loadShiftColors());
 const handleShiftColorChange=(type:typeof SHIFT_TYPES[number],hex:string)=>{
  const next={...shiftColors,[type]:hex};
  setShiftColors(next);
  saveShiftColors(next);
 };
 const lock=useRef(false);
 const all=()=>loadStoredEvents()||[];
 const handleMyNameChange=(value:string)=>{setMyName(value);saveMyName(value);};
 const handleImportIcs=async()=>{
  setImportError(null);
  const picked=await DocumentPicker.getDocumentAsync({type:'*/*'});
  if(picked.canceled)return;
  const asset=picked.assets[0];
  try{
   const content=asset.file?await asset.file.text():await(await fetch(asset.uri)).text();
   const drafts=parseIcsContent(content);
   if(drafts.length===0){setImportError('.ics 파일에서 일정을 찾지 못했어요.');return;}
   setImportSource('.ics 파일에서 찾은 일정');setImportDrafts(drafts);
  }catch(err){console.warn('[ics-import] 실패:',err);setImportError('.ics 파일을 읽는 데 실패했어요.');}
 };
 const handleImportExcel=async()=>{
  setImportError(null);
  const picked=await DocumentPicker.getDocumentAsync({type:'*/*'});
  if(picked.canceled)return;
  const asset=picked.assets[0];
  try{
   let csvText:string;
   if(asset.name.toLowerCase().endsWith('.csv')){
    csvText=asset.file?await asset.file.text():await(await fetch(asset.uri)).text();
   }else{
    const buffer=asset.file?await asset.file.arrayBuffer():await(await fetch(asset.uri)).arrayBuffer();
    const workbook=XLSX.read(buffer,{type:'array'});
    csvText=XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
   }
   setIsImporting(true);
   const drafts=await interpretBulkTable(csvText,myName);
   setIsImporting(false);
   if(drafts.length===0){setImportError('파일에서 일정을 찾지 못했어요.');return;}
   setImportSource('엑셀 파일에서 찾은 일정');setImportDrafts(drafts);
  }catch(err){setIsImporting(false);console.warn('[excel-import] 실패:',err);setImportError(err instanceof Error?err.message:'엑셀 파일을 처리하는 데 실패했어요.');}
 };
 const handleImportPhoto=async()=>{
  setImportError(null);
  const picked=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:1});
  if(picked.canceled)return;
  const asset=picked.assets[0];
  try{
   setIsImporting(true);
   const maxDimension=1600,isLandscape=asset.width>=asset.height;
   const resizeAction=isLandscape?{resize:{width:Math.min(asset.width,maxDimension)}}:{resize:{height:Math.min(asset.height,maxDimension)}};
   const manipulated=await manipulateAsync(asset.uri,[resizeAction],{base64:true,compress:.7,format:SaveFormat.JPEG});
   if(!manipulated.base64){setImportError('이미지를 처리하지 못했어요.');setIsImporting(false);return;}
   const drafts=await interpretBulkImage(manipulated.base64,'image/jpeg',myName);
   setIsImporting(false);
   if(drafts.length===0){setImportError('사진에서 일정을 찾지 못했어요.');return;}
   setImportSource('사진에서 찾은 일정');setImportDrafts(drafts);
  }catch(err){setIsImporting(false);console.warn('[photo-import] 실패:',err);setImportError(err instanceof Error?err.message:'사진을 처리하는 데 실패했어요.');}
 };
 const handleConfirmImport=async(approved:Event[])=>{
  const created:Event[]=approved.map(e=>({...e,shiftType:classifyShift(e.title)??undefined}));
  saveStoredEvents([...all(),...created]);
  setImportDrafts(null);
  setNotice(`가져온 일정 ${created.length}개를 등록했어요.`);
  if(created[0])setSelectedDate(created[0].startDate);

  const status=await getGoogleSyncStatus();
  if(!status.connected)return;
  let synced=0;
  for(const e of created){const id=await syncEventCreate(e);if(id){synced++;saveStoredEvents(all().map(x=>x.id===e.id?{...x,googleEventId:id}:x));}}
  setNotice(`로컬 ${created.length}개 등록 · Google ${synced}개 반영${synced<created.length?' · 일부 동기화 실패: Google 캘린더를 확인해 주세요.':''}`);
 };
 useScheduleStaging(async({text:input})=>{
  if(lock.current||draft||target||cancelChoices.length)throw Error('현재 확인 중인 요청을 먼저 마쳐 주세요.');
  if(typeof input!=='string'||!input.trim()||input.length>300||hasCancelIntent(input))throw Error('300자 이내의 등록 검토 문장을 입력해 주세요. 취소는 입력창에서 요청해 주세요.');
  const aliases=(await getPlaceAliases()).map(a=>({term:a.alias,meaning:a.name,location:a.address||a.name,category:categoryKey(a.category||'personal')}));
  const result=interpretChat(input,aliases);
  setText(input);setDraft(result.event);setSelectedDate(result.event.date);setIssues([]);setSkipped([]);setFailure('');
  if(result.unknown){setUnknown(result.unknown);setName('');setAddress('');setCategory(result.event.category);setRemember(true);}
  return {status:result.unknown?'clarification_required':'staged',draft:result.event};
 });
 const close=()=>{if(lock.current)return;setDraft(null);setUnknown(null);setTarget(null);setCancelChoices([]);setIssues([]);setChoices([]);setSkipped([]);setFailure('');};
 async function guarded(job:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setFailure('');try{await job();}catch(e){setFailure(e instanceof Error?e.message:'처리하지 못했어요.');}finally{lock.current=false;setBusy(false);}}
 async function persist(schedules:Schedule[]){
  const rules=loadRules(),seriesId=schedules[0]?.recurrence?`series-${Date.now()}`:undefined;
  const previous=all().map(toSchedule);const warningMessages=new Set<string>();
  for(const s of schedules){check(s,previous,rules).warnings?.forEach(r=>warningMessages.add(r.message));previous.push(s);}
  const warningText=warningMessages.size?' · 참고: '+[...warningMessages].join(' / '):'';
  const created=schedules.map(s=>toEvent({...s,seriesId},rules));
  saveStoredEvents([...all(),...created]);
  setSelectedDate(created[0].startDate);
  setDraft(null);setIssues([]);setChoices([]);setSkipped([]);setText('');
  setNotice(`‘${created[0].title}’ ${created.length}개 등록 완료 · ${created[0].startDate} ${created[0].time} · 알림 ${created[0].remindMin}분 전${warningText}`);
  const status=await getGoogleSyncStatus();if(!status.connected)return;
  let synced=0;
  for(const e of created){const id=await syncEventCreate(e);if(id){synced++;saveStoredEvents(all().map(x=>x.id===e.id?{...x,googleEventId:id}:x));}}
  setNotice(`로컬 ${created.length}개 등록 · Google ${synced}개 반영${synced<created.length?' · 일부 동기화 실패: Google 캘린더를 확인해 주세요.':''}${warningText}`);
 }
 async function proceed(s:Schedule,confirmed=false,skip:string[]=skipped){
  setChoices([]);setIssues([]);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)||!s.title.trim()||!Number.isFinite(s.duration)||s.duration<15||s.duration>480||!Number.isFinite(stamp(s.date,s.time))||todayKST(new Date(stamp(s.date,s.time)))!==s.date){setDraft(s);setIssues(['날짜·시간·제목과 소요 시간(15~480분)을 확인해 주세요.']);return;}
  if(s.ambiguous){setDraft(s);return;}
  const events=all().map(toSchedule),rules=loadRules();
  if(s.recurrence){
   const plan=planSeries(s,events,rules,skip);
   if(!confirmed||plan.error||plan.conflicts.length||!plan.accepted.length){setDraft(s);setIssues(plan.error?[plan.error]:plan.conflicts.map(c=>`${c.event.date}: ${c.reasons.map(r=>r.message).join(' ')}`));return;}
   await persist(plan.accepted);return;
  }
  const verdict=check(s,events,rules);
  if(!verdict.ok){setDraft(s);setIssues(verdict.reasons.map(r=>r.message));setChoices(alternatives(s,events,rules));return;}
  if(!confirmed&&!rules.auto&&!(rules.items||[]).some(r=>r.type==='auto'&&matchesRule(s,r))){setDraft(s);return;}
  await persist([s]);
 }
 async function cancel(t:Schedule,range:Scope){
  const selected=new Set(cancellationTargets(all().map(toSchedule),t,range).map(e=>e.id));
  const entries=all().filter(e=>selected.has(e.id));let done=0;
  for(const entry of entries){
   // Do not report a Google deletion as successful if the request failed.
   if(entry.googleEventId)await syncEventDelete(entry);
   saveStoredEvents(all().map(e=>e.id===entry.id?{...e,cancelledAt:new Date().toISOString()}:e));done++;
  }
  setNotice(`${done}개 일정 취소 완료`);setTarget(null);setCancelChoices([]);setText('');
  setSelectedDate(t.date);
 }
 async function submit(){await guarded(async()=>{
  setNotice('');setSkipped([]);setIssues([]);setChoices([]);
  if(hasCancelIntent(text)){
   const r=findCancellation(normalizeChat(text),all().map(toSchedule));setScope(r.scope);
   if(!r.matches.length)throw Error('일치하는 일정이 없어요.');
   if(r.matches.length===1&&!r.matches[0].seriesId){await cancel(r.matches[0],'one');return;}
   if(r.matches.length===1)setTarget(r.matches[0]);else setCancelChoices(r.matches);return;
  }
  const aliases=(await getPlaceAliases()).map(a=>({term:a.alias,meaning:a.name,location:a.address||a.name,category:categoryKey(a.category||'personal')}));
  let event:Schedule,unrecognized:string|null=null,needsReview=false;
  try{const r=interpretChat(text,aliases);event=r.event;unrecognized=r.unknown;setNotice('기본 문장 규칙으로 해석했어요.');}
  catch(localError){
   if(/매주|매일|매월|평일|매달|격주|마다/.test(text))throw localError;
   const ai=await interpretEvent({text});
   if(ai.endDate!==ai.startDate)throw Error('기간 일정은 캘린더에서 확인해 주세요. 일정 비서는 하루 일정과 반복 일정을 지원합니다.');
   event={title:ai.title,date:ai.startDate,time:ai.time||'',duration:ai.durationMin??60,category:categoryKey(ai.category),location:ai.place?.name,ambiguous:ai.ambiguousFields.includes('time')};
   unrecognized=ai.placeAliasCandidate;needsReview=ai.ambiguousFields.some(f=>f!=='place')||!ai.time;
   setNotice('Gemini로 해석했어요.');
  }
  if(!event.recurrence&&repeatMode!=='none')event={...event,recurrence:recurrenceFor(repeatMode,event.date)};
  if(/^\d{4}-\d{2}-\d{2}$/.test(event.date))setSelectedDate(event.date);
  if(unrecognized){setDraft(event);setUnknown(unrecognized);setName('');setAddress('');setCategory(event.category);setRemember(true);return;}
  if(needsReview){setDraft(event);setIssues(['AI가 불확실하게 해석한 정보가 있어요. 아래 값을 확인해 주세요.']);return;}
  await proceed(event,false,[]);
 });}
 const field=(label:string,value:string,change:(s:string)=>void)=><View><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} value={value} onChangeText={change} editable={!busy}/></View>;
 const button=(label:string,onPress:()=>void,secondary=false,disabled=false)=><Pressable accessibilityRole="button" disabled={busy||disabled} onPress={onPress} style={[styles.button,secondary&&styles.secondary,(busy||disabled)&&{opacity:.5}]}><Text style={{color:secondary?colors.textDark:colors.white}}>{label}</Text></Pressable>;
 const patch=(p:Partial<Schedule>)=>{if(draft){setDraft({...draft,ruleExceptions:[],...p});setChoices([]);setIssues([]);setSkipped([]);}};
 const recurrencePlan=draft?.recurrence?planSeries(draft,all().map(toSchedule),loadRules(),skipped):null;
 const liveVerdict=draft&&!draft.recurrence&&!draft.ambiguous?check(draft,all().map(toSchedule),loadRules()):null;
 const liveChoices=draft&&liveVerdict&&!liveVerdict.ok?alternatives(draft,all().map(toSchedule),loadRules()):[];
 const exceptionReasons=recurrencePlan?recurrencePlan.conflicts.flatMap(c=>c.reasons):(liveVerdict?.reasons||[]).filter(r=>r.action!=='warn');
 const canExcept=exceptionReasons.length>0&&exceptionReasons.every(r=>r.overridable&&r.ruleId);
 async function acceptExceptions(){if(!draft||!canExcept)return;await guarded(()=>proceed({...draft,ruleExceptions:[...new Set([...(draft.ruleExceptions||[]),...exceptionReasons.map(r=>r.ruleId!)])]},true));}
 return <ScrollView style={styles.page} contentContainerStyle={{paddingBottom:40}}><Text style={styles.heading}>일정은 꾹에게 맡겨요.</Text><Text style={styles.label}>한 줄로 남기면, 시간과 규칙을 함께 살펴볼게요.</Text>
 <View style={[styles.columns,wide&&{flexDirection:'row'}]}><View style={{flex:wide?1.35:undefined,minWidth:0}}><View style={styles.panel}><Text style={styles.sectionTitle}>어떤 일정이 있나요?</Text>
 <TextInput accessibilityLabel="일정 문장" multiline style={[styles.input,{minHeight:120,fontSize:19}]} value={text} onChangeText={setText} placeholder="내일 오후 8시 집에서 운동" editable={!busy}/>
 {!hasCancelIntent(text)&&<><Text style={styles.label}>반복 방식</Text><RepeatChoices value={repeatMode} onChange={setRepeatMode} disabled={busy}/><Text style={styles.label}>문장에 적은 반복 조건이 우선해요.</Text></>}
 {button(busy?'처리 중…':hasCancelIntent(text)?'요청 보내기':'일정 등록',()=>void submit())}
 <Text style={styles.label}>확인이 필요할 때만 물어봐요. 소요 시간 생략 시 60분.</Text>
 <Text style={styles.sectionTitle}>이렇게 말해보세요</Text><View style={styles.row}>{['내일 오후 8시 운동','매주 월수금 오후 8시 운동','다음주 금요일 8시 종숲 ㄱ','내일 운동 취소'].map(example=><Choice key={example} label={example} disabled={busy} onPress={()=>{setText(example);setRepeatMode('none');}}/>)}</View></View>
 {Platform.OS==='web'&&<View style={[styles.panel,styles.importPanel]}><Text style={styles.sectionTitle}>여러 일정 한 번에 가져오기</Text><Text style={styles.label}>.ics 파일, 근무표 엑셀, 근무표 사진에서 일정을 한 번에 뽑아 등록해요.</Text>
 {field('표/사진 속 내 이름',myName,handleMyNameChange)}
 {!importDrafts&&<View style={styles.row}>{button('.ics 가져오기',()=>void handleImportIcs(),true,isImporting)}{button('엑셀 가져오기',()=>void handleImportExcel(),true,isImporting)}{button('사진으로 가져오기',()=>void handleImportPhoto(),true,isImporting)}</View>}
 {isImporting&&<View style={styles.row}><ActivityIndicator color={colors.terracotta}/><Text style={styles.label}>AI가 일정을 읽는 중…</Text></View>}
 {!!importError&&<Text style={styles.notice}>{importError}</Text>}
 {importDrafts&&<View style={styles.shiftColorPanel}>
 <Text style={styles.label}>근무 유형별 색을 정해두면 캘린더에서 한눈에 구분돼요.</Text>
 {SHIFT_TYPES.map(type=><View key={type} style={styles.shiftColorRow}><Text style={styles.shiftColorLabel}>{type}</Text><ColorDropdown value={shiftColors[type]} onChange={hex=>handleShiftColorChange(type,hex)}/></View>)}
 </View>}
 {importDrafts&&<RuleAwareImportReview title={importSource??'가져온 일정'} drafts={importDrafts} onConfirm={handleConfirmImport} onCancel={()=>setImportDrafts(null)}/>}
 </View>}
 <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>
 <View style={styles.panel}><Text style={styles.sectionTitle}>말 한마디가 일정이 되는 순간.</Text><Text style={styles.label}>등록도 취소도 한 문장으로. 일정은 이 브라우저에 저장돼요.</Text></View></View>
 <View style={{flex:wide?1:undefined,minWidth:0}}><AgendaPreview date={selectedDate} onDate={setSelectedDate} onRules={onRules} onCalendar={onCalendar}/></View></View>
 <Modal visible={!!draft||!!target||cancelChoices.length>0||!!failure} transparent animationType="fade" onRequestClose={close}>
 <View style={styles.overlay}><ScrollView style={styles.modal} contentContainerStyle={{padding:22}}><Text style={styles.heading}>꾹이 확인할게요</Text>
 {!!unknown&&draft?<>
 <Text>‘{unknown}’은 무슨 뜻인가요? 알고 있는 일반 장소의 주소는 묻지 않아요.</Text>
 {field('뜻 / 장소 이름',name,setName)}{field('주소·지점 설명 (선택)',address,setAddress)}
 <View style={styles.row}>{Object.entries(categories).map(([key,label])=><View key={key}>{button((category===key?'✓ ':'')+label,()=>setCategory(key as Category),true)}</View>)}</View>
 <View style={styles.row}><Switch value={remember} onValueChange={setRemember} disabled={busy}/><Text>이 뜻을 다음부터 기억하기</Text></View>
 {button('이 뜻으로 계속하기',()=>void guarded(async()=>{if(!name.trim())throw Error('뜻이나 장소 이름을 적어 주세요.');const value={term:unknown,meaning:name.trim(),location:address.trim()||name.trim(),category};if(remember)await savePlaceAlias({alias:unknown,name:value.meaning,address:address.trim()||null,category});setUnknown(null);await proceed(applyAlias(draft,value));}))}
 {button('원문 그대로 계속',()=>{setUnknown(null);void guarded(()=>proceed(draft));},true)}
 </>:draft?<>
 <Text style={styles.sectionTitle}>{draft.ambiguous?'오전일까요, 오후일까요?':draft.recurrence?'언제까지 함께할까요?':liveVerdict&&!liveVerdict.ok?'이 시간은 조정이 필요해요.':'일정 확인'}</Text>
 <Text style={styles.label}>{draft.title} · {draft.duration}분 · {categories[draft.category]} · 알림 {reminderFor(draft,loadRules()).minutes}분 전</Text>
 {field('제목',draft.title,title=>patch({title}))}<Text style={styles.label}>{draft.recurrence?'반복 시작일':'날짜'}</Text><DateTimeField label="일정 날짜" kind="date" value={draft.date} onChange={date=>patch({date})} disabled={busy}/><Text style={styles.label}>시간 (24시간제)</Text><DateTimeField label="일정 시간" kind="time" value={draft.time} onChange={time=>patch({time,ambiguous:false})} disabled={busy}/>
 {draft.ambiguous&&<View style={styles.row}>{[0,12].map(n=><View key={n}>{button((n?'오후':'오전')+(draft.recurrence?' 선택':'로 등록'),()=>{const resolved={...draft,time:String(Number(draft.time.slice(0,2))%12+n).padStart(2,'0')+draft.time.slice(2),ambiguous:false};if(draft.recurrence)patch(resolved);else void guarded(()=>proceed(resolved));},true)}</View>)}</View>}
 {field('소요 시간 (분)',String(draft.duration),v=>patch({duration:Number(v)}))}
 <Text>장소: {draft.location||'없음'} · 기본 소요 시간 60분</Text>
 <View style={styles.row}>{Object.entries(categories).map(([key,label])=><View key={key}>{button((draft.category===key?'✓ ':'')+label,()=>patch({category:key as Category}),true)}</View>)}</View>
 <RepeatFields draft={draft} onChange={patch} disabled={busy}/>
 {draft.recurrence&&<><Text style={styles.label}>반복 종료일 (포함) · 최대 1년</Text><DateTimeField label="반복 종료일" kind="date" value={draft.recurrence.until} onChange={until=>patch({recurrence:{...draft.recurrence!,until}})} disabled={busy}/><Text style={styles.label}>전체 {recurrencePlan?.occurrences.length}회 · 등록 가능 {recurrencePlan?.accepted.length}회 · 확인 필요 {recurrencePlan?.conflicts.length}회 · 건너뛰기 {skipped.length}회</Text>
 {recurrencePlan?.error&&<Text style={styles.notice}>{recurrencePlan.error}</Text>}
 {recurrencePlan?.conflicts.map(c=><View key={c.event.date}><Text>{c.event.date}: {c.reasons.map(r=>r.message).join(' ')}</Text>{button('이 날짜 건너뛰기',()=>setSkipped([...skipped,c.event.date]),true)}</View>)}
 {skipped.map(date=><View key={date}>{button(`${date} 다시 포함`,()=>setSkipped(skipped.filter(d=>d!==date)),true)}</View>)}</>}
 {issues.map((message,i)=><Text key={i} style={styles.notice}>{message}</Text>)}
 {liveVerdict&&!liveVerdict.ok&&liveVerdict.reasons.map((r,i)=><Text key={i} style={styles.notice}>{r.message}</Text>)}
 {liveChoices.map(c=><View key={c.date+c.time}>{button(`${c.date} ${c.time}로 등록`,()=>void guarded(()=>proceed(c,true)),true)}</View>)}
 {draft&&!draft.recurrence&&liveVerdict&&!liveVerdict.ok&&!liveChoices.length&&<Text style={styles.notice}>앞으로 14일 안에 모든 규칙을 만족하는 시간이 없어요. 규칙을 수정하거나 이번만 예외로 등록할 수 있어요.</Text>}
 {canExcept&&button(draft.recurrence?'표시된 반복 회차의 규칙 위반을 허용하고 등록':'이번만 예외로 등록',()=>void acceptExceptions(),true,!!draft.ambiguous)}
 {button(draft.recurrence?`${recurrencePlan?.accepted.length||0}회 반복 일정 등록`:'확인하고 등록',()=>void guarded(()=>proceed(draft,true)),false,!!draft.ambiguous||!draft.title.trim()||!!(recurrencePlan&&(recurrencePlan.error||recurrencePlan.conflicts.length||!recurrencePlan.accepted.length))||!!(liveVerdict&&!liveVerdict.ok))}
 </>:target?<>
 <Text>{target.title} · {target.date} {target.time}</Text><Text>어느 범위를 취소할까요?</Text>
 {(['one','following','all'] as Scope[]).map((s,i)=><View key={s}>{button((scope===s?'✓ ':'')+['이번만','선택 회차 및 이후','전체 반복'][i],()=>setScope(s),true)}</View>)}
 {button(`${cancellationTargets(all().map(toSchedule),target,scope).length}개 취소 확인`,()=>void guarded(()=>cancel(target,scope)))}
 </>:cancelChoices.map(c=><View key={c.id}>{button(`${c.date} ${c.time} · ${c.title}`,()=>{if(c.seriesId){setCancelChoices([]);setTarget(c);}else void guarded(()=>cancel(c,'one'));},true)}</View>)}
 {button('닫기',close,true)}
 {!!failure&&<Text accessibilityRole="alert" style={styles.notice}>{failure}</Text>}
 <Text style={styles.notice}>{notice}</Text></ScrollView></View></Modal></ScrollView>;
}
const styles=StyleSheet.create({page:{width:'100%',maxWidth:1400,padding:24},columns:{gap:24},panel:{padding:24,backgroundColor:'#FFFAF4',borderRadius:18,borderWidth:1,borderColor:'#E5D8CB'},importPanel:{marginTop:18},shiftColorPanel:{backgroundColor:'#F6EEE4',borderRadius:12,padding:12,marginTop:10,marginBottom:10,gap:8},shiftColorRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},shiftColorLabel:{fontSize:13,fontWeight:'600',color:colors.textDark},sectionTitle:{fontSize:17,fontWeight:'600',color:colors.textDark,marginVertical:10},heading:{fontSize:30,fontWeight:'700',color:colors.textDark,marginBottom:12},label:{fontSize:13,color:colors.warmGray,marginVertical:8,lineHeight:21},input:{backgroundColor:'#F6EEE4',padding:14,borderRadius:12,color:colors.textDark,marginBottom:8},button:{backgroundColor:colors.terracotta,padding:12,borderRadius:10,marginVertical:5,alignItems:'center'},secondary:{backgroundColor:colors.lightBeige},row:{flexDirection:'row',gap:8,flexWrap:'wrap',alignItems:'center'},notice:{color:colors.terracotta,marginVertical:12,lineHeight:22},overlay:{flex:1,backgroundColor:'#0006',alignItems:'center',justifyContent:'center',padding:20},modal:{backgroundColor:colors.cream,borderRadius:20,width:'100%',maxWidth:560,maxHeight:'90%'}});
