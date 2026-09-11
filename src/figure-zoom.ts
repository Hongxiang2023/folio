export function zoomAtPoint(current:number,target:number,left:number,top:number,x:number,y:number){
 const zoom=Math.round(Math.max(25,Math.min(600,target))*10)/10;
 const ratio=zoom/current;
 return {zoom,left:(left+x)*ratio-x,top:(top+y)*ratio-y};
}
export function wheelZoom(current:number,delta:number,mode:number,pageHeight:number){
 const pixels=delta*(mode===1?16:mode===2?pageHeight:1);
 return current*Math.exp(-Math.max(-400,Math.min(400,pixels))*.002);
}
