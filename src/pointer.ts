import { Geometry2d } from "./geometry_2d";
import { BoundingBox } from "./bounding_box";
import { Viewport } from "./viewport";

// 対象要素の子孫でのpointerイベントが必要ない場合は、子孫はpointer-events:none推奨

//XXX 非pontercaptureのトラッカーを追加

type pointerid = number;// integer
type milliseconds = number;

namespace _PointerIdentification {
  export function fromPointerEvent(event: PointerEvent): Pointer.Identification {
    return Object.freeze({
      id: event.pointerId,
      type: event.pointerType,
      isPrimary: event.isPrimary,
    });
  }
}

namespace _PointerGeometry {
  export function fromPointerEvent(event: PointerEvent): Pointer.Geometry {
    return Object.freeze({
      point: Object.freeze({
        x: event.clientX,
        y: event.clientY,
      }),
      size: Object.freeze({
        width: event.width,
        height: event.height,
      }),
    });
  }
}

namespace _PointerTrack {
  export function fromPointerEvent(event: PointerEvent): Pointer.Track {
    const pointer = _PointerIdentification.fromPointerEvent(event);
    const geometry = _PointerGeometry.fromPointerEvent(event);
    const offsetFromTarget = {
      x: event.offsetX,
      y: event.offsetY,
    };

    // targetはcurrentTargetの子孫である可能性（すなわちevent.offsetX/YがcurrentTargetの座標ではない可能性）
    if (!!event.target && !!event.currentTarget && (event.currentTarget !== event.target)) {
      const currentTargetBoundingBox = BoundingBox.of(event.currentTarget as Element);
      const targetBoundingBox = BoundingBox.of(event.target as Element);
      const { x, y } = Geometry2d.Point.distanceBetween(currentTargetBoundingBox, targetBoundingBox);
      offsetFromTarget.x = offsetFromTarget.x - x;
      offsetFromTarget.y = offsetFromTarget.y - y;
    }

    const pointerState = (event.type === "pointercancel") ? Pointer.State.LOST : Pointer.State.ACTIVE;
    let trackingPhase: Pointer.TrackingPhase;
    switch (event.type) {
      case "pointerdown":
        trackingPhase = Pointer.TrackingPhase.START;
        break;
      case "pointermove":
        trackingPhase = Pointer.TrackingPhase.PROGRESS;
        break;
      case "pointerup":
      case "pointercancel":
        trackingPhase = Pointer.TrackingPhase.END;
        break;
      default:
        trackingPhase = Pointer.TrackingPhase.UNDEFINED;
        // pointerup,pointercancelの後は_PointerTrack.fromPointerEventを呼んでいないのでありえない
        break;
    }

    return {
      pointer,
      timestamp: event.timeStamp,
      geometry,
      offsetFromTarget,
      pointerState,
      trackingPhase,
    };
  }
}

type _ExtraRecord = {
  readonly timestamp: number,
  readonly exteriaGeometry: {
    target: Readonly<BoundingBox>,
    viewport: Readonly<Viewport>,
  },
};
namespace _ExtraRecord {
  export function fromPointerEvent(event: PointerEvent): _ExtraRecord {
    return Object.freeze({
      timestamp: event.timeStamp,
      exteriaGeometry: Object.freeze({
        viewport: Viewport.from(event.view as Window),
        target: BoundingBox.of(event.currentTarget as Element),
      }),
    });
  }
}

type _PointerTrackerInternals = {
  readonly pointer: Pointer.Identification,
  readonly controller: ReadableStreamDefaultController<Pointer.Track>,
};

class _PointerTracking implements Pointer.Tracking {
  readonly #pointer: Pointer.Identification;
  readonly #tracker: _PointerTracker;
  readonly #task: Promise<Pointer.TrackingResult>;
  #onTrackingComplete: (value: Pointer.TrackingResult) => void = (): void => undefined;
  #onTrackingFail: (reason?: any) => void = (): void => undefined;
  readonly #trackStream: ReadableStream<Pointer.Track>;

  constructor(pointer: Pointer.Identification, tracker: _PointerTracker, trackStream: ReadableStream<Pointer.Track>) {
    this.#pointer = pointer;
    this.#tracker = tracker;
    this.#task = new Promise((resolve, reject) => {
      this.#onTrackingComplete = resolve;
      this.#onTrackingFail = reject;
    });
    this.#trackStream = trackStream;
  }

  get pointer(): Pointer.Identification {
    return this.#pointer;
  }

  //TODO-1st これだとstreamを消費しないかぎりPromiseが永遠に未解決になる
  //        結果だけほしい場合に対応できない
  get result(): Promise<Pointer.TrackingResult> {
    return this.#task;
  }

  //XXX ReadableStream#[Symbol.asyncIterator]がブラウザでなかなか実装されないので…
  async * tracks(): AsyncGenerator<Pointer.Track, void, void> {
  //async *[Symbol.asyncIterator](): AsyncGenerator<Pointer.Track, void, void> {
    try {
      let firstTrack: Pointer.Track | undefined = undefined;
      let lastTrack: Pointer.Track | undefined = undefined;
      for await (const track of this.#tracks()) {
        if (!firstTrack) {
          firstTrack = track;
        }
        lastTrack = track;
        yield track;
      }

      if (!firstTrack || !lastTrack) {
        throw new Error("TODO");
      }

      let duration: milliseconds = 0;
      let relativeX: number = 0;
      let relativeY: number = 0;

      duration = (lastTrack.timestamp - firstTrack.timestamp);
      const firstTrackPoint = firstTrack.geometry.point;
      const lastTrackPoint = lastTrack.geometry.point;
      relativeX = (lastTrackPoint.x - firstTrackPoint.x);
      relativeY = (lastTrackPoint.y - firstTrackPoint.y);

      const startPoint = { x: Number.NaN, y: Number.NaN };
      startPoint.x = firstTrackPoint.x;
      startPoint.y = firstTrackPoint.y;

      const endPoint = { x: Number.NaN, y: Number.NaN };
      endPoint.x = lastTrackPoint.x;
      endPoint.y = lastTrackPoint.y;
      const terminatedByPointerLost = (lastTrack.pointerState === Pointer.State.LOST);
      const endPointIntersectsTarget = !terminatedByPointerLost && (this.#tracker.containsPoint(endPoint) === true);

      this.#onTrackingComplete({
        pointer: firstTrack.pointer,
        duration,
        startPoint,
        endPoint,
        terminatedByPointerLost,
        relativeX,
        relativeY,
        endPointIntersectsTarget,
        extras: this.#tracker.extras,
      });
      return;
    }
    catch (exception) {
      this.#onTrackingFail(exception);
    }
  }

  async * #tracks(): AsyncGenerator<Pointer.Track, void, void> {
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

class _PointerTracker {
  readonly #element: Element;
  readonly #eventListenerAborter: AbortController;
  readonly #extras: Array<_ExtraRecord>;
  readonly #internalsMap: Map<pointerid, _PointerTrackerInternals>;
  readonly #filterPointerTypes: Array<string>;
  readonly #filterPrimaryPointer: boolean;
  readonly #filterMouseButtons: Array<Pointer.MouseButton>;
  readonly #filterPenButton: Array<Pointer.PenButton>;
  readonly #customFilter: (event: PointerEvent) => boolean;
  //readonly #maxConcurrentTrackings: number;
  readonly #highPrecision: boolean;

  constructor(element: Element, callback: Pointer.DetectedCallback, options: Pointer.TrackerOptions) {
    this.#element = element;
    this.#eventListenerAborter = new AbortController();
    this.#extras = [];
    this.#filterPointerTypes = (!!options.filter && Array.isArray(options.filter.pointerType)) ? [...options.filter.pointerType] : ["mouse", "pen", "touch"];
    this.#filterPrimaryPointer = (typeof options.filter?.primaryPointer === "boolean") ? options.filter.primaryPointer : true;
    this.#filterMouseButtons = (!!options.filter && Array.isArray(options.filter.mouseButtons)) ? [...options.filter.mouseButtons] : [];
    this.#filterPenButton = (!!options.filter && Array.isArray(options.filter.penButtons)) ? [...options.filter.penButtons] : [];
    this.#customFilter = (typeof options.filter?.custom === "function") ? options.filter.custom : () => true;
    //this.#maxConcurrentTrackings = Number.isSafeInteger(options.maxConcurrentTrackings) ? (options.maxConcurrentTrackings as number) : 1;
    this.#highPrecision = (options.highPrecision === true) && !!(new PointerEvent("test")).getCoalescedEvents;//XXX safariが未実装:getCoalescedEvents

    // タッチの場合にpointerupやpointercancelしなくても暗黙にreleasepointercaptureされるので強制設定する //XXX 値は設定可にする
    (this.#element as unknown as ElementCSSInlineStyle).style.setProperty("touch-action", "none", "important");

    const listenerOptions = {
      passive: true,
      signal: this.#eventListenerAborter.signal,
    };

    this.#internalsMap = new Map();

    this.#element.addEventListener("pointerdown", ((event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;// 受け付けるようにする場合は、pointerdownがtrustedでpointermoveが非trustedの場合の挙動をどうするか
      }
      if (this.#filter(event) !== true) {
        return;
      }
      // if (this.#internalsMap.size >= this.#maxConcurrentTrackings) {
      //   return;
      // }

      //XXX 暗黙のpointercaptureは、pointerdown時にhasPointerCaptureで判別できる
      //    と、仕様には記載があるが従っている実装はあるのか？（ChromeもFirefoxもpointerdownでhasPointerCaptureしても暗黙のpointercaptureを検出できない）
      //    検出できないと何か問題あるか？

      this.#element.setPointerCapture(event.pointerId);
      if (this.#element.hasPointerCapture(event.pointerId) === true) {
        // キャプチャできた場合のみ処理開始
        // キャプチャされない例
        // - Chromium系でマウスでthis.#elementのスクロールバーをpointerdownしたとき
        this.#startTracking(event, callback);
      }
    }) as EventListener, listenerOptions);

    // gotpointercaptureは使用しないことにする
    // setPointerCapture後、Firefoxは即座にgotpointercaptureが発火するのに対して、Chromeは次にpointermoveなどが発火する直前まで遅延される為

    this.#element.addEventListener("pointermove", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      //XXX hasPointerCaptureがfalseなら#release()呼ぶ？ pointermove以外でも
      this.#pushTrack(event);
    }) as EventListener, listenerOptions);

    //XXX pointerrawupdate設定可にする

    this.#element.addEventListener("pointerup", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      this.#pushLastTrack(event);
      this.#release(event);
    }) as EventListener, listenerOptions);

    // this.#element.addEventListener("pointerleave", ((event: PointerEvent): void => {
    //   console.log(event)
    // }) as EventListener, listenerOptions);

    this.#element.addEventListener("pointercancel", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      this.#pushLastTrack(event);
      this.#release(event);
    }) as EventListener, listenerOptions);

    // lostpointercaptureは使用しないことにする
    // Chrome,EdgeでpointerTypeがmouseのとき、スクロールバー上でpointerdownしたときに問題になる為
    // （スクロールバーがpointer captureを奪うので要素ではgotpointercaptureもlostpointercaptureも発火しない）
    // Firefoxはうまくやってるので、Chromiumの問題な気もするが
  }

  get element(): Element {
    return this.#element;
  }

  get #rootNode(): (Document | ShadowRoot) {
    const root = this.#element.getRootNode();// 毎回とるのもどうかと思うが、コンストラクタで取得するとまだconnectedされてないかもしれない＋再connectなどの検知が困難
    if ((root instanceof Document) || (root instanceof ShadowRoot)) {
      return root;
    }
    throw new Error("invalid state: element is not connected");
  }

  get extras(): Array<_ExtraRecord> {
    return this.#extras;
  }

  disconnect(): void {
    this.#eventListenerAborter.abort();
    this.#internalsMap.clear();
  }

  containsPoint(point: Viewport.Inset): boolean {
    return this.#rootNode.elementsFromPoint(point.x, point.y).includes(this.#element);
  }

  // event.buttonsの判定はpointerdown特化なので注意
  #filter(event: PointerEvent): boolean {
    if (this.#filterPointerTypes.includes(event.pointerType) !== true) {
      return false;
    }
    if ((this.#filterPrimaryPointer === true) && (event.isPrimary !== true)) {
      return false;
    }
    for (const button of this.#filterMouseButtons) {
      const pointerIsMouse = (event.pointerType === "mouse");
      switch (button) {
        case Pointer.MouseButton.LEFT:
          if (!(pointerIsMouse && ((event.buttons & 0b1) === 0b1))) {
            return false;
          }
          break;
        case Pointer.MouseButton.RIGHT:
          if (!(pointerIsMouse && ((event.buttons & 0b10) === 0b10))) {
            return false;
          }
          break;
        case Pointer.MouseButton.MIDDLE:
          if (!(pointerIsMouse && ((event.buttons & 0b100) === 0b100))) {
            return false;
          }
          break;
        case Pointer.MouseButton.X1:
          if (!(pointerIsMouse && ((event.buttons & 0b1000) === 0b1000))) {
            return false;
          }
          break;
        case Pointer.MouseButton.X2:
          if (!(pointerIsMouse && ((event.buttons & 0b10000) === 0b10000))) {
            return false;
          }
          break;
      }
    }
    for (const button of this.#filterPenButton) {
      const pointerIsPen = (event.pointerType === "pen");
      switch (button) {
        case Pointer.PenButton.NO_BUTTONS:
          if (!(pointerIsPen && ((event.buttons & 0b1) === 0b1))) {
            return false;
          }
          break;
        case Pointer.PenButton.BARREL:
          if (!(pointerIsPen && ((event.buttons & 0b10) === 0b10))) {
            return false;
          }
          break;
        case Pointer.PenButton.ERASER:
          if (!(pointerIsPen && ((event.buttons & 0b100000) === 0b100000))) {
            return false;
          }
          break;
      }
    }
    

    if (this.#customFilter(event) !== true) {
      return false;
    }
    return true;
  }

  #startTracking(event: PointerEvent, callback: Pointer.DetectedCallback): void {
    const pointer = _PointerIdentification.fromPointerEvent(event);
    const extras: Array<_ExtraRecord> = [];

    const start = (controller: ReadableStreamDefaultController<Pointer.Track>) => {
      const internals = {
        pointer,
        controller,
      };
      this.#internalsMap.set(event.pointerId, internals);

      this.#extras.push(_ExtraRecord.fromPointerEvent(event));
      const firstTrack = _PointerTrack.fromPointerEvent(event);
      controller.enqueue(firstTrack);
    };
    const cancel = () => {};

    const trackStream: ReadableStream<Pointer.Track> = new ReadableStream({
      start,
      cancel,
    });

    callback(new _PointerTracking(pointer, this, trackStream));
  }

  #pushTrack(event: PointerEvent): void {
    if (this.#internalsMap.has(event.pointerId) === true) {
      const internals = this.#internalsMap.get(event.pointerId) as _PointerTrackerInternals;

      if (this.#highPrecision === true) {
        for (const coalesced of event.getCoalescedEvents()) {
          internals.controller.enqueue(_PointerTrack.fromPointerEvent(coalesced));
        }
      }
      else {
        internals.controller.enqueue(_PointerTrack.fromPointerEvent(event));
      }
    }
  }

  #pushLastTrack(event: PointerEvent): void {
    if (this.#internalsMap.has(event.pointerId) === true) {
      const internals = this.#internalsMap.get(event.pointerId) as _PointerTrackerInternals;

      this.#extras.push(_ExtraRecord.fromPointerEvent(event));
      internals.controller.enqueue(_PointerTrack.fromPointerEvent(event));//XXX いる？（最後のpointermoveから座標が変化することがありえるか）
      internals.controller.close();
    }
  }

  //XXX 明示的にreleasePointerCaptureする？ いまのところgotpointercaptureが発生するのにlostpointercaptureが発生しないケースにはあったことは無い
  #release(event: PointerEvent): void {
    if (this.#internalsMap.has(event.pointerId) === true) {
      this.#internalsMap.delete(event.pointerId);
    }
  }
}

const _pointerTrackerRegistry: WeakMap<Element, _PointerTracker> = new WeakMap();

namespace Pointer {
  /**
   * The pointer identification.
   */
  export type Identification = {
    readonly id: pointerid,
    readonly type: string,
    readonly isPrimary: boolean,
  };

  export type Geometry = {
    readonly point: Viewport.Inset,
    readonly size: Geometry2d.Area,
  };

  export const State = {
    ACTIVE: "active", // おおむねpointer events仕様のactive pointerのこと
    LOST: "lost", // ここでは、active pointerからpointercancelイベントでもって非作動状態となったものとする
  } as const;
  export type State = typeof State[keyof typeof State];

  export interface Track {
    readonly pointer: Identification;
    readonly timestamp: number;
    readonly pointerState: State,
    readonly trackingPhase: TrackingPhase,
    readonly geometry: Geometry;
    readonly offsetFromTarget: BoundingBox.Inset; // offset from target bounding box
    //XXX pressure,tangentialPressure,tiltX,tiltY,twist,altitudeAngle,azimuthAngle,getPredictedEvents, ctrlKey,shiftKey,altKey,metaKey,button,buttons, isTrusted,composedPath, ...
  };

  //TODO 消す
  export const TrackingPhase = {
    START: "start",
    PROGRESS: "progress",
    END: "end",
    UNDEFINED: "undefined",
  } as const;
  export type TrackingPhase = typeof TrackingPhase[keyof typeof TrackingPhase];

  export type TrackingResult = {
    pointer: Identification;//XXX 要る？ trackingを参照すれば？
    duration: milliseconds,
    startPoint: Viewport.Inset,
    endPoint: Viewport.Inset,
    terminatedByPointerLost: boolean, // 単にpointercancelでキャプチャーが終了したか否か（それ以上のキャンセル条件は利用する側で判定すること）
    relativeX: number, // 終点の始点からの相対位置
    relativeY: number,
    //XXX 絶対移動量 要る？（要る場合、PointerEvent#movementX/Yはブラウザによって単位が違うので、pointermove毎に前回pointermoveとのviewport座標の差分絶対値を取得し、それを合計する）
    endPointIntersectsTarget: boolean,// 終点は要素のヒットテストにヒットするか
    //XXX viewportResized,viewportScrolled,targetResized,targetScrolled,任意の祖先要素Scrolled,...
    extras: Array<_ExtraRecord>,
  };

  export interface Tracking {
    pointer: Identification;
    get result(): Promise<TrackingResult>;
    //[Symbol.asyncIterator](): AsyncGenerator<Track, void, void>;
    tracks(): AsyncGenerator<Track, void, void>;
  }

  export type DetectedCallback = (tracking: Tracking) => (void | Promise<void>);

  export const MouseButton = {
    LEFT: "left",
    MIDDLE: "middle",
    RIGHT: "right",
    X1: "x1",
    X2: "x2",
  };
  export type MouseButton = typeof MouseButton[keyof typeof MouseButton];

  export const PenButton = {
    NO_BUTTONS: "",// ボタン押していない
    BARREL: "barrel",
    ERASER: "eraser",
  } as const;
  export type PenButton = typeof PenButton[keyof typeof PenButton];

  export type TrackerOptions = {
    filter?: {
      // trustedPointer?: boolean,
      pointerType?: Array<string>,
      primaryPointer?: boolean,
      mouseButtons?: Array<MouseButton>,// 左ボタン（主ボタン）は除いたボタン（マウスではどれかボタン押さないとpointerdownにはならないので）
      penButtons?: Array<PenButton>,
      //XXX key
      custom?: (event: PointerEvent) => boolean,// 位置でフィルタとか、composedPath()でフィルタとか、いろいろできるようにevent自体を渡す
    },

    //XXX 命名が違う気がする
    highPrecision?: boolean,


    //TODO pointerTypeとbuttonなしを再編する 接近はGlobalTrackerでviewportのpointermoveで四角をpointerに追随させてintersection監視すれば取れる（四角はpointer-events:noneでもok 不可視は？）
    // hover接近 mouse_hover mouse_contact, buttons...
    // hover接近 pen_hover   pen_contact    buttons...
    // -         -           touch_contact  -

    //TODO 全trackにboundingboxから外れているかいないかを持たせるか
    //XXX target他のresizeを監視するか →要らないのでは
    //XXX target,viewport他のscrollを監視するか →要らないのでは
    //XXX targetやviewport以外の任意の基準要素 →要らないのでは
    //TODO event.button,buttonsの変化を監視するか
    //XXX pointerenterからも追跡開始する（pointerdownまでcaptureはしない）
    //TODO pointermoveしなくても一定時間ごとにpushするかしないか

    // 廃止
    // useCapture?: boolean, pointercaptureを使用するか否か
    //   → falseの対応がきつい（event.targetがcurrentTargetと異なる場合pointermoveの度にcurrentTarget座標の算出が必要）
    // maxConcurrentTrackings?: number, 1 trackerでの同時追跡数
    //   → pointercaptureは基本的に後からセットした方がpointermoveを発火するのでほぼ無意味（後からsetした方がreleaseすれば前にsetしていた方からpointermoveが発火）
  };

  export namespace Tracker {
    export function register(element: Element, callback: DetectedCallback, options: TrackerOptions = {}): void {
      const tracker = new _PointerTracker(element, callback, options);
      _pointerTrackerRegistry.set(element, tracker);
    }

    export function unregister(element: Element): void {
      const tracker = _pointerTrackerRegistry.get(element);
      if (!!tracker) {
        tracker.disconnect();
        _pointerTrackerRegistry.delete(element);
      }
    }
  }
}

export {
  Pointer,
};
