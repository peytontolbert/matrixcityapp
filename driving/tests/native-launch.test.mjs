import test from 'node:test';import assert from 'node:assert/strict';
import {nativeLaunchUrl} from '../client/native-launch.js';
test('native join links select only the server; Assetto car selection follows Join in the launcher',()=>{
 assert.equal(nativeLaunchUrl('nohesi-110'),'matrixgames://join?game=assetto-corsa&server=managed-nohesi-110');
 assert.equal(nativeLaunchUrl('nohesi-415'),'matrixgames://join?game=assetto-corsa&server=managed-nohesi-415');
 for(const room of ['other','nohesi-110&model=car','nohesi-110\n',null])assert.throws(()=>nativeLaunchUrl(room));
});