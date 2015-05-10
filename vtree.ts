
/**
 * VTree: virtual, skeletonized representation of DOM trees implementing
 * two kinds of opaque callback mechanisms (Hooks and Widgets) along with
 * a transparent caching mechanism (Thunks).
 * 
 * (The current class-based design is a little overly brittle but is needed
 * so as to enable principled coercion from the VTree union to the individual
 * types via type guards and instanceof. A enum/tag based approach more 
 * remniscent of the system in place in the original Virtual DOM implementation
 * might work better in the long run.)
 * 
 * (Another option is to go all in and emulate Scala case classes by creating a
 * common superclass for all members of VTree. It might be at this point 
 * congruent to name this VNode and to call what's currently VNode, VEl. That said
 * it'll probably cause some trouble.)
 */

import { iterSlots, iterArray, Dict } from 'utilities';

// export type VTree = VNode | VText | Widget | Thunk;

var noProperties: Props = {};
var noChildren: Array<VTree> = [];

export class VTree {
  constructor(public key: string = null) {};
}

export class VNode extends VTree {
  constructor(tagName: string);
  constructor(tagName: string, properties: Props);
  constructor(tagName: string, properties: Props, children: Array<VTree>);
  constructor(tagName: string, properties: Props, children: Array<VTree>, key: string);
  constructor
    ( public tagName: string
    , public properties: Props = noProperties
    , public children: Array<VTree> = noChildren
    /** A unique key used to identify this VNode during diffing. */
    , key?: string    
    ) {      
      super(key);
      this.count           = this.children.length;
      this.descendants     = 0;
      this.hasWidgets      = false;
      this.hasThunks       = false;
      this.descendantHooks = false;
      this.hooks           = {};
      
      // Determine all hooks in properties which need to be unhooked later.
      iterSlots(this.properties, (propName, property) => {        
        if (property instanceof VHook) {
          var hook = <VHook> property;
          if (hook.mustUnhook) {
            this.hooks[propName] = property;
          }
        }
      });
      
      // Examine subtrees recursively looking for widgets, thunks, and the need
      // to unhook descendents. Additionally, count all subnodes.
      iterArray(this.count, this.children, (child) => {
        if (child instanceof VNode) {
          var node = <VNode> child;
          this.descendants    += node.count;
          this.hasWidgets      = this.hasWidgets      || node.hasWidgets;
          this.hasThunks       = this.hasThunks       || node.hasThunks;
          this.descendantHooks = this.descendantHooks || node.hooks !== undefined || node.descendantHooks; 
        }
        else {
          this.hasWidgets = this.hasWidgets || child instanceof Widget;
          this.hasThunks  = this.hasThunks  || child instanceof Thunk;
        }
      });
      
      // Add the current children to total descendents.
      this.descendants += this.count;
    }

  /** Number of immediate children */
  count: number;
  
  /** Number of all descendents. The size of the virtual tree is this number plus one. */
  descendants: number;
  
  /** Do any widgets exist at this node or below? */
  hasWidgets: boolean;
  
  /** Do any thunks exist at this node or below? */
  hasThunks: boolean;
  
  /** Do any hooks require cleanup at this node or below? */
  descendantHooks: boolean;
  
  /** What hooks exist here and require cleanup? */
  hooks: { [key: string]: VHook }
}

/** A wrapper around a text value. Used almost entirely for typed case dispatch. */
export class VText extends VTree {
  constructor();
  constructor(text: string);
  constructor(text: string, key: string);
  constructor(public text: string = "", key?: string) { super(key); }
}

/**
 * Widgets form "holes" in the VTree where the diffing algorithm cannot go. One
 * widget will try to "update" a prior one when they share ids or init functions.
 */
export class Widget extends VTree {
  constructor
    ( 
      /** The function called when the widget is being created. */
      public init: () => Node,
      
      /** 
       * When this Widget is diffed against another widget in the tree update is
       * called to provide a chance for the widget to update itself.
       */
      public update: (previousWidget: Widget, previousDomNode: Node) => Node,
      
      /** 
       * When the Widget is being removed by a fresh diff it's given an opportunity
       * to clean up anything the Widget was managing. The Node does not need to be
       * destroyed and can be thought of as having already been removed from the Tree.
       */
      public destroy: (domNode: Node) => any,
      
      key?: string
    ) { 
      super(key); 
    }
}

export module Widget {
  export function shouldUpdate(a: Widget, b: Widget) {
    (a.key == b.key) || (a.init == b.init)
  }
}

/** Subset of VTree types which are known to not be a Thunk. */
export type ForcedVTree = VNode | VText | Widget;

/** 
 * A Thunk is a deferred VTree. Upon diffing a Thunk has an opportunity
 * to examine what it is being diffed against and then to change its result.
 * 
 * For optimization purposes, once render has been called on a thunk once the
 * result is stored in the cache property (otherwise null). Use this 
 * opportunistically when implementing the render function to use cached work
 * instead of re-rendering.
 * 
 * Thunks should be pure in that the only state the manage is that used to enable
 * render optimization.
 */
export class Thunk extends VTree {
  /** 
   * The render function should construct the thunked VTree eliminating all remaining
   * laziness (e.g., it cannot return another Thunk). The rendering is done with access
   * to the prior VTree node that is being replaced which may also be null.
   */
  constructor(render: (prior: VTree) => ForcedVTree, key?: string) {
    super(key);
    this.coreRender = render;
    this.hasRendered = false;
    this.cache = null;
  };
  
  private coreRender: (prior: VTree) => ForcedVTree;
  
  /** 
   * Attempts to render this thunk against the VTree it will be replacing.
   * This function is called at most once and then its result it cached.
   */
  render(prior: VTree): ForcedVTree {
    if (this.hasRendered) {
      return this.cache;
    } else {
      this.cache = this.coreRender(prior);
      this.hasRendered = true;
      return this.cache;
    }
  }
  
  hasRendered: boolean;
  cache: ForcedVTree;
}

export module Thunk {
  /**
   * Given two VTrees, a and b, with b set to replace a, force a and b as efficiently
   * as possible.
   */
  export function handle(a: VTree, b: VTree): {a: ForcedVTree, b: ForcedVTree} {
    var renderedA: ForcedVTree;
    var renderedB: ForcedVTree;
  
    if ( b instanceof Thunk &&
         a instanceof Thunk ) {
      renderedB = b.render(a);
      renderedA = a.render(null);
    } else if ( b instanceof Thunk ) {
      renderedA = <ForcedVTree> a;
      renderedB = b.render(a);
    } else if ( a instanceof Thunk ) {
      renderedB = <ForcedVTree> b;
      renderedA = a.render(null);
    } else {
      renderedA = <ForcedVTree> a;
      renderedB = <ForcedVTree> b;
    }
    
    return { a: renderedA, b: renderedB };
    
  } 
}

// NOTE: Subclassing like below is a pretty ugly way to achieve this. It might
// be better to make GenericThunk the dominant type. The S type var can, after 
// all, be instantiated at all kinds of interesting types.

export class GenericThunk<S> extends Thunk {
  constructor
    ( render: (state: S) => ForcedVTree
    , /** 
       * The previous state is likely to be S itself, but compare should 
       * gracefully handle cases where this is not true as well. When the
       * state types are incompatible, equal is necessarily false.
       */
      equal: (previousState: S | any, currentState: S) => boolean
    , state: S
    , key?: string
    ) {
      this.equal = equal;
      this.state = state;      
      var coreRender: (prior: VTree) => ForcedVTree = (prior) => {
        // If we're being diffed against another GenericThunk, then
        // we'll see if there's been a change in state
        if (prior instanceof GenericThunk) {
          if (this.equal(prior.state, this.state)) {
            if (prior.hasRendered) {
              return prior.cache;
            } else {
              return render(this.state);
            }
          } else {
            // States have changed, we necessarily re-render
            return render(this.state);
          }
        } 
        // If we're not being diffed against a previous GenericThunk
        // then we necessarily re-render
        else {          
          return render(state);
        }
      };

      super(coreRender, key);
  };
  
  /** 
   * Implements (perhaps fuzzy) equality on states. This Thunk will not
   * re-render if the previous state is equal to the new state. 
   */
  equal: (previousState: S | any, currentState: S) => boolean;
  state: S;
}

export class VHook extends VTree {
  constructor
    ( public hook:    (node: Node, propertyName: string, previousValue: any) => any
    , public unhook?: (node: Node, propertyName: string, nextValue: any) => any
    , key?: string 
    ) {
      super(key);
      this.mustUnhook = !unhook;
    }
  mustUnhook: boolean;
}

export type PropValue = string | number | VHook | Dict<string>

export interface Props {
  attributes?: Dict<string>;
  style?: Dict<string>;
  [key: string]: PropValue;
}