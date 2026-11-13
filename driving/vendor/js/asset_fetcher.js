export async function fetchArrayBufferPreferredCompressed(url) {
 let r;
 if(!String(url).endsWith('.gz'))try{r=await fetch(String(url)+'.gz');}catch{}
 if(!r?.ok)r=await fetch(url);
 if(!r.ok){console.warn('Required asset unavailable',String(url));throw Error('Required vehicle or road content is unavailable ('+r.status+').');}
 const bytes=await r.arrayBuffer(),header=new Uint8Array(bytes);
 if(header[0]===31&&header[1]===139)return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 return bytes;
}
