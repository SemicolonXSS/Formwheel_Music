import {ALL,IDX,KEYMAP} from './music-data.js';
import {audioContext,ensureAudio,playTone,stopAllTones} from './audio-engine.js';
import {normalizeSong,validateHands,handFor} from './editor.js';
import {drawNotes,maxBeatOf,scheduleAhead} from './player.js';
import {nearestNote,judgment} from './game.js';
import {saveSong,listSongs,saveScore,listScores} from './firebase-service.js';
import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import{getDatabase}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import{getAuth,signInAnonymously,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig={
apiKey:"AIzaSyBreTSe1m0-xlbF4aupnU5isRZCihR25IE",
authDomain:"formwheel.firebaseapp.com",
databaseURL:"https://formwheel-default-rtdb.firebaseio.com",
projectId:"formwheel",
storageBucket:"formwheel.firebasestorage.app",
messagingSenderId:"431583088241",
appId:"1:431583088241:web:74e0e34ea1e3e1170c55d0",
measurementId:"G-T372YXDF8D"};
const ROOT="formwheelMusic";
const $=id=>document.getElementById(id);
let db=null,auth=null,currentUser=null,firebaseReady=false,authReady=false;

function setFirebaseStatus(type,text){
  const b=$("firebaseStatus");b.className="firebase-status "+type;b.textContent=text;
  const m=$("firebaseMessage");if(m)m.textContent=text;
}
async function initFirebase(){
  try{
    const app=initializeApp(firebaseConfig);
    db=getDatabase(app);auth=getAuth(app);firebaseReady=true;
    setFirebaseStatus("wait","🔐 Firebase 인증 중...");
    onAuthStateChanged(auth,u=>{
      if(u){currentUser=u;authReady=true;renderSongGrid();setFirebaseStatus("ok","🟢 Firebase 연결됨")}
      else currentUser=null;
    });
    try{await signInAnonymously(auth)}
    catch(e){console.error(e);authReady=false;setFirebaseStatus("error","❌ Firebase 인증 실패")}
    loadSongs();
  }catch(e){console.error(e);firebaseReady=false;authReady=false;setFirebaseStatus("error","❌ Firebase 연결 실패")}
}

/* ===== STATE ===== */
let composition={title:"나의 음악",instrument:"piano",handMode:"two",tempo:120,notes:[]};
let selectedKeys=new Set(),editorMode="piano",playbackView="falling",songsCache=[],uploadedAudio=null,uploadedAudioUrl=null;
const playback={active:false,raf:null,song:null,startedAt:null,endSeconds:0,scheduled:new Set(),scheduler:null};
const game={active:false,raf:null,song:null,startedAt:null,countdownActive:false,countdownTimer:null,score:0,combo:0,hits:0,misses:0,judged:0,hitNotes:new Set(),totalSeconds:0};

const mp3Card=document.createElement("section");mp3Card.className="card";mp3Card.style.marginTop="18px";
mp3Card.innerHTML='<h3>MP3 / 오디오 업로드</h3><p>기기의 오디오 파일을 감상합니다. 서버로 전송되지 않으며 음표 게임용 악보로 자동 변환하지 않습니다. 최대 20MB.</p><input id="mp3Upload" type="file" accept="audio/*,.mp3"><audio id="mp3Player" controls style="display:block;width:100%;margin-top:12px"></audio><button id="mp3Stop">오디오 정지</button><p id="mp3Status" role="status"></p>';
$("library").append(mp3Card);uploadedAudio=$("mp3Player");
$("mp3Upload").onchange=event=>{const file=event.target.files[0];if(!file)return;
 if(file.size>20*1024*1024){$("mp3Status").textContent="20MB 이하 파일을 선택해주세요.";return;}
 stopPlayback();stopGame();if(uploadedAudioUrl)URL.revokeObjectURL(uploadedAudioUrl);uploadedAudioUrl=URL.createObjectURL(file);uploadedAudio.src=uploadedAudioUrl;$("mp3Status").textContent=file.name+" · 이 기기에서 재생";
};
$("mp3Stop").onclick=()=>{uploadedAudio.pause();uploadedAudio.currentTime=0;};
addEventListener("beforeunload",()=>{uploadedAudio.pause();if(uploadedAudioUrl)URL.revokeObjectURL(uploadedAudioUrl);});
/* ===== SCREEN ===== */
window.showScreen=function(name){
  stopPlayback();stopGame();
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  const t=$(name);if(t)t.classList.add("active");
  if(name==="library")loadSongs();
  if(name==="game")loadGameSongs();
  window.scrollTo(0,0);
};

/* ===== EDITOR PIANO ===== */
function buildEditorPiano(){
  const piano=$("editorPiano");piano.innerHTML="";
  const whites=ALL.filter(n=>!n.includes("#")),pos={};
  const press=(note,el)=>{toggleEditorKey(note,el);playTone(note,.2,$("instrument").value)};
  whites.forEach((note,i)=>{
    pos[note]=i;
    const k=document.createElement("div");
    k.className="white-key";k.dataset.note=note;k.innerHTML=`<span>${note}</span>`;
    k.addEventListener("pointerdown",()=>press(note,k));
    piano.appendChild(k);
  });
  whites.forEach(note=>{
    const base=note.replace(/\d/g,""),oct=note.slice(-1);
    if(!["C","D","F","G","A"].includes(base))return;
    const b=document.createElement("div");
    b.className="black-key";b.dataset.note=base+"#"+oct;b.textContent=b.dataset.note;
    b.style.left=`calc(${((pos[note]+1)/whites.length)*100}% - 14px)`;
    b.addEventListener("pointerdown",e=>{e.stopPropagation();press(b.dataset.note,b)});
    piano.appendChild(b);
  });
}
function toggleEditorKey(note,el){
  if(selectedKeys.has(note)){selectedKeys.delete(note);el.classList.remove("selected")}
  else{selectedKeys.add(note);el.classList.add("selected")}
  $("selectedNotes").value=[...selectedKeys].sort((a,b)=>IDX[a]-IDX[b]).join(" + ")||"없음";
}
window.clearSelectedKeys=function(){
  selectedKeys.clear();
  document.querySelectorAll("#editorPiano .selected").forEach(k=>k.classList.remove("selected"));
  $("selectedNotes").value="없음";
};

/* ===== ADD NOTES ===== */
function getNextInsertBeat(){
  if(!composition.notes.length)return 0;
  return Math.max(...composition.notes.map(n=>Number(n.start||0)+Number(n.duration||1)));
}
const sortNotes=()=>composition.notes.sort((a,b)=>(a.start-b.start)||((IDX[a.note]??0)-(IDX[b.note]??0)));
const refreshAll=()=>{renderTimeline();renderNoteList();renderStaffEditor()};

window.addSelectedNotes=function(){
  if(!selectedKeys.size){alert("피아노에서 음을 먼저 선택해주세요.");return}
  const start=getNextInsertBeat(),duration=Number($("duration").value)||1;
  try{validateHands([...composition.notes,...[...selectedKeys].map(note=>({note,start,type:"note"}))],composition.handMode)}catch(e){alert(e.message);return}
  [...selectedKeys].forEach(note=>composition.notes.push({id:crypto.randomUUID(),type:"note",note,start,duration}));
  sortNotes();refreshAll();clearSelectedKeys();
};
window.addRest=function(){
  composition.notes.push({id:crypto.randomUUID(),type:"rest",start:getNextInsertBeat(),duration:Number($("duration").value)||1});
  sortNotes();refreshAll();
};
window.setEditorMode=function(mode){
  editorMode=mode;
  $("pianoPanel").classList.toggle("hidden",mode!=="piano");
  $("staffEditorPanel").classList.toggle("hidden",mode!=="staff");
  $("editorModeLabel").textContent=mode==="staff"?"현재: 오선보 제작":"현재: 피아노 방식";
  renderStaffEditor();
};

/* ===== STAFF ===== */
function noteToStaffY(note){
  const i=IDX[note];if(i==null)return 130;
  return 132-(i-IDX["C4"])*5.2;
}
function staffYToNote(y){
  const i=Math.max(0,Math.min(ALL.length-1,Math.round((132-y)/5.2)+IDX["C4"]));
  return ALL[i];
}
function renderStaffEditor(){
  const staff=$("editorStaff"),layer=$("editorStaffContent");
  if(!staff||!layer)return;
  layer.innerHTML="";
  staff.style.width=Math.max(1100,Math.max(16,getNextInsertBeat()+4)*70+60)+"px";
  composition.notes.forEach(item=>{
    const el=document.createElement("div");
    el.style.left=(45+item.start*70)+"px";
    if(item.type==="rest"){el.className="staff-note rest";el.textContent="𝄽";el.style.top="115px"}
    else{
      el.className="staff-note";el.style.top=noteToStaffY(item.note)+"px";
      if(item.note.includes("#")){el.textContent="♯";el.style.marginLeft="-18px"}
    }
    layer.appendChild(el);
  });
}
$("editorStaff").addEventListener("click",e=>{
  if(editorMode!=="staff")return;
  const r=$("editorStaff").getBoundingClientRect();
  const x=e.clientX-r.left-45,y=e.clientY-r.top;
  if(y<45||y>210||x<0)return;
  const candidate={id:crypto.randomUUID(),type:"note",note:staffYToNote(y),start:Math.max(0,Math.round(x/70*2)/2),duration:Number($("duration").value)||1};try{validateHands([...composition.notes,candidate],composition.handMode)}catch(e){alert(e.message);return}composition.notes.push(candidate);
  sortNotes();refreshAll();
});

/* ===== TIMELINE ===== */
function durationName(d){
  return d===.5?"8분음표":d===1?"4분음표":d===1.5?"점4분음표":d===2?"2분음표":d===4?"온음표":`${d}박`;
}
function renderTimeline(){
  const tl=$("timeline");
  tl.querySelectorAll(".note-block").forEach(n=>n.remove());
  const maxBeat=Math.max(16,...composition.notes.map(i=>Number(i.start)+Number(i.duration)));
  tl.style.width=`${Math.max(1200,maxBeat*55+100)}px`;
  composition.notes.forEach(item=>{
    const b=document.createElement("div");
    b.style.left=`${item.start*55}px`;
    if(item.type==="rest"){
      b.className="note-block rest";b.style.width=`${Math.max(40,item.duration*55-4)}px`;b.textContent="🤫 쉼표";
    }else{
      const chord=composition.notes.filter(n=>n.type!=="rest"&&n.start===item.start).length>1;
      b.className="note-block"+(chord?" chord":"");
      b.style.top=`${260-(IDX[item.note]??0)*5}px`;
      b.style.width=`${Math.max(25,item.duration*55-4)}px`;
      b.textContent=item.note;
    }
    tl.appendChild(b);
  });
  $("noteCount").textContent=`${composition.notes.length}개 항목`;
  renderStaffEditor();
}
function renderNoteList(){
  const list=$("noteList");list.innerHTML="";
  if(!composition.notes.length){list.innerHTML=`<div class="empty">아직 음표가 없습니다.</div>`;return}
  composition.notes.forEach((item,index)=>{
    const row=document.createElement("div");row.className="note-row";
    const name=durationName(item.duration);
    const label=item.type==="rest"?`🤫 <b>쉼표</b> · ${item.start}박 · ${name}`:`<b>${escapeHTML(item.note||"")}</b> · ${item.start}박 · ${name}`;
    row.innerHTML=`<span>${index+1}. ${label}</span><button class="secondary">삭제</button>`;
    row.querySelector("button").onclick=()=>{composition.notes.splice(index,1);refreshAll()};
    list.appendChild(row);
  });
}
window.undoLast=function(){if(!composition.notes.length)return;composition.notes.pop();refreshAll()};
window.clearComposition=function(){
  if(!composition.notes.length)return;
  if(!confirm("모든 음표를 삭제할까요?"))return;
  composition.notes=[];refreshAll();
};

/* ===== IMPORT / EXPORT ===== */
window.exportSong=function(){
  const data={version:3,...composition};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download=`${composition.title||"Formwheel_Music"}.json`;a.click();
  URL.revokeObjectURL(url);
};
$("importFile").addEventListener("change",e=>{
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{composition=normalizeSong(JSON.parse(reader.result));updateEditorForm();refreshAll();alert("음악을 가져왔습니다!")}
    catch(err){console.error(err);alert("JSON 파일을 읽지 못했습니다.")}
  };
  reader.readAsText(file);
});
function updateEditorForm(){
  $("songTitle").value=composition.title;$("instrument").value=composition.instrument;
  $("handMode").value=composition.handMode;$("tempo").value=composition.tempo;
}

/* ===== SAVE ===== */
function waitForAuthentication(timeout){
  return new Promise(resolve=>{
    if(authReady&&currentUser){resolve(true);return}
    const started=Date.now();
    const timer=setInterval(()=>{
      if(authReady&&currentUser){clearInterval(timer);resolve(true)}
      else if(Date.now()-started>=timeout){clearInterval(timer);resolve(false)}
    },100);
  });
}
window.saveCurrentSong=async function(){
  if(!firebaseReady){alert("Firebase가 연결되지 않았습니다.");return}
  if(!authReady){
    setFirebaseStatus("wait","🔐 Firebase 인증 완료 대기 중...");
    if(!await waitForAuthentication(8000)){
      alert("Firebase 인증에 실패했습니다.\n\nFirebase Console → Authentication → Sign-in method → Anonymous를 확인해주세요.");
      return;
    }
  }
  if(!composition.notes.length){alert("먼저 음악을 만들어주세요.");return}
  try{
    validateHands(composition.notes,composition.handMode);
    await saveSong(db,currentUser.uid,composition);
    alert("🎉 Firebase에 저장했습니다!");
    await loadSongs();
  }catch(err){console.error(err);alert("Firebase 저장 실패\n\n"+err.message)}
};

$("ownSongs").onchange=renderSongGrid;
/* ===== LOAD SONGS ===== */
async function loadSongs(){
  const grid=$("songGrid");
  if(!firebaseReady){grid.innerHTML=`<div class="empty">Firebase 연결을 기다리는 중...</div>`;return}
  try{
    songsCache=await listSongs(db);
    renderSongGrid();loadGameSongs();
  }catch(err){
    console.error(err);
    grid.innerHTML=`<div class="empty">❌ 음악을 불러오지 못했습니다.<br><br>${escapeHTML(err.message)}</div>`;
  }
}
function instrumentIcon(i){return i==="violin"?"🎻":i==="guitar"?"🎸":i==="drum"?"🥁":"🎹"}
function renderSongGrid(){
  const grid=$("songGrid");grid.innerHTML="";
  if(!songsCache.length){grid.innerHTML=`<div class="empty">아직 저장된 음악이 없습니다.</div>`;return}
  const visibleSongs=$("ownSongs").checked?songsCache.filter(s=>s.owner===currentUser?.uid):songsCache;
  if(!visibleSongs.length){grid.textContent="이 계정에 저장된 음악이 없습니다.";return}
  visibleSongs.forEach(song=>{
    const card=document.createElement("div");card.className="song-card";
    card.innerHTML=`<h3>${instrumentIcon(song.instrument)} ${escapeHTML(song.title||"제목 없음")}</h3>
    <div class="song-meta">BPM ${song.tempo||120}<br>${song.notes?.length||0}개 음표<br>${song.handMode==="one"?"한 손":song.handMode==="four"?"포 핸드":"두 손"}</div>
    <div class="toolbar"><button class="primary">▶ 재생</button><button class="secondary">🎼 제작으로 가져오기</button></div>`;
    card.querySelector(".primary").onclick=()=>startPlayback(song);
    card.querySelector(".secondary").onclick=()=>{
      composition=normalizeSong(song);updateEditorForm();refreshAll();showScreen("create");
    };
    grid.appendChild(card);
  });
}

/* ===== PLAYER PIANO / LANES ===== */
function buildPlayerPiano(id){
  const piano=$(id);piano.innerHTML="";
  ALL.forEach(note=>{
    const k=document.createElement("div");
    k.className="player-key"+(note.includes("#")?" black":"");
    k.dataset.note=note;k.textContent=note;
    if(id==="gamePiano")k.addEventListener("pointerdown",()=>gameInput(note));
    piano.appendChild(k);
  });
}
function buildLanes(id){
  const c=$(id);c.innerHTML="";
  for(let i=0;i<ALL.length;i++){const l=document.createElement("div");l.className="lane";c.appendChild(l)}
}

/* ===== 공통: 시작 오버레이 ===== */
function showStageOverlay(stageId,value,size=48){
  const stage=$(stageId);if(!stage)return;
  let o=stage.querySelector(".stage-overlay");
  if(!o){
    o=document.createElement("div");o.className="stage-overlay";
    o.style.cssText="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:9999;pointer-events:none;font-weight:900;line-height:1.2;text-align:center;color:#111;background:rgba(255,255,255,.86);white-space:pre-line;padding:20px";
    stage.appendChild(o);
  }
  o.style.fontSize=size+"px";o.textContent=value;
}
function removeStageOverlay(stageId){
  const s=$(stageId),o=s&&s.querySelector(".stage-overlay");
  if(o)o.remove();
}

/* 떨어지는 음표 그리기 (재생/게임 공통) */
/* ===== PLAYBACK (카운트다운 없음) ===== */
window.setPlaybackView=function(view){
  playbackView=view;
  $("playStage").classList.toggle("hidden",view!=="falling");
  $("playStaffWrap").classList.toggle("hidden",view!=="staff");
  renderPlaybackStaff();
};
function renderPlaybackStaff(){
  const staff=$("playStaff"),layer=$("playStaffContent");
  if(!staff||!layer||!playback.song)return;
  layer.innerHTML="";
  const notes=playback.song.notes||[];
  staff.style.width=Math.max(1100,Math.max(16,maxBeatOf(playback.song))*70+60)+"px";
  notes.forEach(item=>{
    if(item.type==="rest")return;
    const el=document.createElement("div");el.className="staff-note";
    el.style.left=(45+Number(item.start||0)*70)+"px";el.style.top=noteToStaffY(item.note)+"px";
    layer.appendChild(el);
  });
}
function startPlayback(song){
  stopPlayback();
  if(!song){alert("재생할 음악이 없습니다.");return}
  song.notes=song.notes||[];
  ensureAudio();
  playback.active=true;playback.song=song;playback.scheduled=new Set();playback.startedAt=null;
  playback.endSeconds=maxBeatOf(song)*60/(Number(song.tempo)||120);
  $("playbackPanel").classList.remove("hidden");
  $("playTitle").textContent=song.title||"음악";
  $("playInstrument").textContent=instrumentIcon(song.instrument)+" "+(song.instrument==="violin"?"바이올린":song.instrument==="guitar"?"기타":song.instrument==="drum"?"드럼":"피아노");
  buildLanes("playLanes");buildPlayerPiano("playPiano");
  $("playNotes").innerHTML="";
  renderPlaybackStaff();setPlaybackView(playbackView);
  showStageOverlay("playStage","SPACE 또는\n화면 터치로 시작");
  setTimeout(()=>$("playbackPanel").scrollIntoView({behavior:"smooth",block:"start"}),30);
}
function beginPlayback(){
  if(!playback.active||playback.startedAt!==null)return;
  ensureAudio();removeStageOverlay("playStage");
  playback.startedAt=audioContext.currentTime+.05;
  const beatSec=60/(Number(playback.song.tempo)||120);
  const pump=()=>scheduleAhead(playback.song,playback.startedAt,audioContext.currentTime,playback.scheduled,playTone);pump();playback.scheduler=setInterval(pump,25);
  renderPlayback();
}
function renderPlayback(){
  if(!playback.active||playback.startedAt===null)return;
  const song=playback.song,stage=$("playStage");
  if(stage.clientHeight===0||stage.clientWidth===0){playback.raf=requestAnimationFrame(renderPlayback);return}
  const beatSec=60/(Number(song.tempo)||120);
  const elapsed=(audioContext.currentTime-playback.startedAt),beat=elapsed/beatSec;
  if(playbackView==="staff"){const c=$("playStaffCursor");if(c)c.style.left=(45+beat*70)+"px"}
  drawNotes($("playNotes"),stage,song,beat,null);
  $("playTime").textContent=formatTime(elapsed);
  if(elapsed>playback.endSeconds+1){stopPlayback();return}
  playback.raf=requestAnimationFrame(renderPlayback);
}
window.stopPlayback=function(){
  if(uploadedAudio)uploadedAudio.pause();stopAllTones();
  clearInterval(playback.scheduler);playback.scheduler=null;playback.startedAt=null;removeStageOverlay("playStage");
  if(playback.raf)cancelAnimationFrame(playback.raf);
  playback.raf=null;playback.active=false;playback.song=null;playback.scheduled.clear();
  const n=$("playNotes");if(n)n.innerHTML="";
  const p=$("playbackPanel");if(p)p.classList.add("hidden");
};

/* ===== GAME (3-2-1 카운트다운) ===== */
function configureGameHand(){const song=songsCache[Number($("gameSong").value)];if(!song)return;const previous=$("gameHand").value;$("gameHand").innerHTML='<option value="0">모든 손 함께</option>'+Array.from({length:song.handMode==='one'?1:song.handMode==='four'?4:2},(_,i)=>`<option value="${i+1}">손 ${i+1} 파트</option>`).join('');if([...$("gameHand").options].some(o=>o.value===previous))$("gameHand").value=previous}

function loadGameSongs(){
  const sel=$("gameSong");if(!sel)return;
  sel.innerHTML="";
  if(!songsCache.length){sel.innerHTML=`<option value="">저장된 음악 없음</option>`;return}
  songsCache.forEach((s,i)=>{
    const o=document.createElement("option");o.value=i;o.textContent=s.title||`음악 ${i+1}`;sel.appendChild(o);
  });
  configureGameHand();updateLeaderboard();
}
window.startGame=function(){
  stopGame();
  const song=songsCache[Number($("gameSong").value)];
  if(!song){alert("플레이할 음악을 선택해주세요.");return}
  if(!song.notes||!song.notes.length){alert("이 음악에는 플레이할 음표가 없습니다.");return}
  ensureAudio();
  Object.assign(game,{song,active:true,score:0,combo:0,hits:0,misses:0,judged:0,hitNotes:new Set(),startedAt:null,countdownActive:false});
  game.totalSeconds=maxBeatOf(song)*60/(Number(song.tempo)||120)+2;
  const panel=$("gamePanel");panel.classList.remove("hidden");
  $("gameTitle").textContent=song.title||"Music Game";
  configureGameHand();$("gameHand").disabled=true;
  buildLanes("gameLanes");buildPlayerPiano("gamePiano");
  $("gameNotes").innerHTML="";$("gameProgress").textContent="0%";
  updateGameStats();
  showStageOverlay("gameStage","SPACE 또는\n화면 터치로 시작");
  setTimeout(()=>panel.scrollIntoView({behavior:"smooth",block:"start"}),50);
};
function beginGameCountdown(){
  if(!game.active||game.countdownActive||game.startedAt!==null)return;
  ensureAudio();
  game.countdownActive=true;
  let count=3;
  showStageOverlay("gameStage",count,120);
  clearInterval(game.countdownTimer);
  game.countdownTimer=setInterval(()=>{
    count--;
    if(count>0){showStageOverlay("gameStage",count,120);return}
    clearInterval(game.countdownTimer);game.countdownTimer=null;game.countdownActive=false;
    removeStageOverlay("gameStage");
    ensureAudio();game.startedAt=audioContext.currentTime;
    renderGame();
  },1000);
}
function renderGame(){
  if(!game.active||game.startedAt===null)return;
  const song=game.song,stage=$("gameStage");
  if(stage.clientWidth===0||stage.clientHeight===0){game.raf=requestAnimationFrame(renderGame);return}
  const beatSec=60/(Number(song.tempo)||120);
  const elapsed=(audioContext.currentTime-game.startedAt),beat=elapsed/beatSec;
  drawNotes($("gameNotes"),stage,song,beat,game.hitNotes);
  const range=Number($("judgeRange").value);
  song.notes.forEach(n=>{
    if(n.type==="rest"||game.hitNotes.has(n.id))return;
    const hand=Number($("gameHand").value);if(hand&&handFor(n.note,song.handMode)!==hand)return;
    if(beat>Number(n.start)+range){game.hitNotes.add(n.id);game.misses++;game.judged++;game.combo=0}
  });
  updateGameStats();
  $("gameProgress").textContent=`${Math.round(Math.min(100,Math.max(0,elapsed/game.totalSeconds*100)))}%`;
  if(elapsed>=game.totalSeconds){finishGame();return}
  game.raf=requestAnimationFrame(renderGame);
}
function gameInput(note){
  if(!game.active||game.startedAt===null)return;
  const activeHand=Number($("gameHand").value);if(activeHand&&handFor(note,game.song.handMode)!==activeHand)return;
  playTone(note,.18,game.song.instrument);
  flashGameKey(note);
  const beatSec=60/(Number(game.song.tempo)||120);
  const beat=(audioContext.currentTime-game.startedAt)/beatSec;
  const range=Number($("judgeRange").value);
  const {target,best}=nearestNote(game.song.notes,game.hitNotes,note,beat,range);
  if(target){
    game.hitNotes.add(target.id);game.hits++;game.judged++;
    const {points,text}=judgment(best,game.combo);game.score+=points;game.combo++;
    showJudge(text);
  }else{game.misses++;game.judged++;game.combo=0;showJudge("MISS")}
  updateGameStats();
}
function flashGameKey(note){
  const k=document.querySelector(`#gamePiano .player-key[data-note="${note}"]`);if(!k)return;
  k.classList.add("active");setTimeout(()=>k.classList.remove("active"),100);
}
function showJudge(text){
  const el=$("judgeResult");el.textContent=text;el.classList.remove("show");void el.offsetWidth;el.classList.add("show");
}
function updateGameStats(){
  $("gameScore").textContent=game.score;$("gameCombo").textContent=game.combo;
  $("gameAccuracy").textContent=`${game.judged?Math.round(game.hits/game.judged*100):100}%`;
}
window.stopGame=function(){
  $("gameHand").disabled=false;
  if(uploadedAudio)uploadedAudio.pause();stopAllTones();
  clearInterval(game.countdownTimer);game.countdownTimer=null;game.countdownActive=false;game.startedAt=null;
  removeStageOverlay("gameStage");
  if(game.raf)cancelAnimationFrame(game.raf);
  game.raf=null;game.active=false;game.song=null;game.hitNotes.clear();
  const l=$("gameNotes");if(l)l.innerHTML="";
};
function finishGame(){
  $("gameHand").disabled=false;
  if(!game.active)return;
  game.active=false;
  if(game.raf)cancelAnimationFrame(game.raf);
  game.raf=null;updateGameStats();saveGameScore();
  setTimeout(()=>alert(`플레이 종료!\n\n점수: ${game.score}\n정확도: ${$("gameAccuracy").textContent}`),50);
}

/* ===== 시작 트리거: 스페이스바 / 화면 터치 ===== */
function handleStartTrigger(){
  if(playback.active&&playback.startedAt===null)beginPlayback();
  else if(game.active&&game.startedAt===null&&!game.countdownActive)beginGameCountdown();
}
document.addEventListener("keydown",e=>{
  if(e.code!=="Space")return;
  const t=e.target;
  if(t&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.tagName==="SELECT"||t.isContentEditable))return;
  if((playback.active&&playback.startedAt===null)||(game.active&&game.startedAt===null)){
    e.preventDefault();handleStartTrigger();
  }
});
["playStage","gameStage"].forEach(id=>{
  $(id).addEventListener("pointerdown",e=>{
    if(e.target.closest(".player-piano"))return;
    handleStartTrigger();
  });
});

/* ===== KEYBOARD ===== */
document.addEventListener("keydown",e=>{
  if(e.repeat)return;
  if(game.active){
    const note=KEYMAP[e.key.toLowerCase()];
    if(note){e.preventDefault();gameInput(note)}
    return;
  }
  if(e.key==="Enter"&&selectedKeys.size>0){
    const tag=(e.target?.tagName||"").toLowerCase();
    if(tag!=="textarea"&&tag!=="button"&&tag!=="select"){e.preventDefault();addSelectedNotes()}
  }
});

/* ===== LEADERBOARD ===== */
async function saveGameScore(){
  if(!firebaseReady||!authReady||!currentUser||!game.song)return;
  try{
    await saveScore(db,game.song.songId,{uid:currentUser.uid,nickname:'Anonymous'+(Number($("gameHand").value)?' · 손 '+$("gameHand").value:''),part:Number($("gameHand").value),score:game.score,accuracy:Number($("gameAccuracy").textContent.replace('%',''))});
    updateLeaderboard();
  }catch(err){console.warn("Score save:",err)}
}
async function updateLeaderboard(){
  const box=$("leaderboard"),sel=$("gameSong");
  if(!box||!sel||!songsCache.length)return;
  const song=songsCache[Number(sel.value)];if(!song)return;
  if(!song.songId){box.innerHTML="이 음악에는 Firebase ID가 없습니다.";return}
  try{
    const scores=await listScores(db,song.songId);
    if(!scores.length){box.innerHTML=`<div class="empty">아직 기록이 없습니다.</div>`;return}
    box.innerHTML="";
    scores.forEach((s,i)=>{
      const row=document.createElement("div");row.className="note-row";
      row.innerHTML=`<span><b>${i+1}위</b> · ${escapeHTML(s.nickname||"Anonymous")}</span><span>${s.score||0}점 · ${s.accuracy||0}%</span>`;
      box.appendChild(row);
    });
  }catch(err){console.warn(err);box.innerHTML=`<div class="empty">리더보드를 불러오지 못했습니다.</div>`}
}
$("gameSong").addEventListener("change",()=>{stopGame();configureGameHand();updateLeaderboard()});

/* ===== FORM ===== */
$("songTitle").addEventListener("input",e=>composition.title=e.target.value);
$("instrument").addEventListener("change",e=>composition.instrument=e.target.value);
$("handMode").addEventListener("change",e=>{try{validateHands(composition.notes,e.target.value);composition.handMode=e.target.value}catch(error){e.target.value=composition.handMode;alert(error.message)}});
$("tempo").addEventListener("input",e=>composition.tempo=Math.max(30,Math.min(300,Number(e.target.value)||120)));

/* ===== HELPER ===== */
function formatTime(s){
  s=Math.max(0,s);
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,"0")}`;
}
function escapeHTML(v){
  return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
window.addEventListener("beforeunload",()=>{
  stopPlayback();stopGame();
  if(audioContext)audioContext.close().catch(()=>{});
});

/* ===== INIT ===== */
buildEditorPiano();
buildPlayerPiano("playPiano");buildPlayerPiano("gamePiano");
buildLanes("playLanes");buildLanes("gameLanes");
renderTimeline();renderNoteList();
initFirebase();
document.addEventListener("visibilitychange",()=>{if(document.hidden){stopPlayback();stopGame()}});

