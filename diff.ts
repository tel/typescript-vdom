import { VTree, VNode, VText, Thunk, Widget, VHook, Props } from 'vtree';
import { VPatch, VPatchSet } from 'vpatch';
import { iter, iterSparseArray, iterArray, iterSlots, Dict, Keyed } from 'utilities';

export function diff(a: VTree, b: VTree): VPatchSet {
  var patch: VPatchSet = { node0: a, patches: [] };
  walk(a, b, patch, 0);
  return patch
}

/** Build up the patch argument by walking over the VTrees together. Effectful. */
function walk(a: VTree, b: VTree, patch: VPatchSet, index: number): void {
  // Short-circuit the whole process if the two are reference-equal
  if (a === b) { return };

  var apply = patch.patches[index];
  var patchCount = apply.length;
  var mustClear = false;

  // INDUCTION on b
  if (b === null) {
    
    // If a is a widget we will add a remove patch for it
    // Otherwise any child widgets/hooks must be destroyed.
    // This prevents adding two remove patches for a widget.
    if (!(a instanceof Widget)) {
      clearState(a, patch, index)
      apply = apply.slice(0, patchCount);
    }
    apply.push(new VPatch.REMOVE(a));
    
  } else if (a instanceof Thunk || b instanceof Thunk) {
    
    thunks(a, b, patch, index);
    
  } else if (b instanceof VNode) {
    
    // If a is a VNode and the two "match" at the top level...
    if (a instanceof VNode && a.tagName === b.tagName && a.key === b.key ) {
      
      // (1) Difference the properties
      var propsPatch = diffProps(a.properties, b.properties);
      if (propsPatch) {
        apply.push(new VPatch.PROPS(a, propsPatch));
      }
      
      // (2) Difference the children recursively
      diffChildren(a, b, patch, apply, index);
        
    } 
    // When they don't "match" we just replace a wholesale
    else {
      apply.push(new VPatch.VNODE(a, b));
      mustClear = true;
    } 
      
  } else if (b instanceof VText) {
    
    if (a instanceof VText && a.text !== b.text) {
      apply.push(new VPatch.VTEXT(a, b));
    } else {
      apply.push(new VPatch.VTEXT(a, b));
      mustClear = true
    }
    
  } else if (b instanceof Widget) {
    
    if (a instanceof Widget) {
      apply.push(new VPatch.WIDGET(a, b));
    } else {
      apply.push(new VPatch.WIDGET(a, b));
      mustClear = true;
    }
         
  }
    
  // If we decided we needed to clear out the old patch at
  // any point then we'll do that now at the end, just once.
  if (mustClear) {
    clearState(a, patch, index)
  }
}

function diffChildren(a: VNode, b: VNode, patch: VPatchSet, apply: Array<VPatch>, index: number): void {
    var aChildren  = a.children;
    var orderedSet = reorder(aChildren, b.children);
    var bChildren  = orderedSet.children;

    var aLen = aChildren.length;
    var bLen = bChildren.length;
    var len  = Math.max(aLen, bLen);

    iter(len, (i) => {
      var leftNode  = aChildren[i];
      var rightNode = bChildren[i];
      index += 1;
      
      if (!leftNode && rightNode) {
        // Excess nodes in b need to be added
        apply.push(new VPatch.INSERT(rightNode));
      } else {
        walk(leftNode, rightNode, patch, index);
      }
      
      if (leftNode instanceof VNode) { 
        index += leftNode.count; 
      }

    })    

    if (orderedSet.moves) {
      apply.push(new VPatch.ORDER(a, orderedSet.moves));
    }
}

/** Clean all hooks and widgets in a given tree. */
function clearState(vNode: VTree, patch: VPatchSet, index: number): void {
  // TODO: Make this a single walk, not two
  clearState.unhook(vNode, patch, index);
  clearState.destroyWidgets(vNode, patch, index);
}

module clearState {
  // Patch records for all destroyed widgets must be added because we need
  // a DOM node reference for the destroy function
  export function destroyWidgets(vNode: VTree, patch: VPatchSet, index: number) {
    if (vNode instanceof Widget) {
      patch.patches[index].push(new VPatch.REMOVE(vNode));
    } 
    else if (vNode instanceof VNode && (vNode.hasWidgets || vNode.hasThunks)) {
      iterArray(vNode.children.length, vNode.children, (child, i) => {
        index += 1;
        destroyWidgets(child, patch, index);
        if (child instanceof VNode) { 
          index += child.count; 
        }
      })
    } else if (vNode instanceof Thunk) {
      thunks(vNode, null, patch, index);
    }
  }

  // Execute hooks when two nodes are identical
  export function unhook(vNode: VTree, patch: VPatchSet, index: number) {
    if (vNode instanceof VNode) {
      
      if (vNode.hooks) {
        // Remove each hook
        patch.patches[index].push(
          new VPatch.PROPS(vNode, undefinedKeys(vNode.hooks))
        );
      }

      if (vNode.descendantHooks || vNode.hasThunks) {
        iterArray(vNode.children.length, vNode.children, (child, i) => {
          index += 1;
          unhook(child, patch, index);
          if (child instanceof VNode) { 
            index += child.count; 
          }
        });
      }
      
    } else if (vNode instanceof Thunk) {
      thunks(vNode, null, patch, index);
    }
  }
}

// Create a sub-patch for thunks
function thunks(a: VTree, b: VTree, patch: VPatchSet, index: number): void {
  var nodes = Thunk.handle(a, b);
  var thunkPatch = diff(nodes.a, nodes.b);
  if (hasPatches(thunkPatch)) {
    patch.patches[index] = [new VPatch.THUNK(null, thunkPatch)];
  }
}

/** Does a patchset have any actual patches in it? */
function hasPatches(patch: VPatchSet): boolean {
  iterSparseArray(patch.patches, () => { return true; });
  return false;
}

/** Undefine all of the names in a dictionary. */
function undefinedKeys<A>(obj: Dict<A>): Dict<typeof undefined> {
    var result: Dict<any> = {};
    iterSlots(obj, (key, value) => {
      result[key] = undefined;
    })
    return result;
}

// List diff, naive left to right reordering
function reorder<A extends Keyed>(aChildren: Array<A>, bChildren: Array<A>): { children: Array<A>, moves: VPatch.Moves } {
    // Each is O(M) time, O(M) memory
    var { keys: bKeys, free: bFree } = keyIndex(bChildren)
    var { keys: aKeys, free: aFree } = keyIndex(aChildren)

    // If there are no keyed elements in the a-array or no keyed elements
    // in the b-array then we can do no matching and should just return
    // the b-array directly.
    if (aFree.length === aChildren.length || bFree.length === bChildren.length) { 
      return { children: bChildren, moves: null }; 
    }

    // O(MAX(N, M)) memory
    // TODO: Learn this
    var newChildren = []

    var freeIndex = 0
    var freeCount = bFree.length
    var deletedItems = 0

    // Iterate through a and match a node in b
    // O(N) time,
    for (var i = 0 ; i < aChildren.length; i++) {
        var aItem = aChildren[i]
        var itemIndex

        if (aItem.key) {
            if (bKeys.hasOwnProperty(aItem.key)) {
                // Match up the old keys
                itemIndex = bKeys[aItem.key]
                newChildren.push(bChildren[itemIndex])

            } else {
                // Remove old keyed items
                itemIndex = i - deletedItems++
                newChildren.push(null)
            }
        } else {
            // Match the item in a with the next free item in b
            if (freeIndex < freeCount) {
                itemIndex = bFree[freeIndex++]
                newChildren.push(bChildren[itemIndex])
            } else {
                // There are no free items in b to match with
                // the free items in a, so the extra free nodes
                // are deleted.
                itemIndex = i - deletedItems++
                newChildren.push(null)
            }
        }
    }

    var lastFreeIndex = freeIndex >= bFree.length ?
        bChildren.length :
        bFree[freeIndex]

    // Iterate through b and append any new keys
    // O(M) time
    for (var j = 0; j < bChildren.length; j++) {
        var newItem = bChildren[j]

        if (newItem.key) {
            if (!aKeys.hasOwnProperty(newItem.key)) {
                // Add any new keyed items
                // We are adding new items to the end and then sorting them
                // in place. In future we should insert new items in place.
                newChildren.push(newItem)
            }
        } else if (j >= lastFreeIndex) {
            // Add any leftover non-keyed items
            newChildren.push(newItem)
        }
    }

    var simulate = newChildren.slice()
    var simulateIndex = 0
    var removes = []
    var inserts = []
    var simulateItem

    for (var k = 0; k < bChildren.length;) {
        var wantedItem = bChildren[k]
        simulateItem = simulate[simulateIndex]

        // remove items
        while (simulateItem === null && simulate.length) {
            removes.push(remove(simulate, simulateIndex, null))
            simulateItem = simulate[simulateIndex]
        }

        if (!simulateItem || simulateItem.key !== wantedItem.key) {
            // if we need a key in this position...
            if (wantedItem.key) {
                if (simulateItem && simulateItem.key) {
                    // if an insert doesn't put this key in place, it needs to move
                    if (bKeys[simulateItem.key] !== k + 1) {
                        removes.push(remove(simulate, simulateIndex, simulateItem.key))
                        simulateItem = simulate[simulateIndex]
                        // if the remove didn't put the wanted item in place, we need to insert it
                        if (!simulateItem || simulateItem.key !== wantedItem.key) {
                            inserts.push({key: wantedItem.key, to: k})
                        }
                        // items are matching, so skip ahead
                        else {
                            simulateIndex++
                        }
                    }
                    else {
                        inserts.push({key: wantedItem.key, to: k})
                    }
                }
                else {
                    inserts.push({key: wantedItem.key, to: k})
                }
                k++
            }
            // a key in simulate has no matching wanted key, remove it
            else if (simulateItem && simulateItem.key) {
                removes.push(remove(simulate, simulateIndex, simulateItem.key))
            }
        }
        else {
            simulateIndex++
            k++
        }
    }

    // remove all the remaining nodes from simulate
    while(simulateIndex < simulate.length) {
        simulateItem = simulate[simulateIndex]
        removes.push(remove(simulate, simulateIndex, simulateItem && simulateItem.key))
    }

    // If the only moves we have are deletes then we can just
    // let the delete patch remove these items.
    if (removes.length === deletedItems && !inserts.length) {
        return {
            children: newChildren,
            moves: null
        }
    }

    return {
        children: newChildren,
        moves: {
            removes: removes,
            inserts: inserts
        }
    }
}

function remove<A>(arr: Array<A>, index: number, key: number): VPatch.Remove {
  arr.splice(index, 1);
  return { from: index, key: key };
}

interface KeyIndex {
  /** A hash of key name to index. */
  keys: { [key: string]: number };
  /** An array of unkeyed item indices. */
  free: Array<number>;
}

/** 
 * Produce a reverse mapping from keys of keyed items in an array along
 * with the index set of all unkeyed items.
 */
function keyIndex<A extends Keyed>(as: Array<A>): KeyIndex {
  var keys: { [key: string]: number } = {};
  var free: Array<number>             = [];
  
  iterArray(as.length, as, (a, i) => {
    if (a.key) { keys[a.key] = i }
    else { free.push(i) }
  });

  return { keys, free };
}

// TODO: Create tests...
function diffProps(a: Props, b: Props): Props {
    var diff: Dict<any> = {};

    iterSlots(a, (aKey, aValue) => {
      
      if (!(aKey in b)) { 
        diff[aKey] = undefined; 
      }
      
      var bValue = b[aKey];      
      if (!(aValue === bValue)) {
        
        if (bValue instanceof Number ) {
          diff[aKey] = bValue;
        } else if (bValue instanceof String) {
          diff[aKey] = bValue;
        } else if (bValue instanceof VHook) {
          if (aValue instanceof VHook) {
            // ...
          } else {
            diff[aKey] = bValue;
          }
        } else {
          var bDict = <Dict<string>> bValue;
          if ( aValue instanceof Number ||
               aValue instanceof String ||
               aValue instanceof VHook     ) {
            diff[aKey] = bValue;
          } else {
            var aDict = <Dict<string>> aValue;
            var dictDiff = diffProps(aDict, bDict);
            diff[aKey] = dictDiff;
          }
        }
         
      }
    });
    
    iterSlots(b, (bKey, bValue) => {
      if (!(bKey in a)) { diff[bKey] = bValue };
    })
    
    return diff;
}