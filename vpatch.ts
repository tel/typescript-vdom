/**
 * VPatch: the core type indicating changes between two VTrees. 
 */
 
import VTree = require('vtree');
 
/** 
 * Patches come in several flavors denoting the behavior of the
 * action of this patch on a VTree.
 */
export const enum Flavor {
  None, 
  VText,
  VNode,
  Widget,
  Props,
  Order,
  Insert,
  Remove,
  Thunk 
}

export class VPatch {
  constructor 
    ( public flavor: Flavor
    , public vNode: any
    , public patch: any 
    ) {}
}

export class VPatchSet {
  constructor
    ( public patches: Array<VPatch>
    , public tree0: VTree.VTree
    ) {}
}