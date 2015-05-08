import { VTree, VText, VNode, ForcedVTree, Widget, handleThunk } from 'vtree';
import { applyProperties } from 'apply-properties';
import { iterArray } from 'utilities';

export interface CreateOptions {
  document?: Document;
  warn?: (msg: string, vtree: VTree) => any;
}

/** Provide defaults for render options. */
function completeOptions(opts: CreateOptions): CreateOptions {
  var doc  = opts ? opts.document || document : document
  var warn = opts ? opts.warn : null
  return { document: doc, warn: warn };
}

export function createNode(vtree: VTree, opts: CreateOptions): Node {
  var { document, warn } = completeOptions(opts);

  var vtree_: ForcedVTree = handleThunk(vnode, null).a

  if (vtree_ instanceof Widget) {
      return vtree_.init()
  } else if (vtree_ instanceof VText) {
      return document.createTextNode(vtree_.text)
  } else if (vtree_ instanceof VNode) {
    
    // We now know that we're dealing with a genuine VNode
    var vnode: VNode = vtree_;
    
    // (1) Build the raw node
    var el = document.createElement(vnode.tagName);
  
    // (2) Apply the properties
    applyProperties(el, vnode.properties, null);
  
    // (3) Create all the children recursively and append them as they are built
    iterArray(vnode.children.length, vnode.children, (child) => {
      var childNode = createNode(child, opts)
      if (childNode) { el.appendChild(childNode) };
    })
  
    // (4) Coerce the HTMLElement to a mere node.
    return (<Node> el)
  }

  
}