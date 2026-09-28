const STORAGE_KEY = 'financial-statements-pwa-progress-v1';
const LAST_SESSION_KEY = 'financial-statements-pwa-last-session-v1';

let allQuestions = [];
let chapters = [];
let progress = loadJson(STORAGE_KEY, {});
let session = null;
let currentScreen = 'home';
let historyStack = [];
let lastSetup = {chapter:'all',rank:'all',mode:'all',limit:'10',shuffle:true,label:'通常演習'};

const $ = id => document.getElementById(id);
const el = {
  backBtn:$('backBtn'),homeBtn:$('homeBtn'),homeScreen:$('homeScreen'),setupScreen:$('setupScreen'),studyScreen:$('studyScreen'),resultScreen:$('resultScreen'),weakScreen:$('weakScreen'),progressScreen:$('progressScreen'),
  totalCount:$('totalCount'),answeredCount:$('answeredCount'),correctRate:$('correctRate'),weakCount:$('weakCount'),overallProgressText:$('overallProgressText'),overallProgressBar:$('overallProgressBar'),quickStartBtn:$('quickStartBtn'),continueBtn:$('continueBtn'),
  setupForm:$('setupForm'),chapterFilter:$('chapterFilter'),rankFilter:$('rankFilter'),modeFilter:$('modeFilter'),limitFilter:$('limitFilter'),shuffleToggle:$('shuffleToggle'),setupCount:$('setupCount'),
  sessionLabel:$('sessionLabel'),questionNo:$('questionNo'),progressText:$('progressText'),progressBar:$('progressBar'),metaText:$('metaText'),questionText:$('questionText'),imageBox:$('imageBox'),choices:$('choices'),resultBox:$('resultBox'),bookmarkBtn:$('bookmarkBtn'),nextBtn:$('nextBtn'),
  sessionAnswered:$('sessionAnswered'),sessionCorrect:$('sessionCorrect'),sessionRate:$('sessionRate'),retryWrongBtn:$('retryWrongBtn'),sameConditionBtn:$('sameConditionBtn'),toHomeFromResultBtn:$('toHomeFromResultBtn'),
  weakTotal:$('weakTotal'),weakAnswered:$('weakAnswered'),weakAvgWrong:$('weakAvgWrong'),startWeakBtn:$('startWeakBtn'),weakList:$('weakList'),chapterProgressList:$('chapterProgressList'),resetProgressBtn:$('resetProgressBtn')
};

init();

async function init(){
  try{
    if(window.FIN_VAULT){
      await unlockEncryptedVault();
    }else{
      if(Array.isArray(window.QUESTIONS_DATA)) allQuestions=window.QUESTIONS_DATA;
      else {const res=await fetch('data/questions.json'); if(!res.ok) throw new Error('questions.json load failed'); allQuestions=await res.json();}
      unlockUi();
    }
    if(!Array.isArray(allQuestions)||!allQuestions.length) throw new Error('question data is empty');
    chapters=buildChapterList();setupChapterOptions();attachEvents();updateHomeStats();updateSetupCount();showScreen('home',false);tryRegisterServiceWorker();
  }catch(err){console.error(err);document.body.innerHTML='<main class="app-shell"><div class="empty">問題データを読み込めませんでした。ファイル一式が同じフォルダにあるか、HTTPS環境で開いているか確認してください。</div></main>'}
}

function unlockUi(){const lock=$('lockScreen');const shell=document.querySelector('.app-shell');if(lock)lock.classList.add('hidden');if(shell)shell.classList.remove('hidden-until-unlocked')}

function unlockEncryptedVault(){
  return new Promise((resolve,reject)=>{
    const form=$('unlockForm'),input=$('passwordInput'),button=$('unlockBtn'),message=$('unlockMessage'),note=$('lockNote');
    form.classList.remove('hidden');note.textContent='このアプリは問題データを暗号化しています。パスワードを入力すると、端末上で復号して学習を開始します。';
    if(!window.crypto?.subtle){message.textContent='このブラウザでは暗号化データを開けません。GitHub PagesなどのHTTPS環境で開いてください。';reject(new Error('Web Crypto API unavailable'));return;}
    form.addEventListener('submit',async event=>{event.preventDefault();const password=input.value;if(!password)return;button.disabled=true;button.textContent='確認中...';message.textContent='';
      try{allQuestions=await decryptVault(window.FIN_VAULT,password);unlockUi();input.value='';resolve()}catch(err){console.error(err);message.textContent='パスワードが違うか、データを開けませんでした。';button.disabled=false;button.textContent='開く';input.select()}
    });
  });
}

async function decryptVault(vault,password){
  const salt=base64ToBytes(vault.salt),iv=base64ToBytes(vault.iv),data=base64ToBytes(vault.data);
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:vault.iterations||210000,hash:vault.hash||'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,data);return JSON.parse(new TextDecoder().decode(plain));
}
function base64ToBytes(base64){const bin=atob(base64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes}

function attachEvents(){
  el.backBtn.addEventListener('click',goBack);el.homeBtn.addEventListener('click',()=>showScreen('home'));el.quickStartBtn.addEventListener('click',()=>startSession({chapter:'all',rank:'A',mode:'all',limit:'10',shuffle:true,label:'Aランクから10問'}));el.continueBtn.addEventListener('click',continueLastSession);
  document.querySelectorAll('[data-menu]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.menu==='setup')showScreen('setup');if(btn.dataset.menu==='progress'){renderProgressScreen();showScreen('progress')}if(btn.dataset.menu==='weak'){renderWeakScreen();showScreen('weak')}}));
  document.querySelectorAll('[data-preset]').forEach(btn=>btn.addEventListener('click',()=>{const p=btn.dataset.preset;if(p==='wrong')startSession({chapter:'all',rank:'all',mode:'wrong',limit:'20',shuffle:true,label:'前回不正解の復習'});if(p==='bookmarked')startSession({chapter:'all',rank:'all',mode:'bookmarked',limit:'20',shuffle:false,label:'ブックマーク復習'})}));
  el.setupForm.addEventListener('submit',e=>{e.preventDefault();startSession({chapter:el.chapterFilter.value,rank:el.rankFilter.value,mode:el.modeFilter.value,limit:el.limitFilter.value,shuffle:el.shuffleToggle.checked,label:buildSessionLabel()})});
  [el.chapterFilter,el.rankFilter,el.modeFilter,el.limitFilter,el.shuffleToggle].forEach(i=>i.addEventListener('change',updateSetupCount));el.bookmarkBtn.addEventListener('click',toggleBookmark);el.nextBtn.addEventListener('click',nextQuestion);el.retryWrongBtn.addEventListener('click',retrySessionWrong);el.sameConditionBtn.addEventListener('click',()=>startSession(lastSetup));el.toHomeFromResultBtn.addEventListener('click',()=>showScreen('home'));el.resetProgressBtn.addEventListener('click',resetProgress);el.startWeakBtn.addEventListener('click',()=>startSession({chapter:'all',rank:'all',mode:'weak',limit:'20',shuffle:true,label:'苦手問題の集中演習'}));
}
function buildChapterList(){const map=new Map();allQuestions.forEach(q=>{const key=q.chapter||'未分類';if(!map.has(key))map.set(key,{chapter:key,chapterTitle:q.chapterTitle||'',count:0});map.get(key).count++});return [...map.values()].sort((a,b)=>String(a.chapter).localeCompare(String(b.chapter),'ja',{numeric:true}))}
function formatChapter(c){const n=Number(c);return Number.isFinite(n)&&n>0?`第${n}章`:String(c||'未分類')}
function setupChapterOptions(){chapters.forEach(ch=>{const opt=document.createElement('option');opt.value=ch.chapter;opt.textContent=`${formatChapter(ch.chapter)} ${ch.chapterTitle}（${ch.count}問）`;el.chapterFilter.appendChild(opt)})}
function showScreen(name,pushHistory=true){if(pushHistory&&currentScreen&&currentScreen!==name)historyStack.push(currentScreen);currentScreen=name;document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));$(`${name}Screen`).classList.add('active');el.backBtn.classList.toggle('hidden',name==='home');updateHomeStats();window.scrollTo({top:0,behavior:'smooth'})}
function goBack(){const prev=historyStack.pop()||'home';showScreen(prev,false)}
function getFilteredQuestions(config){return allQuestions.filter(q=>{if(q.active===false)return false;if(config.chapter!=='all'&&q.chapter!==config.chapter)return false;if(config.rank!=='all'&&q.rank!==config.rank)return false;const r=progress[q.id];if(config.mode==='unanswered'&&r?.answered)return false;if(config.mode==='wrong'&&r?.lastCorrect!==false)return false;if(config.mode==='weak'&&!isWeakRecord(r))return false;if(config.mode==='bookmarked'&&!r?.bookmarked)return false;return true})}
function startSession(config){lastSetup={...config};let pool=getFilteredQuestions(config);if(config.shuffle)pool=shuffle([...pool]);const limit=config.limit==='all'?pool.length:Number(config.limit||10);const questions=pool.slice(0,limit);if(!questions.length){alert('この条件に該当する問題がありません。条件を変更してください。');showScreen('setup');return}session={config:{...config},ids:questions.map(q=>q.id),index:0,answered:0,correct:0,wrongIds:[],selectedKeys:[],judged:false,sessionResults:{}};saveJson(LAST_SESSION_KEY,{config:session.config,ids:session.ids,index:0});renderQuestion();showScreen('study')}
function continueLastSession(){const saved=loadJson(LAST_SESSION_KEY,null);if(!saved?.ids?.length){startSession({chapter:'all',rank:'A',mode:'all',limit:'10',shuffle:true,label:'Aランクから10問'});return}const ids=saved.ids.filter(id=>allQuestions.some(q=>q.id===id));if(!ids.length){alert('前回セッションを復元できませんでした。');return}session={config:saved.config||{label:'前回の続き'},ids,index:Math.min(saved.index||0,ids.length-1),answered:0,correct:0,wrongIds:[],selectedKeys:[],judged:false,sessionResults:{}};renderQuestion();showScreen('study')}
function currentQuestion(){if(!session)return null;return allQuestions.find(q=>q.id===session.ids[session.index])}
function renderQuestion(){const q=currentQuestion();if(!q)return finishSession();session.selectedKeys=[];session.judged=false;el.sessionLabel.textContent=session.config.label||'SESSION';el.questionNo.textContent=`${session.index+1}. ${q.id}`;el.progressText.textContent=`${session.index+1} / ${session.ids.length}`;el.progressBar.style.width=`${(session.index/session.ids.length)*100}%`;el.metaText.textContent=`${formatChapter(q.chapter)} ${q.chapterTitle} / ${q.sectionTitle||q.section||''}${q.topic?` / ${q.topic}`:''} / ランク${q.rank}`;el.questionText.textContent=q.questionRender||q.question;el.imageBox.innerHTML='';el.choices.innerHTML='';el.resultBox.className='result hidden';el.resultBox.innerHTML='';el.nextBtn.textContent=session.index===session.ids.length-1?'結果を見る':'次の問題へ';el.nextBtn.disabled=true;
  if(q.hasImage&&q.image?.file){const img=document.createElement('img');img.src=q.image.file;img.alt=q.image.alt||q.image.caption||'問題画像';el.imageBox.appendChild(img);if(q.image.caption){const c=document.createElement('p');c.className='meta';c.textContent=q.image.caption;el.imageBox.appendChild(c)}}
  (Array.isArray(q.choices)?q.choices:[]).forEach(choice=>{const btn=document.createElement('button');btn.type='button';btn.className='choice-btn';btn.dataset.key=choice.key;const label=choice.label||(q.type==='true_false'?choice.text:choice.key);let body=choice.text||'';if(q.type==='true_false')body='';if(label&&body.startsWith(`${label}：`))body=body.slice(label.length+1);if(label&&body.startsWith(`${label}:`))body=body.slice(label.length+1);btn.innerHTML=`<span class="choice-label">${escapeHtml(label)}</span>${escapeHtml(body)}`;btn.addEventListener('click',()=>selectChoice(choice.key));el.choices.appendChild(btn)});el.bookmarkBtn.textContent=progress[q.id]?.bookmarked?'★ ブックマーク済み':'☆ ブックマーク'}
function selectChoice(key){const q=currentQuestion();if(!q||session.judged)return;if(q.type==='multi_choice'){if(session.selectedKeys.includes(key))session.selectedKeys=session.selectedKeys.filter(k=>k!==key);else session.selectedKeys.push(key);const btn=document.querySelector(`[data-key="${cssEscape(key)}"]`);if(btn)btn.classList.toggle('selected');const n=(q.answerKeys||[]).length||1;if(session.selectedKeys.length<n)return}else session.selectedKeys=[key];judgeAnswer()}
function judgeAnswer(){const q=currentQuestion(),selected=[...session.selectedKeys].sort(),correct=[...(q.answerKeys?.length?q.answerKeys:[q.answer])].sort(),ok=JSON.stringify(selected)===JSON.stringify(correct);session.judged=true;session.answered++;if(ok)session.correct++;else session.wrongIds.push(q.id);session.sessionResults[q.id]=ok;document.querySelectorAll('.choice-btn').forEach(btn=>{const key=btn.dataset.key;btn.disabled=true;if(correct.includes(key))btn.classList.add('correct');else if(selected.includes(key))btn.classList.add('wrong')});const prev=progress[q.id]||{},wrong=getWrongCount(prev);progress[q.id]={...prev,answered:true,attempts:(prev.attempts||0)+1,correctCount:(prev.correctCount||0)+(ok?1:0),wrongCount:wrong+(ok?0:1),lastCorrect:ok,lastAnsweredAt:new Date().toISOString()};saveJson(STORAGE_KEY,progress);el.resultBox.className=`result ${ok?'correct':'wrong'}`;const weak=isWeakRecord(progress[q.id]);el.resultBox.innerHTML=`<strong>${ok?'正解！':'不正解'}</strong>${weak?' <span class="weak-badge">苦手リスト対象</span>':''}<br>正解：${escapeHtml(q.correctMark||q.answer)}<hr><strong>解説</strong><br>${escapeHtml(q.explanation||'解説なし').replace(/\n/g,'<br>')}${q.point?`<hr><strong>ポイント</strong><br>${escapeHtml(q.point)}`:''}`;el.nextBtn.disabled=false;updateHomeStats()}
function nextQuestion(){if(!session)return;if(session.index>=session.ids.length-1){finishSession();return}session.index++;saveJson(LAST_SESSION_KEY,{config:session.config,ids:session.ids,index:session.index});renderQuestion();window.scrollTo({top:0,behavior:'smooth'})}
function finishSession(){if(!session)return;el.progressBar.style.width='100%';el.sessionAnswered.textContent=session.answered;el.sessionCorrect.textContent=session.correct;el.sessionRate.textContent=session.answered?`${Math.round(session.correct/session.answered*100)}%`:'-';el.retryWrongBtn.disabled=session.wrongIds.length===0;showScreen('result')}
function retrySessionWrong(){if(!session?.wrongIds?.length)return;session={config:{label:'今回間違えた問題の復習',chapter:'all',rank:'all',mode:'custom',limit:String(session.wrongIds.length),shuffle:false},ids:[...session.wrongIds],index:0,answered:0,correct:0,wrongIds:[],selectedKeys:[],judged:false,sessionResults:{}};renderQuestion();showScreen('study')}
function toggleBookmark(){const q=currentQuestion();if(!q)return;const prev=progress[q.id]||{};progress[q.id]={...prev,bookmarked:!prev.bookmarked};saveJson(STORAGE_KEY,progress);el.bookmarkBtn.textContent=progress[q.id].bookmarked?'★ ブックマーク済み':'☆ ブックマーク';updateHomeStats()}
function updateHomeStats(){const correct=allQuestions.filter(q=>progress[q.id]?.lastCorrect===true).length,weak=getWeakQuestions().length,total=allQuestions.filter(q=>q.active!==false).length,rate=total?Math.round(correct/total*100):0;el.totalCount.textContent=total.toLocaleString('ja-JP');el.answeredCount.textContent=correct.toLocaleString('ja-JP');el.correctRate.textContent=`${rate}%`;el.weakCount.textContent=weak.toLocaleString('ja-JP');el.overallProgressText.textContent=`${correct.toLocaleString('ja-JP')} / ${total.toLocaleString('ja-JP')}問`;el.overallProgressBar.style.width=`${rate}%`}
function updateSetupCount(){const config={chapter:el.chapterFilter.value,rank:el.rankFilter.value,mode:el.modeFilter.value,limit:el.limitFilter.value,shuffle:el.shuffleToggle.checked};const count=getFilteredQuestions(config).length;const label=config.limit==='all'?'すべて':`${Math.min(Number(config.limit),count)}問`;el.setupCount.textContent=`該当問題数：${count.toLocaleString('ja-JP')}問 / 出題予定：${label}`}
function buildSessionLabel(){const chapter=el.chapterFilter.selectedOptions[0]?.textContent||'すべての章',mode=el.modeFilter.selectedOptions[0]?.textContent||'全問題',rank=el.rankFilter.value==='all'?'全ランク':`${el.rankFilter.value}ランク`;return `${mode}・${rank}・${chapter}`}
function getWrongCount(r){if(!r)return 0;if(Number.isFinite(Number(r.wrongCount)))return Number(r.wrongCount);return Math.max(0,Number(r.attempts||0)-Number(r.correctCount||0))}
function isWeakRecord(r){return !!r&&r.answered===true&&r.lastCorrect===false}
function getWeakQuestions(){return allQuestions.filter(q=>isWeakRecord(progress[q.id])).sort((a,b)=>getWrongCount(progress[b.id])-getWrongCount(progress[a.id])||a.id.localeCompare(b.id,'ja'))}
function renderWeakScreen(){const qs=getWeakQuestions(),totalWrong=qs.reduce((s,q)=>s+getWrongCount(progress[q.id]),0);el.weakTotal.textContent=qs.length.toLocaleString('ja-JP');el.weakAnswered.textContent=qs.filter(q=>progress[q.id]?.answered).length.toLocaleString('ja-JP');el.weakAvgWrong.textContent=qs.length?`${(totalWrong/qs.length).toFixed(1)}回`:'-';el.startWeakBtn.disabled=qs.length===0;el.weakList.innerHTML='';if(!qs.length){el.weakList.innerHTML='<div class="empty">現在の苦手問題はありません。直近で間違えた問題がここに表示され、正解するとリストから外れます。</div>';return}qs.forEach(q=>{const r=progress[q.id]||{},wrong=getWrongCount(r),rate=r.attempts?Math.round((r.correctCount||0)/r.attempts*100):0,row=document.createElement('article');row.className='weak-row';row.innerHTML=`<div class="weak-row-head"><span class="weak-badge">${wrong}回ミス</span><small>${escapeHtml(formatChapter(q.chapter))} ${escapeHtml(q.chapterTitle||'')} / ランク${escapeHtml(q.rank)}</small></div><strong>${escapeHtml(q.id)}</strong><p>${escapeHtml((q.questionRender||q.question||'').slice(0,92))}${(q.questionRender||q.question||'').length>92?'…':''}</p><small>解答回数 ${r.attempts||0}回 / 通算正答率 ${rate}%</small>`;row.addEventListener('click',()=>startCustomSession([q.id],`苦手問題：${q.id}`));el.weakList.appendChild(row)})}
function startCustomSession(ids,label){if(!ids?.length)return;session={config:{label,chapter:'all',rank:'all',mode:'custom',limit:String(ids.length),shuffle:false},ids:ids.filter(id=>allQuestions.some(q=>q.id===id)),index:0,answered:0,correct:0,wrongIds:[],selectedKeys:[],judged:false,sessionResults:{}};renderQuestion();showScreen('study')}
function renderProgressScreen(){el.chapterProgressList.innerHTML='';chapters.forEach(ch=>{const qs=allQuestions.filter(q=>q.chapter===ch.chapter&&q.active!==false),answered=qs.filter(q=>progress[q.id]?.answered).length,correct=qs.filter(q=>progress[q.id]?.lastCorrect).length,weak=qs.filter(q=>isWeakRecord(progress[q.id])).length,rate=answered?Math.round(correct/answered*100):null,done=Math.round(correct/qs.length*100),row=document.createElement('div');row.className='chapter-row';row.innerHTML=`<div class="chapter-row-head"><span>${escapeHtml(formatChapter(ch.chapter))} ${escapeHtml(ch.chapterTitle)}</span><span class="rate-badge">${rate===null?'正答率 -':`${rate}%`}</span></div><small>回答済み ${answered}問　正解済み ${correct} / ${qs.length}問　進捗 ${done}%　苦手 ${weak}問</small><div class="mini-bar"><span style="width:${done}%"></span></div>`;row.addEventListener('click',()=>{el.chapterFilter.value=ch.chapter;el.rankFilter.value='all';el.modeFilter.value='all';updateSetupCount();showScreen('setup')});el.chapterProgressList.appendChild(row)})}
function resetProgress(){if(!confirm('この端末に保存されている回答履歴・ブックマークをすべて削除しますか？'))return;progress={};localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(LAST_SESSION_KEY);updateHomeStats();renderProgressScreen()}
function loadJson(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function saveJson(key,value){localStorage.setItem(key,JSON.stringify(value))}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function cssEscape(v){if(window.CSS?.escape)return CSS.escape(v);return String(v).replace(/"/g,'\\"')}
function tryRegisterServiceWorker(){if(location.protocol.startsWith('http')&&'serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{})}
