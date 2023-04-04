import { Geometry2d, Keyboard } from "@i-xi-dev/ui-utils";
import { PointerProperties } from "./pointer_properties";
import { PointerActivity } from "./pointer_activity";

/**
 * The identifier for the pointer.
 */
type pointerid = number;

type timestamp = number;

type milliseconds = number;

function _pointerIsInContact(event: PointerEvent | PointerActivity.Trace.Source): boolean {
  return ((event.buttons & 0b1) === 0b1);
}

function _mouseButtonsOf(event: PointerActivity.Trace.Source): Array<Pointer.MouseButton> {
  const mouseButtons: Array<Pointer.MouseButton> = [];
  if ((event.buttons & 0b1) === 0b1) {
    mouseButtons.push(Pointer.MouseButton.LEFT);
  }
  if ((event.buttons & 0b10) === 0b10) {
    mouseButtons.push(Pointer.MouseButton.RIGHT);
  }
  if ((event.buttons & 0b100) === 0b100) {
    mouseButtons.push(Pointer.MouseButton.MIDDLE);
  }
  if ((event.buttons & 0b1000) === 0b1000) {
    mouseButtons.push(Pointer.MouseButton.X_BUTTON_1);
  }
  if ((event.buttons & 0b10000) === 0b10000) {
    mouseButtons.push(Pointer.MouseButton.X_BUTTON_2);
  }
  return mouseButtons;
}

function _penButtonsOf(event: PointerActivity.Trace.Source): Array<Pointer.PenButton> {
  const penButtons: Array<Pointer.PenButton> = [];
  if ((event.buttons & 0b10) === 0b10) {
    penButtons.push(Pointer.PenButton.BARREL);
  }
  if ((event.buttons & 0b100000) === 0b100000) {
    penButtons.push(Pointer.PenButton.ERASER);
  }
  return penButtons;
}

type _PointerTraceOptions = {
  // modifiersToWatch: Set<Pointer.Modifier>,
  prevTrace: PointerActivity.Trace | null,
};

function _pointerTraceFrom(event: PointerActivity.Trace.Source, target: Element, options: _PointerTraceOptions): PointerActivity.Trace {
  const dispatcher = (event.target instanceof Element) ? event.target : null;
  let targetX = Number.NaN;
  let targetY = Number.NaN;
  if (dispatcher) {
    targetX = event.offsetX;
    targetY = event.offsetY;
  }
  if (!!dispatcher && (target !== dispatcher)) {
    const targetBoundingBox = target.getBoundingClientRect();
    const dispatcherBoundingBox = dispatcher.getBoundingClientRect();
    const { x, y } = Geometry2d.Point.distanceBetween(targetBoundingBox, dispatcherBoundingBox);
    targetX = targetX + x;
    targetY = targetY + y;
  }

  const viewportX = event.clientX;
  const viewportY = event.clientY;

  let movementX: number = 0;
  let movementY: number = 0;
  if (options.prevTrace) {
    const prevTrace = options.prevTrace;
    movementX = (viewportX - prevTrace.viewportX);
    movementY = (viewportY - prevTrace.viewportY);
  }

  // const modifiers: Array<Pointer.Modifier> = [...options.modifiersToWatch].filter((modifier) => event.getModifierState(modifier) === true);

  return Object.freeze({
    timeStamp: event.timeStamp,
    viewportX,
    viewportY,
    targetX,
    targetY,
    movementX,
    movementY,
    inContact: _pointerIsInContact(event),
    properties: PointerProperties.of(event),
    buttons: (event.pointerType === "pen") ? _penButtonsOf(event) : _mouseButtonsOf(event),
    // modifiers,
    captured: target.hasPointerCapture(event.pointerId),
    source: event,
  });
}

namespace Pointer {
  export const Modifier = {
    ALT: Keyboard.Key.ALT,
    ALT_GRAPH: Keyboard.Key.ALT_GRAPH,
    CAPS_LOCK: Keyboard.Key.CAPS_LOCK,
    CONTROL: Keyboard.Key.CONTROL,
    F1: Keyboard.Key.F1,
    F2: Keyboard.Key.F2,
    F3: Keyboard.Key.F3,
    F4: Keyboard.Key.F4,
    F5: Keyboard.Key.F5,
    F6: Keyboard.Key.F6,
    F7: Keyboard.Key.F7,
    F8: Keyboard.Key.F8,
    F9: Keyboard.Key.F9,
    F10: Keyboard.Key.F10,
    F11: Keyboard.Key.F11,
    F12: Keyboard.Key.F12,
    F13: Keyboard.Key.F13,
    F14: Keyboard.Key.F14,
    F15: Keyboard.Key.F15,
    FN_LOCK: Keyboard.Key.FN_LOCK,
    HYPER: Keyboard.Key.HYPER,
    META: Keyboard.Key.META,
    NUM_LOCK: Keyboard.Key.NUM_LOCK,
    SCROLL_LOCK: Keyboard.Key.SCROLL_LOCK,
    SHIFT: Keyboard.Key.SHIFT,
    SUPER: Keyboard.Key.SUPER,
    SYMBOL: Keyboard.Key.SYMBOL,
    SYMBOL_LOCK: Keyboard.Key.SYMBOL_LOCK,
  } as const;
  export type Modifier = typeof Modifier[keyof typeof Modifier];

  /** @experimental */
  export const MouseButton = {
    LEFT: "left",
    MIDDLE: "middle",
    RIGHT: "right",
    X_BUTTON_1: "xbutton1",
    X_BUTTON_2: "xbutton2",
  } as const;
  export type MouseButton = typeof MouseButton[keyof typeof MouseButton];

  /** @experimental */
  export const PenButton = {
    BARREL: "barrel",// ボタン
    ERASER: "eraser",// 副先端での接触
  } as const;
  export type PenButton = typeof PenButton[keyof typeof PenButton];

}

export {
  type milliseconds,
  type pointerid,
  type timestamp,
  _pointerIsInContact,
  _pointerTraceFrom,
  Pointer,
};
