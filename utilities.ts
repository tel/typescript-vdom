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

/** Iterate a function over all values in an array. */
export function iterArray<A>(n: number, ary: Array<A>, fn: (a: A) => any): void {
  var i: number;
  for (i = 0; i < n; i++) { fn(ary[i]); };
}