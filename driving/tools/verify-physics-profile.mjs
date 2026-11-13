import {readFile} from 'node:fs/promises';
import {VEHICLE_PROFILE,verifiedHandling,verifyNativeArchive,sha256} from '../vehicle-profile.mjs';

const [profileFile,nativeArchive]=process.argv.slice(2);
if(!profileFile||!nativeArchive)throw Error('Usage: node driving/tools/verify-physics-profile.mjs PROFILE.json CAR/data.acd');
const bytes=await readFile(profileFile),handling=verifiedHandling(bytes);
const archiveHash=verifyNativeArchive(await readFile(nativeArchive));
console.log(JSON.stringify({model:VEHICLE_PROFILE.model,profileSha256:sha256(bytes),dataAcdSha256:archiveHash,
 massKg:handling.mass,dataIdentityVerified:true,nativeHandlingParityVerified:false},null,2));
