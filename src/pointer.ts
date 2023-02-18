import { Geometry2d, Keyboard } from "@i-xi-dev/ui-utils";

/**
 * The identifier for the pointer.
 */
type pointerid = number;

type milliseconds = number;

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

function _pointerStateOf(event: PointerEvent): Pointer.State {
  if (event.type === "pointercancel") {
    return Pointer.State.INACTIVE;
  }
  else if (event.buttons === 0) {
    return Pointer.State.HOVER;
  }
  else {
    return Pointer.State.CONTACT;
  }
}

function _mouseButtonsOf(event: PointerEvent): Array<Pointer.MouseButton> {
  const mouseButtons: Array<Pointer.MouseButton> = [];
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

namespace Pointer {
  export const Type = {
    MOUSE: "mouse",
    PEN: "pen",
    TOUCH: "touch",
    UNKNOWN: "",
  } as const;

  /**
   * The pointer identification.
   */
  export type Identification = {
    readonly id: pointerid,
    readonly type: string,
    readonly isPrimary: boolean,
    readonly isTrusted: boolean,
  };
  export namespace Identification {
    export function of(event: PointerEvent): Pointer.Identification {
      return Object.freeze({
        id: event.pointerId,
        type: event.pointerType,
        isPrimary: event.isPrimary,
        isTrusted: event.isTrusted,
      });
    }
  }

  export type Geometry = Geometry2d.Point & {// x/yはviewport座標
    readonly rx: number,
    readonly ry: number,
  };
  export namespace Geometry {
    export function of(event: PointerEvent): Pointer.Geometry {
      return Object.freeze({
        x: event.clientX,
        y: event.clientY,
        rx: (event.width / 2),
        ry: (event.height / 2),
      });
    }
  }

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
    //LEFT: "left", stateがcontactかどうか
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

  export interface Track {
    readonly pointer: Identification;
    readonly timestamp: number;
    readonly state: State,
    readonly modifiers: Array<Modifier>,
    readonly buttons: (Array<MouseButton> | Array<PenButton>),
    readonly geometry: Geometry;
    // pressure,tangentialPressure,tiltX,tiltY,twist,altitudeAngle,azimuthAngle
    // ,composedPath, ...
    readonly insetX: number; // offset from target bounding box. target is tracking target (event listener invoker)
    readonly insetY: number; // offset from target bounding box. target is tracking target (event listener invoker)
    readonly dispatcher: Element | null; // event dispatcher
  };

  export interface TrackingResult<T extends Track> {
    readonly pointer: Identification;
    readonly duration: milliseconds;
    readonly startGeometry: Geometry; // x/yはviewport座標
    readonly endGeometry: Geometry; // x/yはviewport座標
    readonly absoluteX: number; // 絶対移動量
    readonly absoluteY: number; // 絶対移動量
  }

  export abstract class Tracking<T extends Track> {
    readonly #pointer: Identification;
    readonly #trackStream: ReadableStream<T>;
    #controller: ReadableStreamDefaultController<T> | null = null;
    #result: TrackingResult<T> | null = null;
    #firstAppended: T | null = null;
    #lastAppended: T | null = null;
    #duration: milliseconds = 0;
    #absoluteX: number = 0;
    #absoluteY: number = 0;

    constructor(pointer: Identification, signal: AbortSignal) {
      this.#pointer = pointer;
      const start = (controller: ReadableStreamDefaultController<T>) => {
        signal.addEventListener("abort", () => {
          controller.close();
        }, { passive: true });
        this.#controller = controller;
      };
      this.#trackStream = new ReadableStream({
        start,
      });
    }

    get pointer(): Identification {
      return this.#pointer;
    }

    get stream(): ReadableStream<T> {
      return this.#trackStream;
    }

    protected get _firstTrack(): T | null {
      return this.#firstAppended;
    }

    protected get _lastTrack(): T | null {
      return this.#lastAppended;
    }

    terminate(): void {
      if (!!this.#controller) {
        this.#controller.close();
      }
    }

    protected abstract _trackFromPointerEvent(event: PointerEvent): T;

    protected _baseTrackFromPointerEvent(event: PointerEvent): Track {
      const pointer = Identification.of(event);
      const state = _pointerStateOf(event);
      const modifiers = _pointerModifiersOf(event);
      let buttons: (Array<MouseButton> | Array<PenButton>);
      if (event.pointerType === Type.MOUSE) {
        buttons = _mouseButtonsOf(event);
      }
      else if (event.pointerType === Type.PEN) {
        buttons = _penButtonsOf(event);
      }
      else {
        buttons = [];
      }
      const geometry = Geometry.of(event);

      const dispatcher = (event.target instanceof Element) ? event.target : null;
      let insetX = Number.NaN;
      let insetY = Number.NaN;

      if (!!dispatcher) {
        insetX = event.offsetX;
        insetY = event.offsetY;
      }

      // targetはcurrentTargetの子孫である可能性（すなわちevent.offsetX/YがcurrentTargetの座標ではない可能性）
      if (!!dispatcher && !!event.currentTarget && (event.currentTarget !== dispatcher)) {
        // ここに分岐するのは、pointerdownの時のみ（pointer captureを使用しているので）
        const currentTargetBoundingBox = (event.currentTarget as Element).getBoundingClientRect();
        const targetBoundingBox = (dispatcher as Element).getBoundingClientRect();
        const { x, y } = Geometry2d.Point.distanceBetween(currentTargetBoundingBox, targetBoundingBox);
        insetX = insetX + x;
        insetY = insetY + y;
      }

      return Object.freeze({
        pointer,
        timestamp: event.timeStamp,
        state,
        modifiers,
        buttons,
        geometry,
        insetX,
        insetY,
        dispatcher,
      });
    }

    append(event: PointerEvent): void {
      if (!!this.#controller) {
        const track: T = this._trackFromPointerEvent(event);
        if (!this.#firstAppended) {
          this.#firstAppended = track;
        }
        if (!!this.#lastAppended) {
          this.#duration = (this.#lastAppended.timestamp - this.#firstAppended.timestamp);
          this.#absoluteX = this.#absoluteX + Math.abs(this.#lastAppended.geometry.x - track.geometry.x);
          this.#absoluteY = this.#absoluteY + Math.abs(this.#lastAppended.geometry.y - track.geometry.y);
        }
        this.#lastAppended = track;
        this.#controller.enqueue(track);
      }
    }

    readAll(ontrack?: (track: T) => void): Promise<TrackingResult<T>> {
      return new Promise(async (resolve, reject) => {
        try {
          for await (const track of this.tracks()) {
            if (!!ontrack) {
              ontrack(track);
            }
          }

          resolve(this.#result as TrackingResult<T>);
          return;
        }
        catch (exception) {
          reject(exception);
        }
      });
    }

    protected _currentResult(): TrackingResult<T> {
      if (!this.#firstAppended || !this.#lastAppended) {
        throw new Error("TODO");
      }

      return Object.freeze({
        pointer: this.#pointer,
        duration: this.#duration,
        startGeometry: Object.freeze(Object.assign({}, this.#firstAppended.geometry)),
        endGeometry: Object.freeze(Object.assign({}, this.#lastAppended.geometry)),
        absoluteX: this.#absoluteX,
        absoluteY: this.#absoluteY,
      });
    }

    async * tracks(): AsyncGenerator<T, void, void> {
      for await (const track of this.#tracks()) {
        yield track;
      }

      this.#result = this._currentResult();
      return;
    }

    // ReadableStream#[Symbol.asyncIterator]がブラウザでなかなか実装されないので…
    async * #tracks(): AsyncGenerator<T, void, void> {
      const streamReader = this.#trackStream.getReader();
      try {
        for (let i = await streamReader.read(); (i.done !== true); i = await streamReader.read()) {
          yield i.value;
        }
        return;
      }
      finally {
        streamReader.releaseLock();
      }
    }
  }

  export interface TrackingTask<T extends Track> {
    readonly pointer: Pointer.Identification;
    readonly target: Element | null, // PointerCaptureの場合は必ずElement その他の場合でviewportを監視している場合はnull それ以外ではElement
    readonly stream: ReadableStream<T>;
    readonly [Symbol.asyncIterator]: () => AsyncGenerator<T, void, void>;
    readonly consume: (ontrack?: (track: T) => void) => Promise<TrackingResult<T>>;
  }

  export type DetectedCallback<T extends Track> = (tracks: TrackingTask<T>) => (void | Promise<void>);

  export type DetectionFilterSource = {
    pointerType?: Array<string>,
    primaryPointer?: boolean,

    custom?: (event: PointerEvent) => boolean,// 位置でフィルタとか、composedPath()でフィルタとか、
    disableDefaultFilter?: boolean,
  };

  export type DetectionOptions = {

    filter?: DetectionFilterSource,

    highPrecision?: boolean,

    setTouchActionNone?: boolean, // trueにする場合タブレット等でスクロール手段がなくなるので注意。スクロールが必要な場合は自前でスクロールを実装すること

  };

  export function observe(target: Element, callback: DetectedCallback<Track>, options: DetectionOptions = {}): void {
    //TODO
  }

  export function unobserve(target: Element): void {
    //TODO
  }

}

export {
  type pointerid,
  Pointer,
};
