import { Props, PropValue, VHook, Dict } from 'vtree';
import { iterSlots } from 'utilities';

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
        el[propName] = propValue;
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
            el.style[styleName] = "";
          })
        default:
          if (typeof previousValue === "string") {
            el[propName] = "";
          } else {
            el[propName] = null;
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
        el[propName] = propObj;
    }
}