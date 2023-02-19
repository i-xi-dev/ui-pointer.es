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
    // LEFT: "left", stateがcontactかどうか
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
    readonly state: State;
    readonly modifiers: Array<Modifier>;
    readonly buttons: (Array<MouseButton> | Array<PenButton>);
    readonly geometry: Geometry;
    // pressure,tangentialPressure,tiltX,tiltY,twist,altitudeAngle,azimuthAngle
    // ,composedPath, ...
    readonly insetX: number; // offset from target bounding box. target is tracking target (event listener invoker)
    readonly insetY: number; // offset from target bounding box. target is tracking target (event listener invoker)
    readonly dispatcher: Element | null; // event dispatcher
  }

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
    #absoluteX = 0;
    #absoluteY = 0;

    constructor(pointer: Identification, signal: AbortSignal) {
      this.#pointer = pointer;
      const start = (controller: ReadableStreamDefaultController<T>): void => {
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
      if (this.#controller) {
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

      if (dispatcher) {
        insetX = event.offsetX;
        insetY = event.offsetY;
      }

      // targetはcurrentTargetの子孫である可能性（すなわちevent.offsetX/YがcurrentTargetの座標ではない可能性）
      if (!!dispatcher && !!event.currentTarget && (event.currentTarget !== dispatcher)) {
        // ここに分岐するのは、pointerdownの時のみ（pointer captureを使用しているので）
        const currentTargetBoundingBox = (event.currentTarget as Element).getBoundingClientRect();
        const targetBoundingBox = dispatcher.getBoundingClientRect();
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
      if (this.#controller) {
        const track: T = this._trackFromPointerEvent(event);
        if (!this.#firstAppended) {
          this.#firstAppended = track;
        }
        if (this.#lastAppended) {
          this.#duration = (this.#lastAppended.timestamp - this.#firstAppended.timestamp);
          this.#absoluteX = this.#absoluteX + Math.abs(this.#lastAppended.geometry.x - track.geometry.x);
          this.#absoluteY = this.#absoluteY + Math.abs(this.#lastAppended.geometry.y - track.geometry.y);
        }
        this.#lastAppended = track;
        this.#controller.enqueue(track);
      }
    }

    async readAll(ontrack?: (track: T) => void): Promise<TrackingResult<T>> {
      // try {
      for await (const track of this.tracks()) {
        if (ontrack) {
          ontrack(track);
        }
      }

      return this.#result as TrackingResult<T>;
      // }
      // catch (exception) {
      //   throw exception;
      // }
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
    readonly target: Element | null; // PointerCaptureの場合は必ずElement その他の場合でviewportを監視している場合はnull それ以外ではElement
    readonly stream: ReadableStream<T>;
    readonly [Symbol.asyncIterator]: () => AsyncGenerator<T, void, void>;
    readonly consume: (ontrack?: (track: T) => void) => Promise<TrackingResult<T>>;
  }

  export type DetectedCallback<T extends Track> = (tracks: TrackingTask<T>) => (void | Promise<void>);

  export type DetectionFilterSource = {
    pointerType?: Array<string>,
    primaryPointer?: boolean,

    custom?: (event: PointerEvent) => boolean, // 位置でフィルタとか、composedPath()でフィルタとか、
    disableDefaultFilter?: boolean,
  };

  export type DetectionOptions = {

    filter?: DetectionFilterSource,

    highPrecision?: boolean,

    setTouchActionNone?: boolean, // trueにする場合タブレット等でスクロール手段がなくなるので注意。スクロールが必要な場合は自前でスクロールを実装すること

  };

  export abstract class DetectionFilter {
    protected readonly _pointerTypes: Array<string>;
    protected readonly _primaryPointer: boolean;
    protected readonly _customFilter: (event: PointerEvent) => boolean;
    protected readonly _disableDefaultFilter: boolean;
    constructor(filterSource: DetectionFilterSource = {}) {
      this._pointerTypes = Array.isArray(filterSource.pointerType) ? filterSource.pointerType : [ Pointer.Type.MOUSE, Pointer.Type.PEN, Pointer.Type.TOUCH ];
      this._primaryPointer = (filterSource.primaryPointer === true);
      this._customFilter = (typeof filterSource.custom === "function") ? filterSource.custom : (): boolean => true;
      this._disableDefaultFilter = (filterSource.disableDefaultFilter === true);
    }
    abstract filter(event: PointerEvent): boolean;
  }

  export abstract class TrackingTarget<T extends Track> {
    readonly #target: Element;
    readonly #highPrecision: boolean;
    readonly #eventListenerAborter: AbortController;
    protected readonly _trackingMap: Map<pointerid, Tracking<T>>;
    constructor(target: Element, callback: DetectedCallback<T>, options: DetectionOptions) {
      this.#target = target;
      this.#highPrecision = (options.highPrecision === true) && !!(new PointerEvent("test")).getCoalescedEvents;// safariが未実装:getCoalescedEvents
      this.#eventListenerAborter = new AbortController();
      this._trackingMap = new Map();

      if (options.setTouchActionNone === true) {
        this._targetStyle.setProperty("touch-action", "none", "important");
      }
    }

    get target(): Element {
      return this.#target;
    }
    protected get _targetStyle(): CSSStyleDeclaration {
      return (this.#target as unknown as ElementCSSInlineStyle).style;
    }
    protected get _passiveOptions(): AddEventListenerOptions {
      return {
        passive: true,
        signal: this.#eventListenerAborter.signal,
      };
    }
    protected get _activeOptions(): AddEventListenerOptions {
      return {
        passive: false,
        signal: this.#eventListenerAborter.signal,
      };
    }
    protected get _signal(): AbortSignal {
      return this.#eventListenerAborter.signal;
    }

    disconnect(): void {
      this.#eventListenerAborter.abort();
      this._trackingMap.clear();
    }

    protected _pushTrack(event: PointerEvent): void {
      if (this._trackingMap.has(event.pointerId) === true) {
        const tracking = this._trackingMap.get(event.pointerId) as Tracking<T>;

        if ((this.#highPrecision === true) && (event.type === "pointermove")) {
          for (const coalesced of event.getCoalescedEvents()) {
            tracking.append(coalesced);
          }
        }
        else {
          tracking.append(event);
        }
      }
    }

    protected _pushEndTrack(event: PointerEvent): void {
      if (this._trackingMap.has(event.pointerId) === true) {
        const tracking = this._trackingMap.get(event.pointerId) as Tracking<T>;
  
        tracking.append(event);

        // 分離する？
        tracking.terminate();
        this._trackingMap.delete(event.pointerId);
      }
    }
  }

  export function observe(target: Element, callback: DetectedCallback<Track>, options: DetectionOptions = {}): void {
    const tracker = new _PointerTrackingTarget(target, callback, options);
    _pointerTrackingTargetRegistry.set(target, tracker);
  }

  export function unobserve(target: Element): void {
    const tracker = _pointerTrackingTargetRegistry.get(target);
    if (tracker) {
      tracker.disconnect();
      _pointerTrackingTargetRegistry.delete(target);
    }
  }
}

class _PointerTracking extends Pointer.Tracking<Pointer.Track> {
  protected override _trackFromPointerEvent(event: PointerEvent): Pointer.Track {
    return this._baseTrackFromPointerEvent(event);
  }

}

class _PointerTrackingTarget extends Pointer.TrackingTarget<Pointer.Track> {

  constructor(target: Element, callback: Pointer.DetectedCallback<Pointer.Track>, options: Pointer.DetectionOptions) {
    super(target, callback, options);

    this.target.addEventListener("pointerenter", ((event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }

      if (this._trackingMap.has(event.pointerId) !== true) {
        this.#addTracking(event, callback);
      }
      this._pushTrack(event);
    }) as EventListener, this._passiveOptions);

    this.target.addEventListener("pointermove", ((event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }
      this._pushTrack(event);
    }) as EventListener, this._passiveOptions);

    this.target.addEventListener("pointerdown", ((event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }
      if ((event.target instanceof Element) && event.target.hasPointerCapture(event.pointerId)) {
        // 暗黙のpointer captureのrelease
        event.target.releasePointerCapture(event.pointerId);
      }
      this._pushTrack(event);
    }) as EventListener, this._passiveOptions);

    this.target.addEventListener("pointerup", ((event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }
      this._pushTrack(event);
    }) as EventListener, this._passiveOptions);

    this.target.addEventListener("pointerleave", ((event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }
      this._pushEndTrack(event);
    }) as EventListener, this._passiveOptions);

    this.target.addEventListener("pointercancel", ((event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }
      this._pushEndTrack(event);
    }) as EventListener, this._passiveOptions);

  }

  #addTracking(event: PointerEvent, callback: Pointer.DetectedCallback<Pointer.Track>): void {
    const pointer = Pointer.Identification.of(event);
    const tracking = new _PointerTracking(pointer, this._signal);
    this._trackingMap.set(event.pointerId, tracking);
    callback({
      pointer,
      target: this.target,
      stream: tracking.stream,
      [Symbol.asyncIterator]() {
        return tracking.tracks();
      },
      consume(ontrack?: (track: Pointer.Track) => void) {
        return tracking.readAll(ontrack);
      },
    });
  }
}

const _pointerTrackingTargetRegistry: WeakMap<Element, _PointerTrackingTarget> = new WeakMap();

// 既知の問題
// - Firefox
//   mouseで2つのpointerIdが同時にactiveになる事がある
//   再現条件不明 適当にマウス動かしながらタッチしまくると発生する
//   で、2つ目はpointerleave無しにいつのまにか消える（pointermoveが発生しなくなる）ので、Trackingが終了しないまま残ってしまう
//   発生する状況は限定的なものの、残ったTrackingが終了しているのかどうかは検知しようがないので致命的
//   → mouseの2つ目以降のpointerIdは無視しても実質問題ないか？
//   → penだとどうなるか要確認

// ターゲットのboundingBox外に位置する子孫の扱い
// Trackingは開始する仕様とする
// - ターゲットの子孫が何らかのCSS(position:absoluteなど)で、ターゲットのboundingBoxの外にある時
//   - その子孫でPointerEventが起きれば、当然ターゲットに伝播する
//   - このとき、PointerEventの座標でelementsFromPoint()したとき、ターゲットはヒットしない
//   - IntersectionObserverだとどうなる？
//   - 

export {
  type pointerid,
  Pointer,
};
