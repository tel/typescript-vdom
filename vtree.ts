
/**
 * VTree: virtual, skeletonized representation of DOM trees implementing
 * two kinds of opaque callback mechanisms (Hooks and Widgets) along with
 * a transparent caching mechanism (Thunks).
 * 
 * The current class-based design is a little overly brittle but is needed
 * so as to enable principled coercion from the VTree union to the individual
 * types via type guards and instanceof. A enum/tag based approach more 
 * remniscent of the system in place in the original Virtual DOM implementation
 * might work better in the long run.
 */

export type VTree = VNode | VText | Widget | Thunk;

/** Iterate a function of the name and value over all slots in an object. */
function iterSlots<V>(obj: { [key: string]: V }, fn: (string, V) => any): void {
  var key: string;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      var value: V = obj[key];
      fn(key, value);
    }
  }
} 

/** Iterate a function over all values in an array. */
function iterArray<A>(n: number, ary: Array<A>, fn: (A) => any): void {
  var i: number;
  for (i = 0; i < n; i++) { fn(ary[i]); };
}

var noProperties: Props = {};
var noChildren: Array<VTree> = [];

export class VNode {
  constructor(tagName: string);
  constructor(tagName: string, properties: Props);
  constructor(tagName: string, properties: Props, children: Array<VTree>);
  constructor(tagName: string, properties: Props, children: Array<VTree>, key: string);
  constructor(tagName: string, properties: Props, children: Array<VTree>, key: string, namespace: string);
  constructor
    ( public tagName: string
    , public properties: Props = noProperties
    , public children: Array<VTree> = noChildren
    /** A unique key used to identify this VNode during diffing. */
    , public key?: string
    , public namespace?: string
    ) {      
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
export class VText {
  constructor();
  constructor(public text: string = "") {}
}

function noop1(x: any): any {}
function noop2(x: any, y: any): any {}

export class Widget {
  constructor
    ( public init: () => Element
    , public update: (previousWidget: Widget, previousDomNode: Element) => any = noop2
    , public destroy: (domNode: Element) => any = noop1
    ) {}
}

export type ThunkResult = VNode | VText | Widget;

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
export class Thunk {
  constructor(public render: (prior: VTree) => ThunkResult) {
    this.hasRendered = false;
    this.cache = null;
  };
  hasRendered: boolean;
  cache: ThunkResult;
}

// NOTE: Subclassing like below is a pretty ugly way to achieve this. It might
// be better to make GenericThunk the dominant type. The S type var can, after 
// all, be instantiated at all kinds of interesting types.

export class GenericThunk<S> extends Thunk {
  constructor
    ( render: (state: S) => ThunkResult
    , /** 
       * The previous state is likely to be S itself, but compare should 
       * gracefully handle cases where this is not true as well. When the
       * state types are incompatible, equal is necessarily false.
       */
      equal: (previousState: S | any, currentState: S) => boolean
    , state: S
    ) {
      this.equal = equal;
      this.state = state;      
      var coreRender: (prior: VTree) => ThunkResult = (prior) => {
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

      super(coreRender);
  };
  
  /** 
   * Implements (perhaps fuzzy) equality on states. This Thunk will not
   * re-render if the previous state is equal to the new state. 
   */
  equal: (previousState: S | any, currentState: S) => boolean;
  state: S;
}

export class VHook {
  constructor
    ( hook: (node: Element, propertyName: string, previousValue: any) => any );
  constructor
    ( hook: (node: Element, propertyName: string, previousValue: any) => any
    , unhook: (node: Element, propertyName: string, nextValue: any) => any 
    );
  constructor
    ( public hook:    (node: Element, propertyName: string, previousValue: any) => any
    , public unhook?: (node: Element, propertyName: string, nextValue: any) => any 
    ) {
      this.mustUnhook = !(unhook === undefined);
    }
  mustUnhook: boolean;
}

export interface Props {
  [key: string]: any | VHook
}