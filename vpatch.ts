/**
 * VPatch: the core type indicating changes between two VTrees. 
 */
 
import { VTree, VText, Widget, VNode, VHook, Dict, Props, PropValue } from 'vtree';
import { createNode, CreateOptions } from 'create-node';
import { iterSlots, iterArray, iterSparseArray } from 'utilities';

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
        ApplyProperties.applyProperties(el, this.props, theVTree.properties);
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
      var index = MapNodes.mapNodes(rootNode, patches.node0, indices);
          
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

module ApplyProperties {
  export function applyProperties(el: HTMLElement, props: Props, previous: Props): void {
    iterSlots(props, (propName, propValue) => {
      var previousValue = previous ? previous[propName] : null;
      
      if (propValue === undefined) {
        // Eliminate now undefined properties
        removeProperty(el, propName, propValue, previousValue);
      } else if (propValue instanceof VHook) {
        // Eliminate old properties and hook new ones
        removeProperty(el, propName, propValue, previousValue);
        propValue.hook(el, propName, previousValue);
      } else {
        // Add the new property as an object or a string
        if (typeof propValue === "object") {
          // We know that propValue cannot be a VHook else it would have triggered the
          // previous type guard.
          var propObj = <Dict<string>> propValue;
          patchObject(el, props, previousValue, propName, propObj);
        } else {
          // At the point, the only thing that propValue can remain as is a primitive
          // like a string or a number. We merely assign it.
          var propPrim = <number | string> propValue;
          
          // Because blind assignment cannot be typesafe and we'll likely populate extra, 
          // unexpected properties on to the HTMLElement, it must be cast to any. Sad. 
          (<any> el)[propName] = propPrim;
        }
      }
    });
  }
  
  /**
   * Removes a property from a node.
   * 
   * If this is a hook which must unhook then the unhooking occurs. If this is a style
   * or attributes property then the entire style or attributes property is eliminated.
   */
  function removeProperty(el: HTMLElement, propName: string, propValue: PropValue, previousValue: PropValue): void {
    if (previousValue) {
      if (previousValue instanceof VHook && previousValue.mustUnhook) {
        previousValue.unhook(el, propName, propValue);
      } else {
        switch (propName) {
          case "attributes":
            iterSlots(<Dict<string>> previousValue, (attrName, _) => {
              el.removeAttribute(attrName);
            })
          case "style":
            iterSlots(<Dict<string>> previousValue, (styleName, _) => {
              // Type coercion to allow blind assignment
              (<any> el.style)[styleName] = "";
            })
          default:
            if (typeof previousValue === "string") {
              // Type coercion to allow blind assignment
              (<any> el)[propName] = "";
            } else {
              // Type coercion to allow blind assignment
              (<any> el)[propName] = null;
            }
        }
      }
    }
  }
  
  /** 
   * Given that we're going to replace an element property with something
   * from our Props which is an object there are a few special behaviors to
   * consider. Specifically, objects keyed at either "attributes" or "style"
   * are treated specially. Otherwise, objects in properties are treated opaquely
   * as dictionaries with no particular semantic meaning.
   * 
   * This is significantly less sophisticated than the original version in 
   * Matt-Esch/virtual-dom. The typing regime more or less forces our hand here,
   * though it's possible that this weakens the property semantics somewhat 
   * dramatically.
   */
  function patchObject
    (el: HTMLElement, props: Props, previousValue: PropValue, propName: string, propObj: Dict<string>): void {
      
      switch (propName) {
  
        case "attributes":
          iterSlots(propObj, (name, value) => {
            if (value === undefined) {
              el.removeAttribute(name);
            } else {
              el.setAttribute(name, value);
            }
          });
          
        case "style":
          iterSlots(propObj, (name, value) => {
            if (value === undefined) {
              el.style.removeProperty(name)
            } else {
              el.style.setProperty(name, value, '');
            }    
          });
          
        // In the default case we assume we know nothing about how arbitrary objects 
        // should replace objects already in the element. We'll thus just replace it
        // wholesale.
        default:
          // Type coercion to allow blind assignment
          (<any> el)[propName] = propObj;
      }
  }
}

/**
 * Construct a node map lifting nodes of interest from the DOM.
 * 
 * DOM nodes are assigned indices by an in-order tree traversal. A naive
 * version of this function would provide a dense mapping from indices to
 * DOM nodes, but instead this algorithm efficiently traverses the DOM to
 * find only the "indices of interest" as named by a function parameter.
 */ 
module MapNodes {
  
  export function mapNodes
    ( rootNode: Node
    , tree: VNode
    /** Which nodes are we interested in? */
    , indices: Array<number>
    ): NodeMap
  {
    indices.sort(ascendingOrder);
    if (indices.length > 0) {
      return recurse(rootNode, tree, indices, {}, 0);
    } else {
      return {};
    }
  }
  
  function recurse
    ( rootNode: Node
    , tree: VNode
    , indices: Array<number>
    , nodes: NodeMap
    , rootIndex: number
    ): NodeMap {
      
      if (indexInRange(indices, rootIndex, rootIndex)) {
        nodes[rootIndex] = rootNode
      }

      iterArray(tree.children.length, tree.children, (vChild, index) => {
        rootIndex += 1;
        if (    vChild instanceof VNode 
             && indexInRange(indices, rootIndex, rootIndex + vChild.count) ) {
          recurse(rootNode.childNodes[index], vChild, indices, nodes, rootIndex);
        } NodeList
      })

      return nodes;
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