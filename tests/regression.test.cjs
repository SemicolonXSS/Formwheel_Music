const assert=require('node:assert/strict');
(async()=>{const {normalizeSong,handFor,validateHands}=await import('../modules/editor.js');const {scheduleAhead}=await import('../modules/player.js');const {nearestNote,judgment}=await import('../modules/game.js');
const n={type:'note',note:'C3',start:0,duration:1};assert.equal(normalizeSong({notes:[n],tempo:900}).tempo,300);for(const invalid of [{...n,note:'X4'},{...n,start:-1},{...n,duration:Infinity}])assert.throws(()=>normalizeSong({notes:[invalid]}));
assert.equal(handFor('C3','one'),1);assert.equal(handFor('B5','two'),2);assert.equal(handFor('B5','four'),4);assert.throws(()=>validateHands(Array.from({length:6},(_,i)=>({...n,note:['C3','D3','E3','F3','G3','A3'][i]})),'one'));
const song={tempo:120,instrument:'piano',notes:Array.from({length:20},(_,i)=>({...n,id:String(i),start:i*.5}))};
// Scheduling is independent of render FPS; audio timestamps must be identical.
const results=[];for(const fps of [15,30,60,120]){const scheduled=new Set(),played=[];let clock=0,nextRender=0;for(let tick=0;tick<=220;tick++){clock=tick*.025;while(nextRender<clock)nextRender+=1/fps;scheduleAhead(song,.05,clock,scheduled,(note,duration,instrument,when)=>played.push(when))}assert.equal(played.length,20);results.push(played)}for(const r of results)assert.deepEqual(r,results[0]);assert.equal(results[0][4],1.05);
const target=nearestNote([{...n,id:'x'}],new Set(),'C3',.05,.2);assert.equal(target.target.id,'x');assert.equal(judgment(.05,2).points,110);assert.equal(nearestNote([{...n,id:'x'}],new Set(['x']),'C3',0,.2).target,null);
console.log('PASS note validation, hand limits/partition, 15/30/60/120 FPS-independent audio schedule, judging and replay');})().catch(e=>{console.error(e);process.exitCode=1});
