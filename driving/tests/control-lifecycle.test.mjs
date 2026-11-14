import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingControls} from '../client/controls-ui.js';
test('device disconnect and settings dialog brake; paddle holds shift once',t=>{
 const originals=new Map(),listeners=new Map(),elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',open:false,textContent:'',replaceChildren(){},add(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);};
 const pad={id:'controller',mapping:'standard',connected:true,axes:[0],buttons:Array.from({length:8},()=>({value:0}))};let pads=[pad];
 const globals={document:{querySelector:element,querySelectorAll:()=>[],body:{classList:{contains:()=>true}},addEventListener(){},pointerLockElement:null},navigator:{getGamepads:()=>pads},localStorage:{getItem:()=>null,setItem(){}},Option:class{},addEventListener:(name,fn)=>listeners.set(name,fn)};
 for(const [name,value] of Object.entries(globals)){originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,value});}
 const controls=new DrivingControls({addEventListener(){}},new Set(),()=>{});
 t.after(()=>{clearInterval(controls.timer);for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
 const state={focused:true,ready:true,stale:false,direction:1};pad.buttons[7].value=.7;
 assert.equal(controls.sample(state).throttle,.7);
 pad.buttons[5].value=1;assert.equal(controls.sample(state).gear,2);assert.equal(controls.sample(state).gear,2);
 pad.buttons[5].value=0;controls.sample(state);pad.buttons[5].value=1;assert.equal(controls.sample(state).gear,3);
 pads=[];assert.equal(controls.sample(state).brake,1);assert.equal(controls.sample(state).throttle,0);
 pads=[pad];assert.equal(controls.sample(state).throttle,0,'reconnect must not silently restore held throttle');
 element('#controls-resume').onclick();assert.equal(controls.sample(state).throttle,.7);
 controls.dialog.open=true;assert.equal(controls.sample(state).throttle,0);assert.equal(controls.sample(state).brake,1);
 controls.dialog.open=false;assert.equal(controls.sample({...state,stale:true}).throttle,0);
});
