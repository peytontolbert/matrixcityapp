import {createHash} from 'node:crypto';
import {validateAssettoDynamics} from './vendor/js/gameplay/assetto_dynamics_validation.js';

// Identity of the inspected export and its native source. This locks data
// versions; it does not certify equivalence of the independent physics solvers.
export const VEHICLE_PROFILE=Object.freeze({
 model:'06_ygt_53_nissan_350z',
 path:'physics/assetto-corsa/06_ygt_53_nissan_350z.json',
 profileSha256:'45c64993d8862e029cc3c3e49db8f577353ae26785df27615b594cc25a544b12',
 dataAcdSha256:'315cf01d11a866e830611db6f742800147738692b6474d299044db2dc5cd4773',
});
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyNativeArchive(bytes){
 const hash=sha256(bytes);
 if(hash!==VEHICLE_PROFILE.dataAcdSha256)throw Error('Native data.acd differs from the browser physics source');
 return hash;
}
export function verifyProfileIdentity(bytes,expected=VEHICLE_PROFILE){
 if(sha256(bytes)!==expected.profileSha256)throw Error('Vehicle physics export checksum mismatch');
 const document=JSON.parse(bytes);
 if(document.schema!=='webglgta-assetto-corsa-profile-v1'||document.source?.carId!==expected.model
  ||document.source?.dataAcdSha256!==expected.dataAcdSha256
  ||document.tyreSource?.carId!==expected.model||document.tyreSource?.dataAcdSha256!==expected.dataAcdSha256)
  throw Error('Vehicle physics source does not match the native car archive');
 return document;
}
export function verifiedHandling(bytes){
 const document=verifyProfileIdentity(bytes),validation=validateAssettoDynamics(document.assettoHandling);
 if(!validation.valid)throw Error('Invalid car dynamics: '+validation.errors.join('; '));
 return document.assettoHandling;
}
