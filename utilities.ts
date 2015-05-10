/** Iterate a function of the name and value over all slots in an object. */
export function iterSlots<V>(obj: { [key: string]: V }, fn: (key: string, value: V) => any): void {
  var key: string;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      var value: V = obj[key];
      fn(key, value);
    }
  }
} 

export function iterSparseArray<A>(ary: { [index: number]: A }, fn: (value: A, ix: number) => any): void {
  var index: any;
  for (index in ary) {
    if (ary.hasOwnProperty(index)) {
      var value: A = ary[index];
      fn(value, <number> index);
    }
  } 
}

/** Iterate a function over all values in an array. */
export function iterArray<A>(n: number, ary: Array<A>, fn: (a: A, i: number) => any): void {
  var i: number;
  for (i = 0; i < n; i++) { fn(ary[i], i); };
}