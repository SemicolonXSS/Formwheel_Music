/* ===== NOTES ===== */
const NAMES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const ALL=[];
for(let o=3;o<=5;o++)for(const n of NAMES)ALL.push(n+o);
const IDX=Object.fromEntries(ALL.map((n,i)=>[n,i]));
const KEYMAP={z:"C3",s:"C#3",x:"D3",d:"D#3",c:"E3",v:"F3",g:"F#3",b:"G3",h:"G#3",n:"A3",j:"A#3",m:"B3",
q:"C4",2:"C#4",w:"D4",3:"D#4",e:"E4",r:"F4",5:"F#4",t:"G4",6:"G#4",y:"A4",7:"A#4",u:"B4",
i:"C5",9:"C#5",o:"D5",0:"D#5",p:"E5","[":"F5","=":"F#5","]":"G5"};


export {ALL,IDX,KEYMAP};
