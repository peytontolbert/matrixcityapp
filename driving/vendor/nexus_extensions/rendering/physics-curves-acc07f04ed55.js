// Allocation-free fast path for already normalized curves. Unsorted/debug edits retain legacy semantics.
export function curveValue(points,x,fallback){
 if(!Array.isArray(points)||!points.length)return fallback;
 let valid=true,previous=-Infinity;
 for(let i=0;i<points.length;i++){const row=points[i];if(!Array.isArray(row)||!Number.isFinite(Number(row[0]))||!Number.isFinite(Number(row[1]))||Number(row[0])<previous){valid=false;break;}previous=Number(row[0]);}
 const rows=valid?points:points.filter(r=>Array.isArray(r)&&Number.isFinite(Number(r[0]))&&Number.isFinite(Number(r[1]))).sort((a,b)=>Number(a[0])-Number(b[0]));
 if(!rows.length)return fallback;if(x<=rows[0][0])return Number(rows[0][1]);
 let low=1,high=rows.length;while(low<high){const mid=(low+high)>>>1;if(x<=rows[mid][0])high=mid;else low=mid+1;}
 if(low===rows.length)return Number(rows.at(-1)[1]);const a=rows[low-1],b=rows[low];const t=Math.max(0,Math.min(1,(x-Number(a[0]))/Math.max(1e-6,Number(b[0])-Number(a[0]))));return Number(a[1])+(Number(b[1])-Number(a[1]))*t;
}
