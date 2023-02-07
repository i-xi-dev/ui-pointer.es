import { Geometry2d } from "./geometry_2d";
import { BoundingBox } from "./bounding_box";
import { Viewport } from "./viewport";

// 対象要素はtouch-actionでパン無効を推奨
// 対象要素の子孫でのpointerイベントが必要ない場合は、子孫はpointer-events:none推奨

//XXX 既知の問題-1
//    Chromium系のブラウザでマウスで、_PointerCaptureTarget.elementのスクロールバー上でpointerdownした場合、pointer captureはスクロールバーに奪われる
//    この状態では_PointerCaptureTarget.elementではpointermoveは発火しない。gotpointercaptureも発火しない
//    ただ、pointerupは_PointerCaptureTarget.elementから離れていても発火するので、中途半端にpointer captureしている状態と思われる
//    pointerup後のlostpointercaptureも発火しない


//XXX 非pontercaptureのトラッカーを追加

type pointerid = number;// integer
type milliseconds = number;

type _PointerCaptureInternals = {
  readonly pointer: Pointer.Identification,
  readonly controller: ReadableStreamDefaultController<Pointer.CaptureTrack>,
};

class _PointerCapture implements Pointer.Capture {
  readonly #target: _PointerCaptureTarget;
  readonly #task: Promise<Pointer.CaptureResult>;
  #onCaptureComplete: (value: Pointer.CaptureResult) => void = (): void => undefined;
  #onCaptureFail: (reason?: any) => void = (): void => undefined;
  readonly #trackStream: ReadableStream<Pointer.CaptureTrack>;

  constructor(target: _PointerCaptureTarget, trackStream: ReadableStream<Pointer.CaptureTrack>) {
    this.#target = target;
    this.#task = new Promise((resolve, reject) => {
      this.#onCaptureComplete = resolve;
      this.#onCaptureFail = reject;
    });
    this.#trackStream = trackStream;
  }

  //TODO-1st これだとstreamを消費しないかぎりPromiseが永遠に未解決になる
  //        結果だけほしい場合に対応できない
  get result(): Promise<Pointer.CaptureResult> {
    return this.#task;
  }

  //XXX ReadableStream#[Symbol.asyncIterator]がブラウザでなかなか実装されないので…
  async * tracks(): AsyncGenerator<Pointer.CaptureTrack, void, void> {
  //async *[Symbol.asyncIterator](): AsyncGenerator<Pointer.CaptureTrack, void, void> {
    try {
      let firstTrack: Pointer.CaptureTrack | undefined = undefined;
      let lastTrack: Pointer.CaptureTrack | undefined = undefined;
      for await (const track of this.#tracks()) {
        if (!firstTrack) {
          firstTrack = track;
        }
        lastTrack = track;
        yield track;
      }

      let duration: milliseconds = 0;
      let relativeX: number = 0;
      let relativeY: number = 0;
      if (!!firstTrack && !!lastTrack) {
        duration = (lastTrack.timestamp - firstTrack.timestamp);
        const firstTrackPoint = firstTrack.geometry.point;
        const lastTrackPoint = lastTrack.geometry.point;
        relativeX = (lastTrackPoint.x - firstTrackPoint.x);
        relativeY = (lastTrackPoint.y - firstTrackPoint.y);
      }
      const startPoint = { x: Number.NaN, y: Number.NaN };
      if (!!firstTrack) {
        const firstTrackPoint = firstTrack.geometry.point;
        startPoint.x = firstTrackPoint.x;
        startPoint.y = firstTrackPoint.y;
      }
      const endPoint = { x: Number.NaN, y: Number.NaN };
      let terminatedByPointerLost = false;
      let endPointIntersectsTarget = false;
      if (!!lastTrack) {
        const lastTrackPoint = lastTrack.geometry.point;
        endPoint.x = lastTrackPoint.x;
        endPoint.y = lastTrackPoint.y;
        terminatedByPointerLost = (lastTrack.pointerState === Pointer.State.LOST);
        endPointIntersectsTarget = !terminatedByPointerLost && (this.#target.containsPoint(endPoint) === true);
      }
      this.#onCaptureComplete({
        duration,
        startPoint,
        endPoint,
        terminatedByPointerLost,
        relativeX,
        relativeY,
        endPointIntersectsTarget,
      });
      return;
    }
    catch (exception) {
      this.#onCaptureFail(exception);
    }
  }

  async * #tracks(): AsyncGenerator<Pointer.CaptureTrack, void, void> {
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

class _PointerCaptureTarget {
  readonly #element: Element;
  readonly #eventListenerAborter: AbortController;
  readonly #internalsMap: Map<pointerid, _PointerCaptureInternals>;
  readonly #filterPointerTypes: Array<string>;
  readonly #filterPrimaryPointer: boolean;
  readonly #filterMouseButtons: Array<Pointer.MouseButton>;
  readonly #filterPenButton: Array<Pointer.PenButton>;
  readonly #customFilter: (event: PointerEvent) => boolean;
  readonly #maxConcurrentCaptures: number;
  readonly #highPrecision: boolean;

  constructor(element: Element, callback: Pointer.CaptureCallback, options: Pointer.CaptureOptions) {
    this.#element = element;
    this.#eventListenerAborter = new AbortController();
    this.#filterPointerTypes = (!!options.filter && Array.isArray(options.filter.pointerType)) ? [...options.filter.pointerType] : ["mouse", "pen", "touch"];
    this.#filterPrimaryPointer = (typeof options.filter?.primaryPointer === "boolean") ? options.filter.primaryPointer : true;
    this.#filterMouseButtons = (!!options.filter && Array.isArray(options.filter.mouseButtons)) ? [...options.filter.mouseButtons] : [];
    this.#filterPenButton = (!!options.filter && Array.isArray(options.filter.penButtons)) ? [...options.filter.penButtons] : [];
    this.#customFilter = (typeof options.filter?.custom === "function") ? options.filter.custom : () => true;
    this.#maxConcurrentCaptures = Number.isSafeInteger(options.maxConcurrentCaptures) ? (options.maxConcurrentCaptures as number) : 1;
    this.#highPrecision = (options.highPrecision === true) && !!(new PointerEvent("test")).getCoalescedEvents;//XXX safariが未実装:getCoalescedEvents

    const listenerOptions = {
      passive: true,
      signal: this.#eventListenerAborter.signal,
    };

    this.#internalsMap = new Map();

    this.#element.addEventListener("pointerdown", ((event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;// 受け付けるようにする場合は、pointerdownがtrustedでpointermoveが非trustedの場合の挙動をどうするか
      }
      this.#requestCapture(event, callback);
    }) as EventListener, listenerOptions);

    // gotpointercaptureは使用しないことにする
    // setPointerCapture後、Firefoxは即座にgotpointercaptureが発火するのに対して、Chromeは次にpointermoveなどが発火する直前まで遅延される為

    this.#element.addEventListener("pointermove", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      this.#pushTrack(event);
    }) as EventListener, listenerOptions);

    //XXX pointerrawupdate設定可にする

    this.#element.addEventListener("pointerup", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      this.#pushLastTrack(event);
      this.#onRelease(event);
    }) as EventListener, listenerOptions);

    // this.#element.addEventListener("pointerleave", ((event: PointerEvent): void => {
    //   console.log(event)
    // }) as EventListener, listenerOptions);

    this.#element.addEventListener("pointercancel", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      this.#pushLastTrack(event);
      this.#onRelease(event);
    }) as EventListener, listenerOptions);

    // lostpointercaptureは使用しないことにする
    // Chrome,EdgeでpointerTypeがmouseのとき、スクロールバー上でpointerdownしたときに問題になる為
    // （スクロールバーがpointer captureを奪うので要素ではgotpointercaptureもlostpointercaptureも発火しない）
    // Firefoxはうまくやってるので、Chromiumの問題な気もするが
    // this.#element.addEventListener("lostpointercapture", ((event: PointerEvent): void => {
    //   if (event.isTrusted !== true) {
    //     return;
    //   }
    //   this.#onRelease(event); pointerup, pointercancel に移す
    // }) as EventListener, listenerOptions);
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

  #requestCapture(event: PointerEvent, callback: Pointer.CaptureCallback): void {
    if (this.#filter(event) !== true) {
      return;
    }
    if (this.#internalsMap.size >= this.#maxConcurrentCaptures) {
      return;
    }

    const pointer = Pointer.Identification.fromPointerEvent(event);

    //XXX 暗黙のpointercaptureは、pointerdown時にhasPointerCaptureで判別できる
    //    と、仕様には記載があるが従っている実装はあるのか？（ChromeもFirefoxもpointerdownでhasPointerCaptureしても暗黙のpointercaptureを検出できない）
    //    検出できなくても問題なさげなので、一旦放置
    this.#element.setPointerCapture(event.pointerId);

    const start = (controller: ReadableStreamDefaultController<Pointer.CaptureTrack>) => {
      const internals = {
        pointer,
        controller,
      };
      this.#internalsMap.set(event.pointerId, internals);

      // pointerdownのtargetはthis.#elementの子孫である可能性（すなわちevent.offsetX/Yがthis.#elementの座標ではない可能性）
      let adjustment: Geometry2d.Point | undefined = undefined;
      if (this.#element !== event.target) {
        const thisElementBoundingBox = BoundingBox.of(this.#element);
        const eventTargetBoundingBox = BoundingBox.of(event.target as Element);
        adjustment = Geometry2d.Point.distanceBetween(thisElementBoundingBox, eventTargetBoundingBox);
      }
      const firstTrack = this.#eventToTrack(internals, event, true, adjustment);
      controller.enqueue(firstTrack);
    };
    const cancel = () => {};

    const trackStream: ReadableStream<Pointer.CaptureTrack> = new ReadableStream({
      start,
      cancel,
    });

    callback(new _PointerCapture(this, trackStream));
  }

  #eventToTrack(internals: _PointerCaptureInternals, event: PointerEvent, exteriaGeometry: boolean = false, adjustment?: Geometry2d.Point): Pointer.CaptureTrack {
    const geometry = Pointer.Geometry.fromPointerEvent(event);
    const offsetFromTarget = {
      x: event.offsetX,
      y: event.offsetY,
    };
    if (!!adjustment && Number.isFinite(adjustment?.x) && Number.isFinite(adjustment?.y)) {
      offsetFromTarget.x = offsetFromTarget.x - adjustment.x;
      offsetFromTarget.y = offsetFromTarget.y - adjustment.y;
    }

    const pointerState = (event.type === "pointercancel") ? Pointer.State.LOST : Pointer.State.ACTIVE;
    let capturePhase: Pointer.CapturePhase;
    switch (event.type) {
      case "pointerdown":
        capturePhase = Pointer.CapturePhase.BEFORE_CAPTURE;
        break;
      case "pointermove":
        capturePhase = Pointer.CapturePhase.CAPTURED;
        break;
      case "pointerup":
      case "pointercancel":
        capturePhase = Pointer.CapturePhase.BEFORE_RELEASE;
        break;
      default:
        capturePhase = Pointer.CapturePhase.RELEASED;
        // pointerup,pointercancelの後は#eventToTrackを呼んでいないのでありえない
        break;
    }

    if (exteriaGeometry === true) {
      return {
        pointer: internals.pointer,
        timestamp: event.timeStamp,
        geometry,
        offsetFromTarget,

        pointerState,
        capturePhase,
        exteriaGeometry: {
          viewport: Viewport.from(event.view as Window),
          target: BoundingBox.of(this.#element),
        },
      };
    }

    return {
      pointer: internals.pointer,
      timestamp: event.timeStamp,
      geometry,
      offsetFromTarget,

      pointerState,
      capturePhase,
    };
  }

  #pushTrack(event: PointerEvent): void {
    if (this.#internalsMap.has(event.pointerId) === true) {
      const internals = this.#internalsMap.get(event.pointerId) as _PointerCaptureInternals;

      if (this.#highPrecision === true) {
        for (const coalesced of event.getCoalescedEvents()) {
          internals.controller.enqueue(this.#eventToTrack(internals, coalesced));
        }
      }
      else {
        internals.controller.enqueue(this.#eventToTrack(internals, event));
      }
    }
  }

  #pushLastTrack(event: PointerEvent): void {
    if (this.#internalsMap.has(event.pointerId) === true) {
      const internals = this.#internalsMap.get(event.pointerId) as _PointerCaptureInternals;

      internals.controller.enqueue(this.#eventToTrack(internals, event, true));//XXX いる？（最後のpointermoveから座標が変化することがありえるか）
      internals.controller.close();
    }
  }

  #onRelease(event: PointerEvent): void {
    if (this.#internalsMap.has(event.pointerId) === true) {
      //const internals = this.#internalsMap.get(event.pointerId) as _PointerCaptureInternals;
      this.#internalsMap.delete(event.pointerId);
    }
  }
}

const _pointerCaptureTargetRegistry: WeakMap<Element, _PointerCaptureTarget> = new WeakMap();

namespace Pointer {
  /**
   * The pointer identification.
   */
  export type Identification = {
    readonly id: pointerid,
    readonly type: string,
    readonly isPrimary: boolean,
  };
  export namespace Identification {
    export function fromPointerEvent(event: PointerEvent): Identification {
      return Object.freeze({
        id: event.pointerId,
        type: event.pointerType,
        isPrimary: event.isPrimary,
      });
    }
  }

  export type Geometry = {
    readonly point: Viewport.Inset,
    readonly size: Geometry2d.Area,
  };
  export namespace Geometry {
    export function fromPointerEvent(event: PointerEvent): Geometry {
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


  export const State = {
    ACTIVE: "active", // おおむねpointer events仕様のactive pointerのこと
    LOST: "lost", // ここでは、active pointerからpointercancelイベントでもって非作動状態となったものとする
  } as const;
  export type State = typeof State[keyof typeof State];

  export interface Track {
    readonly pointer: Identification;
    readonly timestamp: number;
    readonly geometry: Geometry;
    readonly offsetFromTarget: BoundingBox.Inset; // offset from target bounding box
    //XXX pressure,tangentialPressure,tiltX,tiltY,twist,altitudeAngle,azimuthAngle,getPredictedEvents, ctrlKey,shiftKey,altKey,metaKey,button,buttons, isTrusted,composedPath, ...
  };

  export const CapturePhase = {
    BEFORE_CAPTURE: "before-capture",
    CAPTURED: "captured",
    BEFORE_RELEASE: "before-release",
    RELEASED: "released",
  } as const;
  export type CapturePhase = typeof CapturePhase[keyof typeof CapturePhase];

  export interface CaptureTrack extends Track {
    readonly pointerState: State,
    readonly capturePhase: CapturePhase,
    readonly exteriaGeometry?: {
      viewport: Viewport,
      target: BoundingBox,
    };//XXX とりあえず、最初と最後のみ //XXX CaptureResultに移す
  };

  export type CaptureResult = {
    duration: milliseconds,
    startPoint: Viewport.Inset,
    endPoint: Viewport.Inset,
    terminatedByPointerLost: boolean, // 単にpointercancelでキャプチャーが終了したか否か（それ以上のキャンセル条件は利用する側で判定すること）
    relativeX: number, // 終点の始点からの相対位置
    relativeY: number,
    //XXX 絶対移動量 要る？（要る場合、PointerEvent#movementX/Yはブラウザによって単位が違うので、pointermove毎に前回pointermoveとのviewport座標の差分絶対値を取得し、それを合計する）
    endPointIntersectsTarget: boolean,// 終点は要素のヒットテストにヒットするか
    //XXX viewportResized,viewportScrolled,targetResized,targetScrolled,任意の祖先要素Scrolled,...
  };

  export interface Capture {
    get result(): Promise<CaptureResult>;
    //[Symbol.asyncIterator](): AsyncGenerator<CaptureTrack, void, void>;
    tracks(): AsyncGenerator<CaptureTrack, void, void>;
  }

  export type CaptureCallback = (capture: Capture) => (void | Promise<void>);

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

  export type CaptureOptions = {
    filter?: {
      // trustedPointer?: boolean,
      pointerType?: Array<string>,
      primaryPointer?: boolean,
      mouseButtons?: Array<MouseButton>,// 左ボタン（主ボタン）は除いたボタン（マウスではどれかボタン押さないとpointerdownにはならないので）
      penButtons?: Array<PenButton>,
      //XXX key
      custom?: (event: PointerEvent) => boolean,// 位置でフィルタとか、composedPath()でフィルタとか、いろいろできるようにevent自体を渡す
    },

    //TODO そもそも同時captureできるのか？
    maxConcurrentCaptures?: number,

    //XXX 命名が違う気がする
    highPrecision?: boolean,

    //TODO 全trackにboundingboxから外れているかいないかを持たせるか
    //XXX target他のresizeを監視するか →要らないのでは
    //XXX target,viewport他のscrollを監視するか →要らないのでは
    //XXX targetやviewport以外の任意の基準要素 →要らないのでは
    //TODO event.button,buttonsの変化を監視するか
  };

  export namespace CaptureTarget {
    export function register(element: Element, callback: CaptureCallback, options: CaptureOptions = {}): void {
      const target = new _PointerCaptureTarget(element, callback, options);
      _pointerCaptureTargetRegistry.set(element, target);
    }
  
    export function unregister(element: Element): void {
      const target = _pointerCaptureTargetRegistry.get(element);
      if (!!target) {
        target.disconnect();
        _pointerCaptureTargetRegistry.delete(element);
      }
    }
  }
}

export {
  Pointer,
};
