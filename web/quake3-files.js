export const REQUIRED_PAKS=Array.from({length:9},(_,i)=>`pak${i}.pk3`);
export function selectPaks(files){
 const found=new Map();let total=0;
 for(const file of files){
  const name=file.name.toLowerCase();if(!REQUIRED_PAKS.includes(name))continue;
  if(found.has(name))throw Error('More than one Quake III installation found. Select its baseq3 folder.');
  if(file.size<22||file.size>600*1024*1024)throw Error('Invalid size for '+name);
  total+=file.size;found.set(name,file);
 }
 const missing=REQUIRED_PAKS.filter(name=>!found.has(name));if(missing.length)throw Error('Choose the updated Quake III Arena baseq3 folder. Missing: '+missing.join(', '));
 if(total>650*1024*1024)throw Error('Game files exceed the supported size. Choose the original baseq3 files.');
 return REQUIRED_PAKS.map(name=>({name,file:found.get(name)}));
}
export async function readPaks(selection,onProgress=()=>{}){
 const result=[];
 for(const {name,file} of selection){
  onProgress('Reading '+name+' locally…');const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)throw Error(name+' is not a valid PK3 archive');
  result.push({name,bytes});
 }
 return result;
}
export async function findGameFolder(root){
 // Probe known install paths only; do not scan unrelated personal folders.
 const paths=[[],['baseq3'],['Quake 3 Arena','baseq3'],['common','Quake 3 Arena','baseq3'],['steamapps','common','Quake 3 Arena','baseq3']];
 for(const path of paths){
  try{
   let dir=root;for(const part of path)dir=await dir.getDirectoryHandle(part);
   await dir.getFileHandle('pak0.pk3');const files=[];
   for(const name of REQUIRED_PAKS){try{files.push(await(await dir.getFileHandle(name)).getFile());}catch{}}
   return selectPaks(files);
  }catch(e){if(e.message.startsWith('Choose the updated'))throw e;}
 }
 throw Error('Quake III Arena was not found. Select its baseq3 folder directly.');
}
