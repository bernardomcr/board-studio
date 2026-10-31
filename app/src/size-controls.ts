/** Slider windows can grow; they are navigation ranges, not object-size limits. */
export function sizeRangeMaximum(value:number,initial:number):number{
  return Math.max(initial,Math.min(Number.MAX_VALUE,value*2));
}
export function multipliedSize(value:number,factor:number,minimum=0):number{
  const result=Math.max(minimum,value)*factor;
  return Number.isFinite(result)?Math.max(minimum,result):Number.MAX_VALUE;
}
export function formatSize(value:number):string{
  return Number.isFinite(value)?String(Number(value.toPrecision(12))):'0';
}
