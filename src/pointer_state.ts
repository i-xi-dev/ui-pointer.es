import { PointerDevice } from "./pointer_device";

type _PointerStateSource = {
  pointerType: string,
  buttons: number,
  height: number,
  pressure: number,
  tangentialPressure: number,
  tiltX: number,
  tiltY: number,
  twist: number,
  width: number,
};

function _pointerIsInContact(source: _PointerStateSource): boolean {
  return ((source.buttons & 0b1) === 0b1);
}

/** @experimental */
const MouseButton = {
  LEFT: "left",
  MIDDLE: "middle",
  RIGHT: "right",
  X_BUTTON_1: "xbutton1",
  X_BUTTON_2: "xbutton2",
} as const;
type MouseButton = typeof MouseButton[keyof typeof MouseButton];

function _mouseButtonsOf(source: _PointerStateSource): Array<MouseButton> {
  const mouseButtons: Array<MouseButton> = [];
  if ((source.buttons & 0b1) === 0b1) {
    mouseButtons.push(MouseButton.LEFT);
  }
  if ((source.buttons & 0b10) === 0b10) {
    mouseButtons.push(MouseButton.RIGHT);
  }
  if ((source.buttons & 0b100) === 0b100) {
    mouseButtons.push(MouseButton.MIDDLE);
  }
  if ((source.buttons & 0b1000) === 0b1000) {
    mouseButtons.push(MouseButton.X_BUTTON_1);
  }
  if ((source.buttons & 0b10000) === 0b10000) {
    mouseButtons.push(MouseButton.X_BUTTON_2);
  }
  return mouseButtons;
}

/** @experimental */
const PenButton = {
  BARREL: "barrel",// ボタン
  ERASER: "eraser",// 副先端での接触
} as const;
type PenButton = typeof PenButton[keyof typeof PenButton];

function _penButtonsOf(source: _PointerStateSource): Array<PenButton> {
  const penButtons: Array<PenButton> = [];
  if ((source.buttons & 0b10) === 0b10) {
    penButtons.push(PenButton.BARREL);
  }
  if ((source.buttons & 0b100000) === 0b100000) {
    penButtons.push(PenButton.ERASER);
  }
  return penButtons;
}

/**
 * Represents a pointer state.
 * 
 * This is an immutable object.
 */
interface PointerState {
  //TODO readonly modifiers: Array<Pointer.Modifier>;//XXX Record<string, boolean>にする？ // タッチ間で共有だが現在値なのでここに持たせる //XXX buttonなどもふくめる

  /**
   * @experimental
   */
  readonly buttons: Array<string>;//XXX Record<string, boolean>にする？あるいはmodifierにまとめる？

  /**
   * Indicates the {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pressure | `pressure`} property of the `PointerEvent`.
   */
  readonly pressure: number;

  /**
   * Indicates <math><mfrac><mn>1</mn><mn>2</mn></mfrac></math> of the {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/width | `width`} property of the `PointerEvent`.
   */
  readonly radiusX: number;

  /**
   * Indicates <math><mfrac><mn>1</mn><mn>2</mn></mfrac></math> of the {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/height | `height`} property of the `PointerEvent`.
   */
  readonly radiusY: number;

  /**
   * Indicates the {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/tangentialPressure | `tangentialPressure`} property of the `PointerEvent`.
   */
  readonly tangentialPressure: number;

  /**
   * Indicates the {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/tiltX | `tiltX`} property of the `PointerEvent`.
   */
  readonly tiltX: number;

  /**
   * Indicates the {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/tiltY | `tiltY`} property of the `PointerEvent`.
   */
  readonly tiltY: number;

  /**
   * Indicates the {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/twist | `twist`} property of the `PointerEvent`.
   */
  readonly twist: number;

  //XXX altitudeAngle 未実装のブラウザが多い
  //XXX azimuthAngle 未実装のブラウザが多い
}

function _pointerStateOf(source: _PointerStateSource): PointerState {
  return Object.freeze({
    buttons: (source.pointerType === PointerDevice.Type.PEN) ? _penButtonsOf(source) : _mouseButtonsOf(source),
    pressure: source.pressure,
    radiusX: source.width / 2,
    radiusY: source.height / 2,
    tangentialPressure: source.tangentialPressure,
    tiltX: source.tiltX,
    tiltY: source.tiltY,
    twist: source.twist,
  });
}

export {
  type _PointerStateSource,
  _pointerIsInContact,
  _pointerStateOf,
  PointerState,
};
