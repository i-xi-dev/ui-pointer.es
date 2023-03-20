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

function _pointerFrom(event: PointerEvent): Pointer {
  return Object.freeze({
    id: event.pointerId,
    type: event.pointerType,
    isPrimary: event.isPrimary,
  });
}

function _pointerModifiersOf(event: PointerEvent, watchModifiers: Set<PointerModifier>): Array<PointerModifier> {
  const modifiers: Array<PointerModifier> = [];
  for (const modifier of watchModifiers) {
    if (event.getModifierState(modifier) === true) {
      modifiers.push(modifier);
    }
  }
  return modifiers;
}

function _mouseButtonsOf(event: PointerEvent): Array<MouseButton> {
  const mouseButtons: Array<MouseButton> = [];
  if ((event.buttons & 0b1) === 0b1) {
    mouseButtons.push(MouseButton.LEFT);
  }
  if ((event.buttons & 0b10) === 0b10) {
    mouseButtons.push(MouseButton.RIGHT);
  }
  if ((event.buttons & 0b100) === 0b100) {
    mouseButtons.push(MouseButton.MIDDLE);
  }
  if ((event.buttons & 0b1000) === 0b1000) {
    mouseButtons.push(MouseButton.X_BUTTON_1);
  }
  if ((event.buttons & 0b10000) === 0b10000) {
    mouseButtons.push(MouseButton.X_BUTTON_2);
  }
  return mouseButtons;
}

function _penButtonsOf(event: PointerEvent): Array<PenButton> {
  const penButtons: Array<PenButton> = [];
  if ((event.buttons & 0b10) === 0b10) {
    penButtons.push(PenButton.BARREL);
  }
  if ((event.buttons & 0b100000) === 0b100000) {
    penButtons.push(PenButton.ERASER);
  }
  return penButtons;
}

type _PointerMotionOptions = {
  watchModifiers: Set<PointerModifier>,
};

function _pointerMotionFrom(event: PointerEvent, target: Element, options: _PointerMotionOptions): PointerMotion {
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

  return Object.freeze({

    viewportOffset: Object.freeze({
      x: event.clientX,
      y: event.clientY,
    }),
    targetOffset: Object.freeze({
      x: targetX,
      y: targetY,
    }),
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
    buttons: (event.pointerType === PointerType.PEN) ? _penButtonsOf(event) : _mouseButtonsOf(event),
    captured: target.hasPointerCapture(event.pointerId),
    _source: event,
    modifiers: _pointerModifiersOf(event, options.watchModifiers),
  });
}

interface Pointer {
  readonly id: pointerid;
  readonly type: string;
  readonly isPrimary: boolean;// 途中で変わることはない（複数タッチしてプライマリを離した場合、タッチを全部離すまでプライマリは存在しなくなる。その状態でタッチを増やしてもプライマリは無い）
}

const PointerType = {
  MOUSE: "mouse",
  PEN: "pen",
  TOUCH: "touch",
  UNKNOWN: "",
} as const;

/** @experimental */
const MouseButton = {
  LEFT: "left",
  MIDDLE: "middle",
  RIGHT: "right",
  X_BUTTON_1: "xbutton1",
  X_BUTTON_2: "xbutton2",
} as const;
type MouseButton = typeof MouseButton[keyof typeof MouseButton];

/** @experimental */
const PenButton = {
  BARREL: "barrel",// ボタン
  ERASER: "eraser",// 副先端での接触
} as const;
type PenButton = typeof PenButton[keyof typeof PenButton];

type PointerProperties = {
  readonly pressure: number,
  readonly radiusX: number,
  readonly radiusY: number,
  readonly tangentialPressure: number,
  readonly tiltX: number,
  readonly tiltY: number,
  readonly twist: number,
  // altitudeAngle 未実装のブラウザが多い
  // azimuthAngle 未実装のブラウザが多い
  // relatedTarget →PointerActivity
  // sourceCapabilities →PointerActivity
  // composedPath() →PointerActivity
  // getPredictedEvents() 
};

const PointerModifier = {
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
type PointerModifier = typeof PointerModifier[keyof typeof PointerModifier];

interface PointerMotion {
  readonly viewportOffset: Geometry2d.Point, // from viewport top left
  readonly targetOffset: Geometry2d.Point, // from target bounding box top left
  readonly inContact: boolean;// pointerがactiveかつ接触があるか否か
  readonly properties: PointerProperties,
  readonly buttons: (Array<MouseButton> | Array<PenButton>),
  readonly captured: boolean;// 「targetに」captureされているか否か

  /** @experimental */
  readonly _source: PointerEvent;

  readonly modifiers: Array<PointerModifier>;// タッチ間で共有だが現在値なのでここに持たせる
}

type PointerMovement = {
  readonly relativeX: number,
  readonly relativeY: number,
  readonly absoluteX: number,
  readonly absoluteY: number,
};

interface PointerActivity {
  readonly pointer: Pointer;
  readonly startTime: timestamp;
  readonly duration: milliseconds;
  readonly motionStream: ReadableStream<PointerMotion>;
  readonly movement: PointerMovement;
  readonly target: Element;
  readonly [Symbol.asyncIterator]: () => AsyncGenerator<PointerMotion, void, void>;
  readonly firstMotion: PointerMotion | null;
  readonly lastMotion: PointerMotion | null;
  //TODO 監視対象PointerModifierをここに持たせる？
}

export {
  type milliseconds,
  type pointerid,
  type timestamp,
  type PointerActivity,
  type PointerMovement,
  type PointerMotion,
  _pointerFrom,
  _pointerIsInContact,
  _pointerMotionFrom,
  Pointer,
  PointerModifier,
  PointerType,
};
