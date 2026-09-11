type Box={x:number;y:number;width:number;height:number};
type Matrix=number[];
const multiply=(a:Matrix,b:Matrix):Matrix=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
// Raster images occupy a unit square in the current PDF graphics transform.
// Unknown/vector operations are left to the conservative caption fallback.
export function rasterImageBoxes(list:{fnArray:ArrayLike<number>;argsArray:ArrayLike<unknown>},ops:Record<string,number>,width:number,height:number):Box[]{
 if(!list.fnArray?.length||!list.argsArray)return [];
 let matrix:Matrix=[1,0,0,1,0,0];const stack:Matrix[]=[],boxes:Box[]=[];
 const imageOps=new Set([ops.paintImageXObject,ops.paintInlineImageXObject,ops.paintImageMaskXObject].filter(n=>typeof n==='number'));
 for(let i=0;i<list.fnArray.length;i++){
  const op=list.fnArray[i],args=list.argsArray[i] as unknown[]|null;
  if(op===ops.save){stack.push([...matrix]);continue;}
  if(op===ops.restore){matrix=stack.pop()||[1,0,0,1,0,0];continue;}
  if(op===ops.transform){if(args?.length===6&&args.every(n=>typeof n==='number'&&Number.isFinite(n)))matrix=multiply(matrix,args as number[]);continue;}
  if(op===ops.beginGroup){stack.push([...matrix]);const group=args?.[0] as {matrix?:number[]}|undefined;if(group?.matrix?.length===6)matrix=multiply(matrix,group.matrix);continue;}
  if(op===ops.endGroup){matrix=stack.pop()||[1,0,0,1,0,0];continue;}
  if(!imageOps.has(op))continue;
  const points=[[0,0],[0,1],[1,0],[1,1]].map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);
  const left=Math.max(0,Math.min(...points.map(p=>p[0]))),right=Math.min(width,Math.max(...points.map(p=>p[0]))),bottom=Math.max(0,Math.min(...points.map(p=>p[1]))),top=Math.min(height,Math.max(...points.map(p=>p[1])));
  if(right>left&&top>bottom&&[left,right,bottom,top].every(Number.isFinite))boxes.push({x:left/width,y:1-top/height,width:(right-left)/width,height:(top-bottom)/height});
 }
 return boxes;
}
