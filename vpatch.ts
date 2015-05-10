/**
 * VPatch: the core type indicating changes between two VTrees. 
 */
 
import { VTree, VText, Widget, VNode, Props } from 'vtree';
import { createNode, CreateOptions } from 'create-node';
import { iterArray, iterSparseArray } from 'utilities';
import { applyProperties } from 'apply-properties';

export interface VPatchSet {
  patches: { [index: number]: Array<VPatch> };
  node0: VNode;
}

export interface PatchOptions {
  patch?: (rootNode: Node, patches: VPatchSet, config: PatchConfig) => Node;
  render?: (vTree: VTree, options: CreateOptions) => Node;
  document?: Document;
  warn?: (msg: string, vtree: VTree) => any;
}

export interface PatchConfig {
  patch: (rootNode: Node, patches: VPatchSet, config: PatchConfig) => Node;
  render: (vTree: VTree, options: CreateOptions) => Node;
  document: Document;
  warn: (msg: string, vtree: VTree) => any;
}

export interface NodeMap {
  [key: number]: Node;
}

export class VPatch {
  vTree: VTree;
  apply(node: Node, config: PatchConfig): Node { return node; }
}

export module VPatch {

  export class REMOVE extends VPatch {
    apply(node: Node, config: PatchConfig): Node {
      var parentNode = node.parentNode;
      if (parentNode) { parentNode.removeChild(node) }
      ensureWidgetDestroyed(this.vTree, node);
      return null
    }
  }
  
  export class INSERT extends VPatch {
    apply(node: Node, config: PatchConfig): Node {
      var newNode = config.render(this.vTree, config);
      if (node) { node.appendChild(newNode); }
      return node;
    }
  }
  
  export class STRING extends VPatch {
    constructor( public vText : VText ) { super(); }
    apply(node: Node, config: PatchConfig): Node {
      var newNode: Node;
  
      if (node.nodeType === 3) {
        var charNode = <CharacterData> node;
        charNode.replaceData(0, charNode.length, this.vText.text);
        newNode = charNode;
      } else {
        var parentNode = node.parentNode;
        newNode = config.render(this.vText, config)
  
        if (parentNode && newNode !== node) {
            parentNode.replaceChild(newNode, node)
        }
      }
  
      return newNode
    }
  }
  
  export class WIDGET extends VPatch {
    constructor( public widget : Widget ) { super(); }
    apply(node: Node, config: PatchConfig): Node {
      var priorVTree = this.vTree;
      var newNode: Node;
      
      if (priorVTree instanceof Widget) {
        var priorWidget = priorVTree;
        var updating = Widget.shouldUpdate(priorWidget, this.widget)
        
        if (updating) {
          newNode = this.widget.update(priorWidget, node) || node;
        } else {
          newNode = config.render(this.widget, config)
        }
        
        var parentNode = node.parentNode;
        
        if (parentNode && newNode !== node) {
          parentNode.replaceChild(newNode, node);
        }
        
        if (!updating) {
          ensureWidgetDestroyed(priorWidget, node);
        }
      }
      
      return newNode;
    }
  }
  
  export class VNODE extends VPatch {
    constructor( public vNode : VNode ) { super(); }
    apply(node: Node, config: PatchConfig): Node {
      var parentNode = node.parentNode;
      var newNode = config.render(this.vNode, config);
  
      if (parentNode && newNode !== node) {
          parentNode.replaceChild(newNode, node);
      }
  
      return newNode
    }
  }
  
  export class ORDER extends VPatch {
    constructor( public moves: Moves ) { super(); }
    apply(node: Node, config: PatchConfig): Node {
      reorderChildren(node, this.moves);
      return node;
    }
  }
  
  export class PROPS extends VPatch {
    constructor( public props: Props ) { super(); }
    apply(node: Node, config: PatchConfig): Node {
      var theVTree = this.vTree;
      if (theVTree instanceof VNode) {
        // Now we know that node must be an HTMLElement
        var el = <HTMLElement> node;
        applyProperties(el, this.props, theVTree.properties);
      }
      return node;
    }
  }
  
  export class THUNK extends VPatch {
    constructor( public thunkPatchset: VPatchSet ) { super(); }
    apply(node: Node, config: PatchConfig): Node {
    	var newNode = config.patch(node, this.thunkPatchset, config)
      return replaceRoot(node, newNode);
    }
  }
  
  export interface Remove {
    from: number;
    key?: number;
  }
  
  export interface Insert {
    to: number;
    key: number;
  }
  
  export interface Moves {
    removes: Array<Remove>;
    inserts: Array<Insert>
  }
  
  /**
   * TODO: Document this...
   */
  function reorderChildren(domNode: Node, moves: Moves) {
    var childNodes = domNode.childNodes
    var keyMap: NodeMap = {}
    var node: Node;
    var remove: Remove;
    var insert: Insert;
  
    iterArray(moves.removes.length, moves.removes, (remove) => {
      node = childNodes[remove.from];
      if (remove.key) { keyMap[remove.key] = node; }
      domNode.removeChild(node)
    })
  
    var childCount = childNodes.length;
    iterArray(moves.inserts.length, moves.inserts, (insert) => {
      node = keyMap[insert.key];
      
      // TODO: Understand the comment here: 
      //   "this is the weirdest bug i've ever seen in webkit"
      domNode.insertBefore(node, insert.to >= childCount++ ? null : childNodes[insert.to])
    })
  }
  
  /**
   * Replace the old element with the new element at the level 
   * of the old element's parent.
   */
  function replaceRoot(oldRoot: Node, newRoot: Node) {
      if (oldRoot && newRoot && oldRoot !== newRoot && oldRoot.parentNode) {
          oldRoot.parentNode.replaceChild(newRoot, oldRoot)
      }
      return newRoot;
  }
  
  /**
   * If a VTree might be a widget this function will ensure that the widget
   * is ultimately destroyed.
   */
  function ensureWidgetDestroyed(vTree: VTree, node: Node) {
    if (vTree instanceof Widget) { vTree.destroy(node) }
  }
  
}

// TODO: Finish working this
export module Patch {
  export function patch(rootNode: Node, patches: VPatchSet, options: PatchOptions) {
    var rO = buildConfig(options, rootNode);
    return rO.patch(rootNode, patches, rO);
  }
 
  /**
   * The patch algorithm lets you inject the rendering and patching functions dynamically.
   * This function provides default choices for these functions assuming the user did not
   * provide them.
   */   
  function buildConfig(options: PatchOptions, rootNode: Node): PatchConfig {
    return {
      patch:    options.patch    || patchRecursive,
      render:   options.render   || createNode,
      warn:     options.warn     || defaultWarn,
      document: options.document || rootNode.ownerDocument
    }
  }
  
  function defaultWarn(msg: String, vTree: VTree): void {
    console.log(msg + ": " + vTree.toString);
  }
  
  /** 
   * The default patch algorithm.
   */
  function patchRecursive(rootNode: Node, patches: VPatchSet, config: PatchConfig): Node {
      var indices = patchIndices(patches);
      var index = DomIndex.domIndex(rootNode, patches.node0, indices);
          
      // This executes a fold over the indices, patching repeatedly.
      iterArray(indices.length, indices, (ix) => {
        rootNode = applyPatch(rootNode, index[ix], patches.patches[ix], config);
      });
            
      return rootNode;
  }
  
  function applyPatch(rootNode: Node, domNode: Node, patchList: Array<VPatch>, config: PatchConfig) {
    if (!domNode) { return rootNode };
    var newNode: Node;
  
    iterArray(patchList.length, patchList, (patch) => {
      newNode = patch.apply(domNode, config);
      if (domNode === rootNode) { rootNode = newNode }; // What is this doing?
    })
        
    return rootNode
  }
  
  /** 
   * Computes the index set of a VPatchSet.
   */
  function patchIndices(patches: VPatchSet): Array<number> {
    var indices: Array<number> = [];
    iterSparseArray(patches.patches, (value, index) => {
      indices.push(index);
    }); 
    return indices;
  } 

}

/**
 * Maps a virtual DOM tree onto a real DOM tree in an efficient manner.
 * 
 * We don't want to read all of the DOM nodes in the tree so we use
 * the in-order tree indexing to eliminate recursion down certain branches.
 * We only recurse into a DOM node if we know that it contains a child of
 * interest.
 */ 
module DomIndex {
// TODO: Work through this module.  
  var noChild = {}
  
  export function domIndex
    ( rootNode: Node
    , tree: VNode
    , indices: Array<number>
    , nodes?: NodeMap
    ): NodeMap
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
    , nodes: NodeMap
    , rootIndex: number
    ): NodeMap {
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
}