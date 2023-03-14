import { Geometry2d, Keyboard } from "@i-xi-dev/ui-utils";

/**
 * The identifier for the pointer.
 */
type pointerid = number;

type timestamp = number;

type milliseconds = number;

function _inContact(event: PointerEvent): boolean {
  return ((event.buttons & 0b1) === 0b1);
}

function _pointerStateOf(event: PointerEvent): Pointer.State {
  if (event.type === "pointercancel") {
    return Pointer.State.INACTIVE;
  }
  else if (_inContact(event) === true) {
    return Pointer.State.CONTACT;
  }
  else {
    return Pointer.State.HOVER;
  }
}

function _pointerModifiersOf(event: PointerEvent): Array<Pointer.Modifier> {
  const modifiers: Array<Pointer.Modifier> = [];
  if (event.altKey === true) {
    modifiers.push(Pointer.Modifier.ALT);
  }
  if (event.ctrlKey === true) {
    modifiers.push(Pointer.Modifier.CONTROL);
  }
  if (event.metaKey === true) {
    modifiers.push(Pointer.Modifier.META);
  }
  if (event.shiftKey === true) {
    modifiers.push(Pointer.Modifier.SHIFT);
  }
  return modifiers;
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
    mouseButtons.push(Pointer.MouseButton.X1);
  }
  if ((event.buttons & 0b10000) === 0b10000) {
    mouseButtons.push(Pointer.MouseButton.X2);
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

function _pointerTrackFrom(event: PointerEvent, target: Element, coalescedInto?: PointerEvent): Pointer.Track {
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
    timestamp: event.timeStamp,
    pointerId: event.pointerId,
    pointerState: _pointerStateOf(event),
    modifiers: _pointerModifiersOf(event),
    buttons: (event.pointerType === Pointer.Type.PEN) ? _penButtonsOf(event) : _mouseButtonsOf(event),
    contact: Object.freeze({
      radiusX: event.width / 2,
      radiusY: event.height / 2,
      pressure: event.pressure,
    }),
    offset: Object.freeze({
      fromViewport: Object.freeze({
        x: event.clientX,
        y: event.clientY,
      }),
      fromTargetBoundingBox: Object.freeze({
        x: targetX,
        y: targetY,
      }),
    }),
    target,
    sourceType: event.type,
    coalescedInto: (coalescedInto ? coalescedInto.timeStamp : null),
    captured: target.hasPointerCapture(event.pointerId),
  });
}

namespace Pointer {
  export const Type = {
    MOUSE: "mouse",
    PEN: "pen",
    TOUCH: "touch",
    UNKNOWN: "",
  } as const;

  export const State = {
    CONTACT: "contact",
    HOVER: "hover",
    INACTIVE: "inactive",
  } as const;
  export type State = typeof State[keyof typeof State];

  export const Modifier = {
    ALT: Keyboard.Key.ALT,
    CONTROL: Keyboard.Key.CONTROL,
    META: Keyboard.Key.META,
    SHIFT: Keyboard.Key.SHIFT,
  } as const;
  export type Modifier = typeof Modifier[keyof typeof Modifier];

  export const MouseButton = {
    LEFT: "left",
    MIDDLE: "middle",
    RIGHT: "right",
    X1: "x1",
    X2: "x2",
  } as const;
  export type MouseButton = typeof MouseButton[keyof typeof MouseButton];

  export const PenButton = {
    BARREL: "barrel",
    ERASER: "eraser",
  } as const;
  export type PenButton = typeof PenButton[keyof typeof PenButton];

  export type Contact = {
    readonly radiusX: number,
    readonly radiusY: number,
    readonly pressure: number,
  };
  //XXX tangentialPressure,tiltX,tiltY,twist,altitudeAngle,azimuthAngle

  export interface Track {
    readonly timestamp: timestamp;
    readonly pointerId: pointerid;
    //readonly trustedSource: boolean;
    readonly pointerState: State;
    readonly modifiers: Array<Modifier>;
    readonly buttons: (Array<MouseButton> | Array<PenButton>);
    readonly contact: Contact,
    readonly offset: {
      readonly fromViewport: Geometry2d.Point,
      readonly fromTargetBoundingBox: Geometry2d.Point,
    },
    readonly target: Element | null;
    readonly sourceType: string;
    readonly coalescedInto: timestamp | null;// timestampだと合体先を特定できない可能性があるが、いちいちid振るのもなんなので妥協
    readonly captured: boolean;// 「targetに」captureされているか否か
    //XXX touches
  }
  // ,composedPath, ...

  export type Movement = {
    readonly relativeX: number,
    readonly relativeY: number,
    readonly absoluteX: number,
    readonly absoluteY: number,
  };

  export interface TrackSequence {
    readonly pointerId: pointerid;
    readonly pointerType: string;
    readonly primaryPointer: boolean;// 途中で変わることはない（複数タッチしてプライマリを離した場合、タッチを全部離すまでプライマリは存在しなくなる。その状態でタッチを増やしてもプライマリは無い）
    readonly startTime: timestamp;
    readonly duration: milliseconds;
    readonly stream: ReadableStream<Track>;
    readonly movement: Movement;
    readonly target: Element;
    readonly [Symbol.asyncIterator]: () => AsyncGenerator<Track, void, void>;
  }

  export type Filter = {
    pointerType?: Iterable<string>,
    primaryPointer?: boolean,
    // custom?: (event: PointerEvent) => boolean, //XXX これに対応するなら終了条件も必ず指定させる必要 → これこそstreamの消費側でフィルタすれば良いので、とりあえず対応しない
  };

}

export {
  type pointerid,
  _inContact,
  _pointerTrackFrom,
  Pointer,
};
