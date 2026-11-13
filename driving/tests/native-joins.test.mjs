import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeJoins,nativePassword} from '../native-joins.mjs';
const actor='11111111-1111-4111-8111-111111111111';
test('native authorization is account-issued, short-lived, one-use and Steam-bound',()=>{
 let now=100000;const sessions=new Map([['nohesi-110',{ready:true,players:new Map(),tickets:new Map(),native:{host:'example.test'},relay:{nativeVehicles:()=>[],nativePassword:(id,steam)=>nativePassword('nohesi-110',id,steam,'test-only-key',now)}}]]);
 const joins=new NativeJoins(sessions,()=>now),grant=joins.issue(actor,'nohesi-110');assert.equal(grant.schema,2);assert.throws(()=>joins.issue(actor,'nohesi-110'),/Already/);
 assert.throws(()=>joins.redeem(grant.authorization,'not-steam'),/Invalid/);
 const redeemed=joins.redeem(grant.authorization,'76561198000000000');assert.equal(redeemed.host,'example.test');assert.equal(redeemed.room,'nohesi-110');assert.equal(redeemed.model,'06_ygt_53_nissan_350z');assert.equal(redeemed.schema,2);
 const password=redeemed.password,parts=password.split('.');
 assert.ok(password.length<240);assert.equal(Buffer.from(parts[1],'base64url').toString().split('|')[1],'76561198000000000');
 assert.throws(()=>joins.redeem(grant.authorization,'76561198000000000'),/already used/);
 now+=90001;const expired=joins.issue(actor,'nohesi-110');now+=90001;assert.throws(()=>joins.redeem(expired.authorization,'76561198000000000'),/expired/);
});
