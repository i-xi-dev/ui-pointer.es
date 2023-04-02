import { Geometry2d, Keyboard } from "@i-xi-dev/ui-utils";

/**
 * The identifier for the pointer.
 */
type pointerid = number;

type timestamp = number;

type milliseconds = number;

function _pointerIsInContact(event: PointerEvent): boolean {
  return ((event.buttons & 0b1) === 0b1);
}

function _mouseButtonsOf(event: PointerEvent): Array<Pointer.MouseButton> {
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

function _penButtonsOf(event: PointerEvent): Array<Pointer.PenButton> {
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
  modifiersToWatch: Set<Pointer.Modifier>,
  prevTrace: PointerTrace | null,
};

function _pointerTraceFrom(event: PointerEvent, target: Element, options: _PointerTraceOptions): PointerTrace {
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

  const modifiers: Array<Pointer.Modifier> = [...options.modifiersToWatch].filter((modifier) => event.getModifierState(modifier) === true);

  return Object.freeze({
    timeStamp: event.timeStamp,
    viewportX,
    viewportY,
    targetX,
    targetY,
    movementX,
    movementY,
    inContact: _pointerIsInContact(event),
    properties: Object.freeze({
      pressure: event.pressure,
      radiusX: event.width / 2,
      radiusY: event.height / 2,
      tangentialPressure: event.tangentialPressure,
      tiltX: event.tiltX,
      tiltY: event.tiltY,
      twist: event.twist,
    }),
    buttons: (event.pointerType === Pointer.Type.PEN) ? _penButtonsOf(event) : _mouseButtonsOf(event),
    modifiers,
    captured: target.hasPointerCapture(event.pointerId),
    source: Object.freeze({
      isTrusted: event.isTrusted,
      eventType: event.type,
    }),
  });
}

/**
 * The pointer.
 */
interface Pointer {
  /**
   * The identifier for the pointer.
   * @see {@link https://www.w3.org/TR/pointerevents2/#dom-pointerevent-pointerid | [Pointer Events Level 2] pointerId}
   */
  readonly id: pointerid;

  /**
   * The pointer device type.
   * @see {@link https://www.w3.org/TR/pointerevents2/#dom-pointerevent-pointertype | [Pointer Events Level 2] pointerType}
   */
  readonly type: string;

  readonly isPrimary: boolean;// 途中で変わることはない（複数タッチしてプライマリを離した場合、タッチを全部離すまでプライマリは存在しなくなる。その状態でタッチを増やしてもプライマリは無い）

  //XXX sourceCapabilities
}

namespace Pointer {
  export function from(event: PointerEvent): Pointer {
    return Object.freeze({
      id: event.pointerId,
      type: event.pointerType,
      isPrimary: event.isPrimary,
    });
  }

  /**
   * The type of the pointer device.
   * @see {@link https://www.w3.org/TR/pointerevents2/#dom-pointerevent-pointertype | [Pointer Events Level 2] pointerType}
   */
  export const Type = {
    MOUSE: "mouse",
    PEN: "pen",
    TOUCH: "touch",
    UNKNOWN: "",
  } as const;

  export type Properties = {
    readonly pressure: number,
    readonly radiusX: number,
    readonly radiusY: number,
    readonly tangentialPressure: number,
    readonly tiltX: number,
    readonly tiltY: number,
    readonly twist: number,
    //XXX altitudeAngle 未実装のブラウザが多い
    //XXX azimuthAngle 未実装のブラウザが多い
  };

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

interface PointerTrace {
  readonly timeStamp: timestamp;
  readonly viewportX: number, // from viewport left
  readonly viewportY: number, // from viewport top
  readonly targetX: number,// offset from target bounding box left
  readonly targetY: number,// offset from target bounding box top
  readonly movementX: number;// 直前のPointerTraceからの相対位置
  readonly movementY: number;// 直前のPointerTraceからの相対位置
  readonly inContact: boolean;// pointerがactiveかつ接触があるか否か
  readonly properties: Pointer.Properties,
  readonly buttons: (Array<Pointer.MouseButton> | Array<Pointer.PenButton>),
  readonly modifiers: Array<Pointer.Modifier>;// タッチ間で共有だが現在値なのでここに持たせる //TODO buttonなどもふくめる
  readonly captured: boolean;// 「targetに」captureされているか否か
  //XXX readonly context: {
  //   dispatcher: Element,
  //   composedPath
  // };
  readonly source: PointerTrace.Source;
}

namespace PointerTrace {
  export type Source = {
    readonly isTrusted: boolean,
    readonly eventType: string,
  };
}

interface PointerActivity {
  readonly pointer: Pointer;
  readonly target: Element | null;
  readonly startTime: timestamp;
  readonly duration: milliseconds;
  //XXX readonly traceStream: ReadableStream<PointerTrace>;
  //XXX readonly startViewportOffset: Geometry2d.Point | null;
  //XXX readonly startTargetOffset: Geometry2d.Point | null;
  readonly result: Promise<PointerActivity.Result>;

  //XXX readonly current

  readonly [Symbol.asyncIterator]: () => AsyncGenerator<PointerTrace, void, void>;
  readonly inProgress: boolean;
  readonly beforeTrace: PointerTrace | null;
  readonly startTrace: PointerTrace | null;
  //XXX readonly lastTrace: PointerTrace | null; その時点の最新trace 終了後はendTraceと同じ
  readonly endTrace: PointerTrace | null;
  readonly watchedModifiers: Array<Pointer.Modifier>;
  //XXX getPredictedTrace()
}

namespace PointerActivity {
  export type Result = {
    movementX: number,// PointerActivity始点からの相対位置
    movementY: number,// PointerActivity始点からの相対位置
    track: number,// 軌跡の近似値
  };
}

export {
  type milliseconds,
  type pointerid,
  type timestamp,
  type PointerActivity,
  type PointerTrace,
  _pointerIsInContact,
  _pointerTraceFrom,
  Pointer,
};
