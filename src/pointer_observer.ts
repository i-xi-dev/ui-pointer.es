import { Geometry2d, Keyboard } from "@i-xi-dev/ui-utils";

/**
 * The identifier for the pointer.
 */
type pointerid = number;

type timestamp = number;

type milliseconds = number;

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

function _pointerTrackFrom(event: PointerEvent, target: Element): Pointer.Track {
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
    _type: event.type,
  });
}

type _PointerTrackSequenceOptions = {
  signal?: AbortSignal,
};

class _PointerTrackSequence implements Pointer.TrackSequence<Pointer.Track> {
  readonly #pointerId: pointerid;
  readonly #pointerType: string;
  readonly #primaryPointer: boolean;
  readonly #stream: ReadableStream<Pointer.Track>;
  readonly #target: Element;

  #controller: ReadableStreamDefaultController<Pointer.Track> | null = null;
  #firstTrack: Pointer.Track | null = null;
  #lastTrack: Pointer.Track | null = null;
  #absoluteX: number = 0;
  #absoluteY: number = 0;

  constructor(event: PointerEvent, target: Element, options: _PointerTrackSequenceOptions = {}) {
    this.#pointerId = event.pointerId;
    this.#pointerType = event.pointerType;
    this.#primaryPointer = event.isPrimary;
    const start = (controller: ReadableStreamDefaultController<Pointer.Track>): void => {
      if (options.signal) {
        options.signal.addEventListener("abort", () => {
          controller.close();
        }, { passive: true });
      }
      this.#controller = controller;
    };
    this.#stream = new ReadableStream({
      start,
    });
    this.#target = target;
  }

  get pointerId(): pointerid {
    return this.#pointerId;
  }

  get pointerType(): string {
    return this.#pointerType;
  }

  get primaryPointer(): boolean {
    return this.#primaryPointer;
  }

  get startTime(): timestamp {
    return this.#firstTrack ? this.#firstTrack.timestamp : Number.NaN;
  }

  get duration(): milliseconds {
    return this.#lastTrack ? (this.#lastTrack.timestamp - this.startTime) : Number.NaN;
  }

  get stream(): ReadableStream<Pointer.Track> {
    return this.#stream;
  }

  get movement(): Pointer.Movement {
    if (this.#lastTrack && this.#firstTrack) {
      return Object.freeze({
        relativeX: (this.#lastTrack.offset.fromViewport.x - this.#firstTrack.offset.fromViewport.x),
        relativeY: (this.#lastTrack.offset.fromViewport.y - this.#firstTrack.offset.fromViewport.y),
        absoluteX: this.#absoluteX,
        absoluteY: this.#absoluteY,
      });
    }
    return Object.freeze({
      relativeX: 0,
      relativeY: 0,
      absoluteX: 0,
      absoluteY: 0,
    });
  }

  get target(): Element {
    return this.#target;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Pointer.Track, void, void> {
    const streamReader = this.#stream.getReader();
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

  _terminate(): void {
    if (this.#controller) {
      this.#controller.close();
    }
  }

  _append(event: PointerEvent): void {
    if (this.#controller) {
      const track: Pointer.Track = _pointerTrackFrom(event, this.#target);
      if (!this.#firstTrack) {
        this.#firstTrack = track;
      }
      if (this.#lastTrack) {
        this.#absoluteX = this.#absoluteX + Math.abs(this.#lastTrack.offset.fromViewport.x - track.offset.fromViewport.x);
        this.#absoluteY = this.#absoluteY + Math.abs(this.#lastTrack.offset.fromViewport.y - track.offset.fromViewport.y);
      }
      this.#lastTrack = track;
      this.#controller.enqueue(track);
    }
  }
}

type _PointerFilter = (event: PointerEvent) => boolean;

// ダブルタップのズームは最近のiOSでは出来ない →他の手段でズームしたのをダブルタップで戻すことはできる
// パン無効にする場合タブレット等でスクロール手段がなくなるので注意。スクロールが必要な場合は自前でスクロールを実装すること
// （広い範囲で）ズーム無効にする場合タブレット等で自動ズームを元に戻す手段がなくなるので注意（小さい入力欄にフォーカスしたとき等に自動ズームされる）
//type _PointerAction = "contextmenu" | "pan" | "pinch-zoom" | "double-tap-zoom" | "selection";// CSS touch-actionでは、ダブルタップズームだけを有効化する手段がない
type _PointerAction = "contextmenu" | "pan-and-zoom" | "selection";

type _TargetObservationOptions = {
  highPrecision?: boolean,
  pointerCapture?: _PointerFilter, // pointerdown前提、接触ありは固定条件
  //preventActions?: Array<_PointerAction>,//XXX 初期バージョンではとりあえず変更不可
  releaseImplicitPointerCapture?: boolean,//XXX 初期バージョンではとりあえず強制true
};

class _TargetObservation {
  readonly #aborter: AbortController;
  readonly #target: Element;
  readonly #callback: Pointer.ObserverCallback;
  readonly #trackSequences: Map<pointerid, Pointer.TrackSequence<Pointer.Track>>;
  readonly #capturingPointerIds: Set<pointerid>;

  readonly #highPrecision: boolean;
  readonly #pointerCapture: _PointerFilter;
  readonly #preventActions: Array<_PointerAction>;
  readonly #releaseImplicitPointerCapture: boolean;

  constructor(target: Element, callback: Pointer.ObserverCallback, options: _TargetObservationOptions) {
    this.#aborter = new AbortController();
    this.#target = target;
    this.#callback = callback;
    this.#trackSequences = new Map();
    this.#capturingPointerIds = new Set();

    this.#highPrecision = (options?.highPrecision === true) && !!(new PointerEvent("test")).getCoalescedEvents;// webkit未実装:getCoalescedEvents
    if (typeof options?.pointerCapture === "function") {
      this.#pointerCapture = options.pointerCapture;
    }
    else {
      this.#pointerCapture = () => false;
    }
    //this.#preventActions = ((options?.preventActions) && (Array.isArray(options.preventActions) === true)) ? [...options.preventActions] : ["contextmenu", "pan-and-zoom", "doubletap-zoom", "selection"];
    this.#preventActions = ["contextmenu", "pan-and-zoom", "selection"];
    this.#releaseImplicitPointerCapture = (options?.releaseImplicitPointerCapture === true);

    const listenerOptions = {
      passive: true,
      signal: this.#aborter.signal,
    };

    const activeListenerOptions = {
      passive: false,
      signal: this.#aborter.signal,
    };

    if (this.#preventActions.length > 0) {
      const targetStyle = (this.#target as unknown as ElementCSSInlineStyle).style;
      if (targetStyle) {
        if (this.#preventActions.includes("selection") === true) {
          targetStyle.setProperty("-webkit-user-select", "none", "important"); // safari向け（chromeもfirefoxも接頭辞は不要）
          targetStyle.setProperty("user-select", "none", "important");
        }

        if (this.#preventActions.includes("pan-and-zoom") === true) {
          targetStyle.setProperty("touch-action", "none", "important");
        }
      }

      if (this.#preventActions.includes("contextmenu") === true) {
        this.#target.addEventListener("contextmenu", ((event: MouseEvent) => {
          event.preventDefault();
        }) as EventListener, activeListenerOptions);
      }
    }

    this.#target.addEventListener("pointerdown", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      const dispatcher = event.target as Element;

      if (this.#releaseImplicitPointerCapture === true) {
        if (dispatcher.hasPointerCapture(event.pointerId) === true) {
          // 暗黙のpointer captureのrelease
          dispatcher.releasePointerCapture(event.pointerId);
        }
      }

      // mouseで左ボタンが押されているか、pen/touchで接触がある場合
      if ((event.buttons & 0b1) === 0b1) {
        if (this.#capturingPointerIds.has(event.pointerId) === true) {
          return;
        }

        if (this.#pointerCapture(event) === true) {
          this.#capturingPointerIds.add(event.pointerId);
          dispatcher.setPointerCapture(event.pointerId);
        }
      }
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointerup", ((event: PointerEvent): void => {
      if ((event.buttons & 0b1) === 0b0) {
        (event.target as Element).releasePointerCapture(event.pointerId);
        this.#capturingPointerIds.delete(event.pointerId);
      }
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointercancel", ((event: PointerEvent): void => {
      (event.target as Element).releasePointerCapture(event.pointerId);
      this.#capturingPointerIds.delete(event.pointerId);
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointerleave", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }

      this.handle(event);//XXX track追加は不要かも（座標などはwindowのpointerup等とおそらく同じ。常時必ず同じかは？）
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointerenter", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }

      this.handle(event);//XXX track追加は不要かも（座標などはwindowのpointermove等とおそらく同じ。常時必ず同じかは？）
    }) as EventListener, listenerOptions);
  }

  get target(): Element {
    return this.#target;
  }

  handle(event: PointerEvent): void {
    let trackSequence: _PointerTrackSequence;

    if (event.composedPath().includes(this.#target) === true) {
      if (this.#trackSequences.has(event.pointerId) !== true) {
        trackSequence = new _PointerTrackSequence(event, this.#target);
        this.#trackSequences.set(event.pointerId, trackSequence);
        trackSequence._append(event);
        this.#callback(trackSequence);
      }
      else {
        trackSequence = this.#trackSequences.get(event.pointerId) as _PointerTrackSequence;
        if ((this.#highPrecision === true) && (event.type === "pointermove")) {
          for (const coalesced of event.getCoalescedEvents()) {
            trackSequence._append(coalesced);
          }
        }
        else {
          trackSequence._append(event);
        }
      }

      if (["pointercancel", "pointerleave"].includes(event.type) === true) {
        this.#trackSequences.delete(event.pointerId);
        trackSequence._terminate();
      }
    }
    else {
      if (this.#trackSequences.has(event.pointerId) === true) {
        trackSequence = this.#trackSequences.get(event.pointerId) as _PointerTrackSequence;
        this.#trackSequences.delete(event.pointerId);
        trackSequence._terminate();
      }
    }
  }

  dispose(): void {
    this.#aborter.abort();
  }
}

class _ViewportPointerTracker {
  static #instance: _ViewportPointerTracker | null = null;

  readonly #aborter: AbortController;
  readonly #view: Window;
  readonly #targetObservations: Set<_TargetObservation>;

  private constructor(view: Window) {
    this.#aborter = new AbortController();
    this.#view = view;
    this.#targetObservations = new Set();

    const listenerOptions = {
      passive: true,
      signal: this.#aborter.signal,
    };

    this.#view.addEventListener("pointerenter", (event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }

      console.log("1111")//TODO 起きる？
      this.#handle(event);
    }, listenerOptions);

    this.#view.addEventListener("pointerleave", (event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }

      console.log("2222")//TODO 起きる？
      this.#handle(event);
    }, listenerOptions);

    this.#view.addEventListener("pointermove", (event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }

      this.#handle(event);
    }, listenerOptions);

    this.#view.addEventListener("pointerdown", (event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }

      this.#handle(event);
    }, listenerOptions);

    this.#view.addEventListener("pointerup", (event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }

      this.#handle(event);
    }, listenerOptions);

    this.#view.addEventListener("pointercancel", (event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }

      this.#handle(event);
    }, listenerOptions);
  }
  //TODO 制限事項明記 どこかでpointereventをキャンセルされたら検知できなくなる

  static get(view: Window): _ViewportPointerTracker {
    if (!_ViewportPointerTracker.#instance) {
      _ViewportPointerTracker.#instance = new _ViewportPointerTracker(view);
    }
    return _ViewportPointerTracker.#instance;
  }

  dispose(): void {
    this.#targetObservations.forEach((targetObservation) => targetObservation.dispose());
    this.#targetObservations.clear();
    this.#aborter.abort();
  }

  addObservation(targetObservation: _TargetObservation): void {
    //if ([...this.#targetObservations].some((o) => o.target === targetObservation.target) === true) {
    //TODO 同一要素に対する監視を許すか
    //     基本的にはどうでもいいが、captureするなら問題になる（mouseのcaptureと、pen/touchのcaptureは両立しない）
    //}

    this.#targetObservations.add(targetObservation);
  }

  removeHandler(targetObservation: _TargetObservation): void {
    this.#targetObservations.delete(targetObservation);
  }

  #handle(event: PointerEvent): void {
    for (const targetObservation of this.#targetObservations) {
      targetObservation.handle(event);
    }
  }
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
  // tangentialPressure,tiltX,tiltY,twist,altitudeAngle,azimuthAngle

  export interface Track {
    readonly timestamp: timestamp;
    readonly pointerId: pointerid;
    //readonly trustedPointer: boolean;
    readonly pointerState: State;
    readonly modifiers: Array<Modifier>;
    readonly buttons: (Array<MouseButton> | Array<PenButton>);
    readonly contact: Contact,
    readonly offset: {
      readonly fromViewport: Geometry2d.Point,
      readonly fromTargetBoundingBox: Geometry2d.Point,
    },
    readonly target: Element | null;
    readonly _type: string;//TODO
    //readonly _captured: boolean;// targetにcaptureされているか否か
    //readonly _capturedBy: Element | null;// captureしている要素 //XXX コストかかるのでは
  }
  // ,composedPath, ...

  export type Movement = {
    readonly relativeX: number,
    readonly relativeY: number,
    readonly absoluteX: number,
    readonly absoluteY: number,
  };

  export interface TrackSequence<T extends Track> {
    readonly pointerId: pointerid;
    readonly pointerType: string;
    readonly primaryPointer: boolean;// 途中で変わることはない（複数タッチしてプライマリを離した場合、タッチを全部離すまでプライマリは存在しなくなる）
    readonly startTime: timestamp;
    readonly duration: milliseconds;
    readonly stream: ReadableStream<T>;
    readonly movement: Movement;
    readonly target: Element;
    readonly [Symbol.asyncIterator]: () => AsyncGenerator<T, void, void>;
  }

  export type ObserverCallback = (trackSequence: TrackSequence<Track>) => void;

  export type ObserverOptions = {

  };

  export class Observer {
    readonly #callback: ObserverCallback;
    readonly #service: _ViewportPointerTracker;

    constructor(callback: ObserverCallback, options: ObserverOptions) {
      this.#callback = callback;
      this.#service = _ViewportPointerTracker.get(window);
    }

    observe(target: Element): void {
      const observation = new _TargetObservation(target, this.#callback, {

        releaseImplicitPointerCapture: true,
      });
      this.#service.addObservation(observation);
    }

    unobserve(target: Element): void {
  
    }

    disconnect(): void {
  
    }
  }
  
}

/*
TODO
- capture始点からの相対距離
- capture終点はtarget上か否か
- touchmoveキャンセル
- optionsでフィルタ対応
- optionsで合成イベント対応
- orientationchange
- 中クリックの自動スクロールがpointerdown
- maxTouchPointsで上限設定する
*/

/*
  options
    type: "mouse" | "pen" | "touch"
    primary: boolean
    captureWhenContact: boolean
    mode: 
      hover,    (mouse-no-buttons, pen-hover, -)
      contact,  (mouse-left-button, pen-contact, touch-contact)
    modifier: mouse-button, pen-button, key
*/
export {
  Pointer,
};

