import { Geometry2d } from "@i-xi-dev/ui-utils";
import { type pointerid, Pointer } from "./pointer";

//既知の問題
// - ターゲット要素のスクロールバーでpointerdownしたとき、pointermoveのtrackがpushされない
//   結果は取得できる（pointer capture中にpointermoveが発火しない為）
//   おそらくchromiumの問題
//
// - mouse操作中にタッチすると、マウスのカーソルがタッチ地点に移動する
//   おそらくfirefoxの問題（pointerIdを区別してほしい）
//
// - タッチのpointerupのwidth/heightがブラウザによって違う
//   chrome: 離した後扱い？（1×1）
//   firefox:離す前扱い
//
// - 適用要素に制限あり
//   - touch-actionはブロックに適用
//   - display:inlineの場合の座標基点がブラウザによって違う
//   - その他box数が1ではない場合
//     - 0: displayがnone,contents,...
//     - 1以上: displayがinline,...
//     - 通常は1だが2以上になることがある: page-break以外のbreak (regionは廃止されたのでcolumnだけか？)

class _PointerCaptureTracking extends Pointer.Tracking<PointerCapture.Track> {
  readonly #target: Element;
  //readonly #boundingBox: DOMRect;// 開始時点の

  constructor(pointer: Pointer.Identification, target: Element, signal: AbortSignal) {
    super(pointer, signal);
    this.#target = target;
    //this.#boundingBox = target.getBoundingClientRect();
  }

  get target(): Element {
    return this.#target;
  }

  override async readAll(ontrack?: (track: PointerCapture.Track) => void): Promise<PointerCapture.TrackingResult> {
    const baseResult = await super.readAll(ontrack);
    const { endGeometry } = baseResult;
    const { insideHitRegion, insideBoundingBox } = _hitTest(this.#target, endGeometry);
    return Object.assign({
      wentOutOfHitRegion: (insideHitRegion !== true),
      wentOutOfBoundingBox: (insideBoundingBox !== true),
    }, baseResult);
  }

}

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

function _hitTest(element: Element, { x, y, rx, ry }: Pointer.Geometry): { insideHitRegion: boolean, insideBoundingBox: boolean } {// x,yはviewport座標
  const root = element.getRootNode();
  if ((root instanceof Document) || (root instanceof ShadowRoot)) {
    const insideHitRegion = root.elementsFromPoint((x - rx), (y - ry)).includes(element)
      || root.elementsFromPoint((x + rx), (y - ry)).includes(element)
      || root.elementsFromPoint((x - rx), (y + ry)).includes(element)
      || root.elementsFromPoint((x + rx), (y + ry)).includes(element);

    let insideBoundingBox = false;
    const boundingBox = element.getBoundingClientRect();
    insideBoundingBox = ((x + rx) >= boundingBox.left) && ((x - rx) <= boundingBox.right)
      && ((y + ry) >= boundingBox.top) && ((y - ry) <= boundingBox.bottom);

    return {
      insideHitRegion,
      insideBoundingBox,
    };
  }
  throw new Error("invalid state: element is not connected");
}

class _PointerCaptureTarget {
  readonly #target: Element;
  readonly #filter: _PointerCaptureFilter;
  readonly #highPrecision: boolean;
  readonly #eventListenerAborter: AbortController;
  readonly #trackingMap: Map<pointerid, _PointerCaptureTracking>;// ブラウザのpointer captureの挙動により、最大サイズ1とする

  constructor(target: Element, callback: PointerCapture.AutoCapturedCallback, options: PointerCapture.AutoCaptureOptions) {
    this.#target = target;
    this.#filter = new _PointerCaptureFilter(options?.filter);
    this.#highPrecision = (options.highPrecision === true) && !!(new PointerEvent("test")).getCoalescedEvents;// safariが未実装:getCoalescedEvents
    this.#eventListenerAborter = new AbortController();
    this.#trackingMap = new Map();

    const targetStyle = (this.#target as unknown as ElementCSSInlineStyle).style;
    if (options.setTouchActionNone === true) {
      targetStyle.setProperty("touch-action", "none", "important");
    }
    // 選択可能テキストの有無に関わらず、テキスト選択し始めてpointercancelされることがあるので強制設定する
    targetStyle.setProperty("-webkit-user-select", "none", "important"); // safari向け（chromeもfirefoxも接頭辞は不要）
    targetStyle.setProperty("user-select", "none", "important");

    const passiveOptions = {
      passive: true,
      signal: this.#eventListenerAborter.signal,
    };
    const activeOptions = {
      passive: false,
      signal: this.#eventListenerAborter.signal,
    };

    // pointer captureするなら、おそらくコンテキストメニューは邪魔と考えられるので、
    // コンテキストメニューは一律キャンセルする
    // - capture中のどの時点においても、マウス右ボタンを離したとき
    // - タッチ開始してから動かさずに一定時間たったとき
    this.#target.addEventListener("contextmenu", ((event: MouseEvent) => {
      event.preventDefault();
    }) as EventListener, activeOptions);

    // touch-actionを一律禁止すると、タブレット等でスクロールできなくなってしまうので
    // 代わりにpointer capture中のtouchmoveをキャンセルする
    // いくつかの環境で試してみた結果ではtouchmoveのみキャンセルすれば問題なさそうだったが、
    //   Pointer Events仕様でもTouch Events仕様でも preventDefaultすると何が起きるのかがほぼ未定義なのはリスク
    this.#target.addEventListener("touchmove", ((event: TouchEvent) => {
      if (this.#trackingMap.size > 0) {
        event.preventDefault();
      }
    }) as EventListener, activeOptions);

    this.#target.addEventListener("pointerdown", ((event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }

      if (this.#trackingMap.has(event.pointerId) === true) {
        // pointermove中に同じpointerでのpointerdown
        this.#pushTrack(event);
        return;
      }
      else if (this.#trackingMap.size > 0) {
        // 異なるpointer
        // ブラウザの挙動として、新しいpointer captureが生きている間は古いほうは基本無視されるので、同時captureはしないこととする
        return;
      }

      // 以下、event.pointerIdは#targetの要素でpointer capture中ではない場合

      if (this.#filter.filter(event) !== true) {
        return;
      }

      // event.preventDefault();// 中クリックの自動スクロールがpointerdown

      // 暗黙のpointercaptureは放置で問題ないか？
      // → mouseでcapture中にタッチにcaptureを奪われる。見た目以外に実害があるかは未だ不明

      this.#target.setPointerCapture(event.pointerId);
      if (this.#target.hasPointerCapture(event.pointerId) === true) {
        // gotpointercaptureは遅延される場合があるのでここで行う
        // 備忘: ここでtouch-actionをnoneに変更しても何の意味もなかった
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
      this.#target.releasePointerCapture(event.pointerId); // この後暗黙にreleaseされる、おそらくここで明示的にreleasePointerCaptureしなくても問題ない
      this.#pushLastTrack(event);
      this.#afterRelease(event);
    }) as EventListener, passiveOptions);

    // mouseなら左を押しているし、pen,touchなら接触しているので、基本的に発火されないはず（先にpointerupが発生する）
    // 発火されるとしたら、接触中に電源喪失したpenとか？
    this.#target.addEventListener("pointercancel", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      this.#target.releasePointerCapture(event.pointerId); // この後暗黙にreleaseされる、おそらくここで明示的にreleasePointerCaptureしなくても問題ない
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
    const tracking = new _PointerCaptureTracking(pointer, this.#target, this.#eventListenerAborter.signal);
    this.#trackingMap.set(event.pointerId, tracking);
    callback({
      pointer,
      target: tracking.target,
      stream: tracking.stream,
      [Symbol.asyncIterator]() {
        return tracking.tracks();
      },
      consume(ontrack?: (track: PointerCapture.Track) => void) {
        return tracking.readAll(ontrack);
      },
    });
  }

  #pushTrack(event: PointerEvent): void {
    if (this.#trackingMap.has(event.pointerId) === true) {
      const tracking = this.#trackingMap.get(event.pointerId) as _PointerCaptureTracking;

      if ((this.#highPrecision === true) && (event.type === "pointermove")) {
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
      const tracking = this.#trackingMap.get(event.pointerId) as _PointerCaptureTracking;

      tracking.append(PointerCapture.Track.from(event));
      tracking.terminate();
    }
  }

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
        offsetFromTarget.x = offsetFromTarget.x + x;
        offsetFromTarget.y = offsetFromTarget.y + y;
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

  export interface TrackingResult extends Pointer.TrackingResult {
    /** @experimetal */
    wentOutOfHitRegion: boolean; // 終了時点でhit testをパスするか
    /** @experimetal */
    wentOutOfBoundingBox: boolean; // 終了時点でbounding boxの外に出ているか（bounding boxが移動/リサイズした等には関知しない）
    //XXX streamを読んでる側で取得可能なのでどこまで持たせるか
  }

  export interface CapturedPointerTracks {
    readonly pointer: Pointer.Identification;
    readonly target: Element,
    readonly stream: ReadableStream<Track>;
    readonly [Symbol.asyncIterator]: () => AsyncGenerator<Track, void, void>;
    readonly consume: (ontrack?: (track: Track) => void) => Promise<TrackingResult>;
  }
  
  export type AutoCapturedCallback = (tracks: CapturedPointerTracks) => (void | Promise<void>);

  export type AutoCaptureFilterSource = {
    pointerType?: Array<string>,
    primaryPointer?: boolean,

    custom?: (event: PointerEvent) => boolean,// 位置でフィルタとか、composedPath()でフィルタとか、
    disableDefaultFilter?: boolean,
  };

  export type AutoCaptureOptions = {

    filter?: AutoCaptureFilterSource,

    highPrecision?: boolean,

    setTouchActionNone?: boolean, // trueにする場合タブレット等でスクロール手段がなくなるので注意。スクロールが必要な場合は自前でスクロールを実装すること

    //XXX 終了条件を設定可にする 今はmouseはボタンは1つも押していない、pen,touchは接触を失った
    //    開始条件はfilterの外に出す
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
//     - setPointerCapture後、Firefoxは即座にgotpointercaptureが発火するのに対して、Chromeは次にpointermoveなどが発火する直前まで遅延される為
//     - Chromeで発火しない場合があるため（mouseでtargetのスクロールバー上でpointerdownした場合とか）
// - lostpointercaptureは使用しないことにした
//     - Chromeで発火しない場合があるため（gotopointercaptureとおそらく同じ問題）

//将来検討
// - pointerrawupdate設定可にする
// - callbackでなく、{ start(track) => {}, progress(track) => {}, end(track) => {} }の方が便利か？
//   trackに直前のtrackとの差分なんかも持たせる？

export {
  PointerCapture,
};
