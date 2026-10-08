export let audioContext=null;
/* ===== AUDIO ===== */
export function ensureAudio(){
  if(!audioContext)audioContext=new AudioContext();
  if(audioContext.state==="suspended")audioContext.resume();
}
export function getFrequency(note){
  const m=note.match(/^([A-G])(#?)(\d)$/);if(!m)return 440;
  const base={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  let midi=12*(Number(m[3])+1)+base[m[1]];if(m[2])midi++;
  return 440*Math.pow(2,(midi-69)/12);
}
const activeTones = new Set();
export function stopAllTones(){

 for(const {osc,gain} of activeTones){try{osc.stop();}catch{}osc.disconnect();gain.disconnect();}
 activeTones.clear();
}
export function playTone(note,duration=.25,instrument="piano",when=null){
  ensureAudio();
  const ctx=audioContext;
  if(instrument==='drum'){
    const now=Math.max(ctx.currentTime,when??ctx.currentTime),kind=(note.match(/^([A-G])/)[1]),gain=ctx.createGain();let osc;
    const d=Math.min(.5,Math.max(.06,duration));
    if(['C','D'].includes(kind)){osc=ctx.createOscillator();osc.frequency.setValueAtTime(150,now);osc.frequency.exponentialRampToValueAtTime(45,now+d)}
    else{osc=ctx.createBufferSource();const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*d),ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;osc.buffer=buffer;const filter=ctx.createBiquadFilter();filter.type=['F','G','A','B'].includes(kind)?'highpass':'bandpass';filter.frequency.value=filter.type==='highpass'?7000:1800;osc.connect(filter);filter.connect(gain);osc._filter=filter}
    if(!osc._filter)osc.connect(gain);gain.gain.setValueAtTime(.45,now);gain.gain.exponentialRampToValueAtTime(.0001,now+d);gain.connect(ctx.destination);
    const tone={osc,gain};activeTones.add(tone);osc.onended=()=>{activeTones.delete(tone);osc.disconnect();osc._filter?.disconnect();gain.disconnect()};osc.start(now);osc.stop(now+d+.01);return;
  }
  const osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.type=instrument==="violin"?"sawtooth":instrument==="guitar"?"triangle":"sine";
  osc.frequency.value=getFrequency(note);
  const now=Math.max(ctx.currentTime,when??ctx.currentTime),d=Math.max(.06,duration);
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(.3,now+.02);
  gain.gain.exponentialRampToValueAtTime(.0001,now+d);
  osc.connect(gain);gain.connect(ctx.destination);
  const tone={osc,gain};activeTones.add(tone);
  osc.onended=()=>{activeTones.delete(tone);osc.disconnect();gain.disconnect();};
  osc.start(now);osc.stop(now+d+.03);
}

