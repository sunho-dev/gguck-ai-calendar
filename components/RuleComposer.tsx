import {useRef,useState} from 'react';
import {Text,TextInput,View,Switch} from 'react-native';
import {Choice,controlStyles} from './ScheduleControls';
import {parseRule,validateRule,describeRule,actionLabels,type PersonalRule,type Rules,type RuleAction} from '../utils/scheduler';
import {interpretRuleInput} from '../utils/ruleInput';
import {useCategories} from '../utils/useCategories';
const examples=['운동 다음 날은 쉬기','운동 주 3회 이하','업무 오후 10시 이후는 알려줘','주말 업무는 확인해줘','스터디 30분 전 알림','운동 30분 전 알림 준비물: 운동복과 물','스터디 바로 등록'];
export function RuleComposer({rules,onChange}:{rules:Rules;onChange:(r:Rules)=>boolean}){
 // 규칙 엔진(matchesRule)은 아직 운동/업무/개인/공부/건강 5가지 baseCategory로만 필터링할
 // 수 있어서, 내가 만든 카테고리를 골라도 실제로는 그 카테고리의 baseCategory가 저장된다.
 // 대신 목록 자체는 카테고리 탭에서 만든/수정한 이름 그대로 보여줘서 눈에 익은 이름으로
 // 고를 수 있게 한다.
 const userCategories=useCategories();
 const [text,setText]=useState(''),[draft,setDraft]=useState<PersonalRule|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState<string|null>(null);
 const inFlight=useRef(false);
 function apply(next:Rules){if(onChange(next)){setError('');return true;}setError('저장하지 못했어요. 입력 내용은 유지했어요. 브라우저 저장 공간을 확인해 주세요.');return false;}
 async function interpret(){
  if(inFlight.current)return;inFlight.current=true;
  setError('');setDraft(null);setBusy(true);
  try{const r=await interpretRuleInput(text);setDraft({...r,id:editing||r.id,text});}
  catch(e){setError(e instanceof Error?e.message:'규칙을 확인해 주세요.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <View style={{gap:10}}><Text style={{fontSize:19,fontWeight:'600'}}>말로 만드는 내 규칙</Text><Text>해석 결과를 확인하고 저장해요. 여러 조건은 하나씩 추가해 주세요. 기간이 정해진 규칙(일주일간·이번 주만)은 지원하지 않아요.</Text>
 <TextInput accessibilityLabel="규칙 문장" editable={!busy} value={text} onChangeText={v=>{setText(v);setDraft(null);setError('');}} style={controlStyles.input} placeholder="운동 다음 날은 쉬기" multiline maxLength={300}/>
 <View style={controlStyles.row}>{examples.map(s=><Choice key={s} label={s} disabled={busy} onPress={()=>{setText(s);setDraft(null);setEditing(null);setError('');}}/>)}</View>
 <Choice label={busy?'해석 중…':'규칙 해석하기'} disabled={busy||!text.trim()} onPress={()=>void interpret()}/>
 {!!error&&<Text accessibilityRole="alert">{error}</Text>}
 {draft&&<View style={{gap:10,padding:16,backgroundColor:'#F6EEE4',borderRadius:12}}><Text>이렇게 기억할게요: {describeRule(draft)}</Text>
 <Text>대상 카테고리</Text><View style={controlStyles.row}><Choice label="전체" selected={draft.category==='all'} onPress={()=>setDraft({...draft,category:'all'})}/>{userCategories.map(c=><Choice key={c.id} label={c.label} selected={draft.category===c.baseCategory} onPress={()=>setDraft({...draft,category:c.baseCategory})}/>)}</View>
 <TextInput accessibilityLabel="규칙 대상 단어" placeholder="특정 단어만 적용 (비우면 카테고리 전체)" value={draft.keyword} onChangeText={keyword=>setDraft({...draft,keyword})} style={controlStyles.input}/>
 {!['auto','reminder'].includes(draft.type)&&<View style={controlStyles.row}>{Object.entries(actionLabels).map(([key,label])=><Choice key={key} label={label} selected={draft.action===key} onPress={()=>setDraft({...draft,action:key as RuleAction})}/>)}</View>}
 {draft.type==='auto'&&<Text>다른 규칙 위반이나 모호한 시간·장소는 계속 확인해요. 반복 등록도 먼저 확인해요.</Text>}
 <Choice label={editing?'규칙 수정 저장':'이 규칙 저장'} onPress={()=>{try{const r=validateRule(draft);if(!apply({...rules,items:[...(rules.items||[]).filter(x=>x.id!==r.id),r]}))return;setDraft(null);setText('');setEditing(null);}catch(e){setError(String(e));}}}/></View>}
 {(rules.items||[]).map(r=><View key={r.id} style={{borderTopWidth:1,borderColor:'#E5D8CB',paddingVertical:12,gap:8}}><Text>{describeRule(r)}</Text><Text>{r.text} · {['auto','reminder'].includes(r.type)?'자동 적용':actionLabels[r.action]}</Text><View style={controlStyles.row}><Switch accessibilityLabel={r.text+' 사용'} value={r.enabled} disabled={busy} onValueChange={enabled=>void apply({...rules,items:rules.items!.map(x=>x.id===r.id?{...x,enabled}:x)})}/><Choice label="수정" disabled={busy} onPress={()=>{setText(r.text);setDraft(r);setEditing(r.id);setError('');}}/><Choice label="규칙 삭제" disabled={busy} onPress={()=>apply({...rules,items:rules.items!.filter(x=>x.id!==r.id)})}/></View></View>)}
 <Text>알림 규칙이 여러 개 맞으면 목록에서 마지막으로 저장한 규칙을 적용해요. 변경은 새 일정부터 적용돼요.</Text>
 </View>;
}
