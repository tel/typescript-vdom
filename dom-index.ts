/**
 * Maps a virtual DOM tree onto a real DOM tree in an efficient manner.
 * 
 * We don't want to read all of the DOM nodes in the tree so we use
 * the in-order tree indexing to eliminate recursion down certain branches.
 * We only recurse into a DOM node if we know that it contains a child of
 * interest.
 */ 
 
 // TODO: Work through this module.

import { VNode } from 'vtree'

var noChild = {}

export interface NodeMapping {
  [index: number]: Node
}

export function domIndex
  ( rootNode: Node
  , tree: VNode
  , indices: Array<number>
  , nodes?: NodeMapping
  ): NodeMapping 
{
  if (!indices || indices.length === 0) {
    return {}
  } else {
    indices.sort(ascendingOrder)
    return recurse(rootNode, tree, indices, nodes || {}, 0)
  }
}

function recurse
  ( rootNode: Node
  , tree: VNode
  , indices: Array<number>
  , nodes: NodeMapping
  , rootIndex: number
  ): NodeMapping {
    if (rootNode) {
        if (indexInRange(indices, rootIndex, rootIndex)) {
            nodes[rootIndex] = rootNode
        }

        var vChildren = tree.children

        if (vChildren) {

            var childNodes = rootNode.childNodes

            for (var i = 0; i < tree.children.length; i++) {
                rootIndex += 1

                var vChild = vChildren[i] || noChild
                var nextIndex = rootIndex + (vChild.count || 0)

                // skip recursion down the tree if there are no nodes down here
                if (indexInRange(indices, rootIndex, nextIndex)) {
                    recurse(childNodes[i], vChild, indices, nodes, rootIndex)
                }

                rootIndex = nextIndex
            }
        }
    }

    return nodes
}

/** 
 * Verifies that *some* index in sorted list indices is in the range (left, right).
 */
function indexInRange(indices: Array<number>, left: number, right: number): boolean {
  var minIndex = 0;
  var maxIndex = indices.length - 1;
  var currentIndex: number;
  var currentItem: number;

  while (minIndex <= maxIndex) {
    // The Math.floor operation here was originally implemented as a right shift
    // e.g, (\x -> x >> 0). While this might be faster [0] it is CERTAINLY harder
    // to read and understand.
    //
    // [0]: http://arnorhs.com/2012/05/30/comparing-the-performance-of-math-floor-parseint-and-a-bitwise-shift/
    currentIndex = Math.floor((maxIndex + minIndex) / 2);
    currentItem = indices[currentIndex];

    if (minIndex === maxIndex) {
      return currentItem >= left && currentItem <= right;
    } else if (currentItem < left) {
      minIndex = currentIndex + 1;
    } else if (currentItem > right) {
      maxIndex = currentIndex - 1;
    } else {
      return true;
    }
  }

  return false;
}

function ascendingOrder(a: number, b: number): number {
    return a > b ? 1 : -1
}