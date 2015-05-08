/**
 * VPatch: the core type indicating changes between two VTrees. 
 */
 
import { VTree, VText, Widget, VNode, Props } from 'vtree';
import { createNode, CreateOptions } from 'create-node';
import { domIndex } from 'dom-index';
import { iterArray } from 'utilities';
import { applyProperties } from 'apply-properties';

export class VPatchSet {
  constructor
    ( public patches: Array<VPatch>
    , public tree0: VTree
    ) {}
}

export interface RenderOptions {
  patch?: (rootNode: Node, patches: VPatchSet, renderOptions: RenderOptions) => Node;
  render?: (vTree: VTree, options: CreateOptions) => Node;
  document?: Document;
}

export class VPatch {
  vTree: VTree;
  apply(node: Node, renderOptions: RenderOptions): Node { return node; }
}

export class PatchRemove extends VPatch {
  apply(node: Node, renderOptions?: RenderOptions): Node {
    var parentNode = node.parentNode;
    if (parentNode) { parentNode.removeChild(node) }
    ensureWidgetDestroyed(this.vTree, node);
    return null
  }
}

export class PatchInsert extends VPatch {
  apply(node: Node, renderOptions: RenderOptions): Node {
    var newNode = renderOptions.render(this.vTree, renderOptions);
    if (node) { node.appendChild(newNode); }
    return node;
  }
}

export class PatchString extends VPatch {
  constructor( public vText : VText ) { super(); }
  apply(node: Node, renderOptions: RenderOptions): Node {
    var newNode

    if (node.nodeType === 3) {
      var charNode = <CharacterData> node;
      charNode.replaceData(0, charNode.length, this.vText.text);
      newNode = charNode;
    } else {
      var parentNode = node.parentNode;
      newNode = renderOptions.render(this.vText, renderOptions)

      if (parentNode && newNode !== node) {
          parentNode.replaceChild(newNode, node)
      }
    }

    return newNode
  }
}

export class PatchWidget extends VPatch {
  constructor( public widget : Widget ) { super(); }
  apply(node: Node, renderOptions: RenderOptions): Node {
    var priorVTree = this.vTree;
    var newNode;    
    
    if (priorVTree instanceof Widget) {
      var priorWidget = priorVTree;
      var updating = Widget.shouldUpdate(priorWidget, this.widget)
      
      if (updating) {
        newNode = this.widget.update(priorWidget, node) || node;
      } else {
        newNode = renderOptions.render(this.widget, renderOptions)
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

export class PatchVNode extends VPatch {
  constructor( public vNode : VNode ) { super(); }
  apply(node: Node, renderOptions: RenderOptions): Node {
    var parentNode = node.parentNode;
    var newNode = renderOptions.render(this.vNode, renderOptions);

    if (parentNode && newNode !== node) {
        parentNode.replaceChild(newNode, node);
    }

    return newNode
  }
}

export class PatchOrder extends VPatch {
  constructor( public moves: Moves ) { super(); }
  apply(node: Node, renderOptions: RenderOptions): Node {
    reorderChildren(node, this.moves);
    return node;
  }
}

export class PatchProps extends VPatch {
  constructor( public props: Props ) { super(); }
  apply(node: Node, renderOptions: RenderOptions): Node {
    var theVTree = this.vTree;
    if (theVTree instanceof VNode) {
      // Now we know that node must be an HTMLElement
      var el = <HTMLElement> node;
      applyProperties(el, this.props, theVTree.properties);
    }
    return node;
  }
}

export class PatchThunk extends VPatch {
  constructor( public thunkPatchset: VPatchSet ) { super(); }
  apply(node: Node, renderOptions: RenderOptions): Node {
  	var newNode = renderOptions.patch(node, this.thunkPatchset, renderOptions)
    return replaceRoot(node, newNode);
  }
}

interface Moves {
  removes: Array<{ from: number, key?: number }>;
  inserts: Array<{ to:   number, key: number }>
}

/**
 * TODO: Document this...
 */
function reorderChildren(domNode: Node, moves: Moves) {
  var childNodes = domNode.childNodes
  var keyMap = {}
  var node
  var remove
  var insert

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
function ensureWidgetDestroyed(vtree: VTree, node: Node) {
  if (vtree instanceof Widget) { vtree.destroy(node) }
}