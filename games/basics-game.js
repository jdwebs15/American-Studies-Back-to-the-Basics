(function(){
'use strict';
const $=id=>document.getElementById(id);
const key='AS_BASICS_V1:'+location.pathname;
const bank=questions.map((q,index)=>({id:'q'+(index+1),options:q.choices,answerIndex:q.answer}));
let state, advanceTimer, liveTimer, locked=false, loading=false;
const date=value=>new Date(value).toLocaleString();
function duration(milliseconds){
  const seconds=Math.max(0,Math.floor(milliseconds/1000));
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60]
    .map(part=>String(part).padStart(2,'0')).join(':');
}
function save(){
  BasicsAudit.draft(state,bank);
  try{localStorage.setItem(key,JSON.stringify(state));}catch{}
}
function stats(){
  const correct=state?.qmeta.filter(item=>item.done).length||0;
  const attempts=correct+(state?.runMisses||0);
  return {correct,attempts,accuracy:attempts?Math.round(correct/attempts*100):100};
}
function tracker(){
  const s=stats();
  $('progressText').textContent=`${Math.min((state?.idx||0)+1,bank.length)} / ${bank.length}`;
  $('correctText').textContent=s.correct;
  $('attemptText').textContent=s.attempts;
  $('accuracyText').textContent=s.accuracy+'%';
}
function show(panel){
  $('startScreen').style.display=panel==='start'?'block':'none';
  $('liveMeta').style.display=panel==='game'?'block':'none';
  $('gameArea').style.display=panel==='game'?'block':'none';
  $('summaryArea').style.display=panel==='results'?'block':'none';
}
function showFeedback(id,text){
  const element=$(id);
  element.textContent=text;
  element.classList.toggle('show',Boolean(text));
}
function continueAfterFeedback(){
  clearTimeout(advanceTimer);
  advanceTimer=setTimeout(()=>{
    state.idx++;
    if(state.idx===bank.length)finish();
    else{render();save();}
  },4000);
}
function render(){
  tracker();
  const id=state.qOrder[state.idx];
  const q=questions[id], meta=state.qmeta[state.idx], order=state.auditOptions[id];
  locked=meta.done;
  $('qNum').textContent='Question '+(state.idx+1);
  $('questionText').textContent=q.question;
  showFeedback('feedbackGood',meta.done?'Correct. '+(q.explanation||q.hint):'');
  showFeedback('feedbackBad',!meta.done&&meta.missed?'Hint: '+q.hint+' Select the highlighted correct answer to continue.':'');
  $('choicesWrap').replaceChildren(...order.map((original,index)=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='choice';
    button.textContent=String.fromCharCode(65+index)+'. '+q.choices[original];
    button.disabled=meta.done||meta.wrong?.includes(original);
    if((meta.done||meta.missed)&&original===q.answer)button.classList.add('correct');
    button.onclick=()=>{
      if(locked||button.disabled)return;
      if(original===q.answer)meta.done=true;
      else{
        meta.missed=true;
        meta.missCount++;
        meta.wrong.push(original);
        state.runMisses++;
      }
      render();
      save();
    };
    return button;
  }));
  if(meta.done)continueAfterFeedback();
}
function valid(draft,email){
  return draft?.version===1&&draft.email===email&&draft.name&&draft.startedAtISO&&
    Number.isFinite(draft.startedAtMS)&&Number.isInteger(draft.idx)&&draft.idx>=0&&draft.idx<bank.length&&
    Array.isArray(draft.qOrder)&&draft.qOrder.length===bank.length&&new Set(draft.qOrder).size===bank.length&&
    draft.qOrder.every(id=>Number.isInteger(id)&&id>=0&&id<bank.length&&
      Array.isArray(draft.auditOptions?.[id])&&[...draft.auditOptions[id]].sort().join(',')==='0,1,2,3')&&
    Array.isArray(draft.qmeta)&&draft.qmeta.length===bank.length&&draft.qmeta.every(item=>item&&Array.isArray(item.wrong));
}
function enterGame(draft){
  state=draft;
  $('studentName').value=state.name;
  $('sheetEmail').value=state.email;
  $('sheetPeriod').value=state.period;
  $('liveStudent').textContent=state.name;
  $('liveStarted').textContent=date(state.startedAtISO);
  show('game');
  clearInterval(liveTimer);
  function tick(){
    $('liveNow').textContent=date(Date.now());
    $('liveElapsed').textContent=duration(Date.now()-state.startedAtMS);
  }
  tick();
  liveTimer=setInterval(tick,1000);
  render();
  save();
}
function emailEntered(){return $('sheetEmail').value.trim().toLowerCase();}
function start(){
  if(loading||state)return;
  const name=$('studentName').value.trim(),email=emailEntered(),period=$('sheetPeriod').value;
  if(!name||!period||!$('sheetEmail').checkValidity()){
    $('btbRestoreStatus').textContent='Enter your name, class period, and school email.';
    return;
  }
  const order=()=>BasicsAudit.shuffle(bank.map((_,i)=>i));
  const layout=BasicsAudit.start(key,bank,order(),order);
  const now=Date.now();
  enterGame({version:1,name,email,period,idx:0,startedAtISO:new Date(now).toISOString(),startedAtMS:now,
    qOrder:layout.order,auditOptions:layout.options,runMisses:0,
    qmeta:bank.map(()=>({done:false,missed:false,missCount:0,wrong:[]}))});
}
async function retrieve(){
  if(loading||state)return;
  const email=emailEntered(),label=$('btbRestoreStatus');
  if(!$('sheetEmail').checkValidity()){label.textContent='Enter your school email to find your saved work.';return;}
  loading=true;
  $('startBtn').disabled=$('btnRestoreCloud').disabled=true;
  label.textContent='Looking for saved work…';
  try{
    const result=await BasicsAudit.retrieve(email);
    const draft=result.progress;
    if(result.ok&&valid(draft,email)&&!draft.btbCompletedAt)enterGame(draft);
    else label.textContent=result.ok?'No unfinished spreadsheet save was found.':'Could not retrieve work from the spreadsheet.';
  }finally{
    loading=false;
    $('startBtn').disabled=$('btnRestoreCloud').disabled=false;
  }
}
function finish(){
  clearInterval(liveTimer);
  show('results');
  const {correct,attempts,accuracy}=stats();
  const passed=correct===bank.length&&state.runMisses===0;
  const ended=new Date();
  $('perfectCertificate').hidden=!passed;
  $('printBtn').hidden=!passed;
  $('ticketGame').textContent=document.title;
  $('ticketStudent').textContent=state.name;
  $('ticketStart').textContent=date(state.startedAtISO);
  $('ticketEnd').textContent=date(ended);
  $('ticketElapsed').textContent=duration(ended-state.startedAtMS);
  $('passBanner').style.display=passed?'block':'none';
  $('notPassBanner').style.display=passed?'none':'block';
  const label=$('btbFinalStatus');
  label.textContent='Sending completion record…';
  BasicsAudit.send(state,{totalQuestions:bank.length,firstPassCorrect:correct-state.qmeta.filter(x=>x.missed).length,
    totalAttempts:attempts,wrongAttempts:state.runMisses,answerCount:bank.length,finalMasteryAchieved:passed,
    accepted:Object.fromEntries(bank.map(q=>[q.id,true])),endedAt:ended.toISOString(),
    elapsedSeconds:Math.floor((ended-state.startedAtMS)/1000)}).then(result=>{
      label.textContent=result.ok?'Completion record saved.':'Spreadsheet receipt could not be confirmed.';
    });
  save();
}
function restart(){
  clearTimeout(advanceTimer);
  clearInterval(liveTimer);
  state=undefined;
  locked=false;
  try{localStorage.removeItem(key);}catch{}
  $('btbCloudStatus').textContent='';
  $('btbRestoreStatus').textContent='';
  show('start');
  tracker();
  $('studentName').focus();
}
$('questionCountLabel').textContent=bank.length;
$('startBtn').onclick=start;
$('studentName').addEventListener('keydown',event=>{if(event.key==='Enter')start();});
$('btnRestoreCloud').onclick=retrieve;
$('restartTopBtn').onclick=$('restartBottomBtn').onclick=restart;
$('printBtn').onclick=()=>{if(!$('perfectCertificate').hidden)window.print();};
tracker();
try{
  const saved=JSON.parse(localStorage.getItem(key));
  if(valid(saved,saved?.email)&&!saved.btbCompletedAt)enterGame(saved);
}catch{}
})();
