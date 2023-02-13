import { Geometry2d } from "@i-xi-dev/ui-utils";
import { type pointerid, Pointer } from "./pointer";

class _PointerCaptureFilter {
  readonly #pointerTypes: Array<string>;
  readonly #primaryPointer: boolean;
  readonly #customFilter: (event: PointerEvent) => boolean;
  readonly #disableDefaultFilter: boolean;
  constructor(filterSource: PointerCapture.AutoCaptureFilterSource = {}) {
    this.#pointerTypes = Array.isArray(filterSource.pointerType) ? filterSource.pointerType : [Pointer.Type.MOUSE, Pointer.Type.PEN, Pointer.Type.TOUCH];
    this.#primaryPointer = (filterSource.primaryPointer === true);
    this.#customFilter = (typeof filterSource.custom === "function") ? filterSource.custom : () => true;
    this.#disableDefaultFilter = (filterSource.disableDefaultFilter === true);
  }
  filter(event: PointerEvent): boolean {
    if (this.#pointerTypes.includes(event.pointerType) !== true) {
      return false;
    }
    if ((this.#primaryPointer === true) && (event.isPrimary !== true)) {
      return false;
    }
    if (this.#customFilter(event) !== true) {
      return false;
    }
    if (this.#disableDefaultFilter !== true) {
      if (event.buttons !== 1) {
        // mouseの場合左ボタンのみ、pen,touchの場合ボタンなし接触のみ
        return false;
      }
    }
    return true;
  }
}

function _elementContainsPoint(element: Element, { x, y }: Geometry2d.Point): boolean {// x,yはviewport座標
  const root = element.getRootNode();
  if ((root instanceof Document) || (root instanceof ShadowRoot)) {
    return root.elementsFromPoint(x, y).includes(element);
  }
  throw new Error("invalid state: element is not connected");
}

class _PointerCaptureTarget {
  readonly #target: Element;
  readonly #filter: _PointerCaptureFilter;
  readonly #highPrecision: boolean;
  readonly #eventListenerAborter: AbortController;
  readonly #trackingMap: Map<pointerid, PointerCapture.Tracking>;

  constructor(target: Element, callback: PointerCapture.AutoCapturedCallback, options: PointerCapture.AutoCaptureOptions) {
    this.#target = target;
    this.#filter = new _PointerCaptureFilter(options?.filter);
    this.#highPrecision = (options.highPrecision === true) && !!(new PointerEvent("test")).getCoalescedEvents;// safariが未実装:getCoalescedEvents
    this.#eventListenerAborter = new AbortController();
    this.#trackingMap = new Map();

    // タッチの場合にpointerupやpointercancelしなくても暗黙にreleasepointercaptureされるので強制設定する //XXX 値は設定可にする
    (this.#target as unknown as ElementCSSInlineStyle).style.setProperty("touch-action", "none", "important");

    const passiveOptions = {
      passive: true,
      signal: this.#eventListenerAborter.signal,
    };
    const activeOptions = {
      passive: false,
      signal: this.#eventListenerAborter.signal,
    };

    //XXX targetがcurrentTargetの子孫でもoffsetX/Yが問題なく取れそうなら、pointerenterで開始するモードも追加する（trackにcontactかどうかも追加する）

    this.#target.addEventListener("pointerdown", ((event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }

      if (this.#trackingMap.has(event.pointerId) === true) {
        // pointermove中にpointerdown
        this.#pushTrack(event);
        return;
      }

      // 以下、event.pointerIdは#targetの要素でpointer capture中ではない場合

      if (this.#filter.filter(event) !== true) {
        return;
      }

      // event.preventDefault();// 中クリックの自動スクロールがpointerdown

      //XXX 暗黙のpointercaptureは放置で問題ない？

      this.#target.setPointerCapture(event.pointerId);
      if (this.#target.hasPointerCapture(event.pointerId) === true) {
        // gotpointercaptureは遅延される場合があるのでここで行う
        this.#afterCapture(event, callback);
        this.#pushTrack(event);
      }
    }) as EventListener, passiveOptions);

    this.#target.addEventListener("pointermove", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      //XXX hasPointerCaptureがfalseなら#afterRelease()呼ぶ？ pointermove以外でも
      this.#pushTrack(event);
    }) as EventListener, passiveOptions);

    this.#target.addEventListener("pointerup", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      this.#pushLastTrack(event);
      this.#afterRelease(event);
    }) as EventListener, passiveOptions);

    this.#target.addEventListener("pointercancel", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      this.#pushLastTrack(event);
      this.#afterRelease(event);
    }) as EventListener, passiveOptions);
  }

  disconnect(): void {
    this.#eventListenerAborter.abort();
    this.#trackingMap.clear();
  }

  #afterCapture(event: PointerEvent, callback: PointerCapture.AutoCapturedCallback): void {
    const pointer = Pointer.Identification.of(event);
    const tracking = new PointerCapture.Tracking(pointer, this.#target, this.#eventListenerAborter.signal);
    this.#trackingMap.set(event.pointerId, tracking);
    callback(tracking);
  }

  #pushTrack(event: PointerEvent): void {
    if (this.#trackingMap.has(event.pointerId) === true) {
      const tracking = this.#trackingMap.get(event.pointerId) as PointerCapture.Tracking;

      if (this.#highPrecision === true) {
        for (const coalesced of event.getCoalescedEvents()) {
          tracking.append(PointerCapture.Track.from(coalesced));
        }
      }
      else {
        tracking.append(PointerCapture.Track.from(event));
      }
    }
  }

  #pushLastTrack(event: PointerEvent): void {
    if (this.#trackingMap.has(event.pointerId) === true) {
      const tracking = this.#trackingMap.get(event.pointerId) as PointerCapture.Tracking;

      tracking.append(PointerCapture.Track.from(event));
      tracking.terminate();
    }
  }

  //XXX 明示的にreleasePointerCaptureする？ いまのところgotpointercaptureが発生するのにlostpointercaptureが発生しないケースにはあったことは無い
  #afterRelease(event: PointerEvent): void {
    if (this.#trackingMap.has(event.pointerId) === true) {
      this.#trackingMap.delete(event.pointerId);
    }
  }
}

const _pointerCaptureTargetRegistry: WeakMap<Element, _PointerCaptureTarget> = new WeakMap();

namespace PointerCapture {
  export const Phase = {
    START: "start",
    PROGRESS: "progress",
    END: "end",
    UNDEFINED: "undefined",
  } as const;
  export type Phase = typeof Phase[keyof typeof Phase];

  export interface Track extends Pointer.Track {
    readonly offsetFromTarget: Geometry2d.Point; // offset from target bounding box
    readonly trackingPhase: Phase,
  }
  export namespace Track{
    export function from(event: PointerEvent): Track {
      const offsetFromTarget = {
        x: event.offsetX,
        y: event.offsetY,
      };

      // targetはcurrentTargetの子孫である可能性（すなわちevent.offsetX/YがcurrentTargetの座標ではない可能性）
      if (!!event.target && !!event.currentTarget && (event.currentTarget !== event.target)) {
        // ここに分岐するのは、pointerdownの時のみ（pointer captureを使用しているので）
        const currentTargetBoundingBox = (event.currentTarget as Element).getBoundingClientRect();
        const targetBoundingBox = (event.target as Element).getBoundingClientRect();
        const { x, y } = Geometry2d.Point.distanceBetween(currentTargetBoundingBox, targetBoundingBox);
        offsetFromTarget.x = offsetFromTarget.x - x;
        offsetFromTarget.y = offsetFromTarget.y - y;
      }

      let trackingPhase: Phase;
      switch (event.type) {
        case "pointerdown":
          trackingPhase = Phase.START;
          break;
        case "pointermove":
          trackingPhase = Phase.PROGRESS;
          break;
        case "pointerup":
        case "pointercancel":
          trackingPhase = Phase.END;
          break;
        default:
          trackingPhase = Phase.UNDEFINED;
          // pointerup,pointercancelの後は_PointerTrack.fromPointerEventを呼んでいないのでありえない
          break;
      }

      const baseTrack = Pointer.Track.from(event);
      return Object.assign({
        offsetFromTarget,
        trackingPhase,
      }, baseTrack);
    }
  }

  export type TrackingResult = Pointer.TrackingResult & {
    wentOutOfBoundingBox: boolean, // 終了時点でbounding boxの外に出ているか
    wentOutOfHitRegion: boolean,
  };

  export class Tracking extends Pointer.Tracking {
    readonly #target: Element;
    readonly #boundingBox: DOMRect;

    constructor(pointer: Pointer.Identification, target: Element, signal: AbortSignal) {
      super(pointer, signal);
      this.#target = target;
      this.#boundingBox = target.getBoundingClientRect();
    }

    override async result(): Promise<TrackingResult> {
      const baseResult = await super.result();
      const { endPoint } = baseResult;
      return Object.assign({
        wentOutOfBoundingBox: ((endPoint.x < this.#boundingBox.x) || (endPoint.y < this.#boundingBox.y) || (endPoint.x > this.#boundingBox.right) || (endPoint.y > this.#boundingBox.bottom)),
        wentOutOfHitRegion: (_elementContainsPoint(this.#target, endPoint) !== true),
      }, baseResult);
    }

  }
  
  export type AutoCapturedCallback = (tracking: Tracking) => (void | Promise<void>);

  export type AutoCaptureFilterSource = {
    pointerType?: Array<string>,
    primaryPointer?: boolean,

    custom?: (event: PointerEvent) => boolean,// 位置でフィルタとか、composedPath()でフィルタとか、
    disableDefaultFilter?: boolean,
  };

  export type AutoCaptureOptions = {
    filter?: AutoCaptureFilterSource,
    highPrecision?: boolean,
    //XXX pointermoveしなくても一定時間ごとにpushするかしないか
  };

  export function setAutoCapture(target: Element, callback: AutoCapturedCallback, options: AutoCaptureOptions = {}): void {
    const tracker = new _PointerCaptureTarget(target, callback, options);
    _pointerCaptureTargetRegistry.set(target, tracker);
  }

  export function clearAutoCapture(target: Element): void {
    const tracker = _pointerCaptureTargetRegistry.get(target);
    if (!!tracker) {
      tracker.disconnect();
      _pointerCaptureTargetRegistry.delete(target);
    }
  }

}

//備忘
// - 同時追跡数はとりあえず1固定にしている
//     ブラウザのpointer captureが複数captureに対応してないので。（複数captureは可能だが、アクティブになるのは直近のcapture 1つのみ。releaseしたらその前のcaptureがアクティブになるが同時にアクティブにはならない）
// - 非trustedなPointerEventは無条件で無視している
//     受け付けるようにする場合は、pointerdownがtrustedでpointermoveが非trustedの場合の挙動などをどうするか
// - gotpointercaptureは使用しないことにした
//     setPointerCapture後、Firefoxは即座にgotpointercaptureが発火するのに対して、Chromeは次にpointermoveなどが発火する直前まで遅延される為
// - lostpointercaptureは使用しないことにした
//     Chrome,EdgeでpointerTypeがmouseのとき、スクロールバー上でpointerdownしたときに問題になる為
//     （スクロールバーがpointer captureを奪う？ので要素ではgotpointercaptureもlostpointercaptureも発火しないがcaptureはしてるっぽい）
//     Firefoxは問題ないので、Chromiumの問題な気もするが

//将来検討
// - pointerrawupdate設定可にする

export {
  PointerCapture,
};
