export interface EventMapping {
  svelteEvent: string;
  modifiers: string[];
}

export function transformEventName(reactEventName: string): EventMapping {
  // Strip "on" prefix
  if (!reactEventName.startsWith("on")) {
    return { svelteEvent: reactEventName.toLowerCase(), modifiers: [] };
  }

  const baseEvent = reactEventName.slice(2);
  let svelteEvent = baseEvent.toLowerCase();
  const modifiers: string[] = [];

  // Special event mappings
  if (svelteEvent === "change") {
    // Svelte onChange is usually on:input for real-time bindings, or on:change for select elements
    svelteEvent = "input";
  } else if (svelteEvent === "submit") {
    svelteEvent = "submit";
    modifiers.push("preventDefault");
  } else if (svelteEvent === "doubleclick") {
    svelteEvent = "dblclick";
  }

  // Keyboard, Mouse, Touch, Drag, Clipboard, Pointer, Wheel mappings
  switch (svelteEvent) {
    case "keydown":
    case "keyup":
    case "keypress":
    case "click":
    case "contextmenu":
    case "mousedown":
    case "mouseenter":
    case "mouseleave":
    case "mousemove":
    case "mouseout":
    case "mouseover":
    case "mouseup":
    case "drag":
    case "dragend":
    case "dragenter":
    case "dragleave":
    case "dragover":
    case "dragstart":
    case "drop":
    case "scroll":
    case "wheel":
    case "focus":
    case "blur":
    case "touchstart":
    case "touchmove":
    case "touchend":
    case "touchcancel":
    case "copy":
    case "cut":
    case "paste":
    case "pointerdown":
    case "pointermove":
    case "pointerup":
    case "pointercancel":
    case "pointerenter":
    case "pointerleave":
    case "pointerover":
    case "pointerout":
    case "transitionend":
    case "animationstart":
    case "animationend":
    case "animationiteration":
      // Keep standard name
      break;
    default:
      // Fallback
      break;
  }

  return { svelteEvent, modifiers };
}

export function getSvelteEventDirective(reactEventName: string): string {
  const { svelteEvent, modifiers } = transformEventName(reactEventName);
  const modifierStr = modifiers.length > 0 ? `|${modifiers.join("|")}` : "";
  return `on:${svelteEvent}${modifierStr}`;
}
