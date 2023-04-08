import { Geometry2d } from "@i-xi-dev/ui-utils";
import _Debug from "./debug";
import { type pointerid } from "./pointer";
import { PointerDevice } from "./pointer_device";
import { PointerState } from "./pointer_state";
import { PointerActivity } from "./pointer_activity";
import {
  Pointer,
} from "./pointer";//TODO 整理
import { ViewportPointerTracker } from "./viewport_pointer_tracker";

type milliseconds = number;
type timestamp = number;

type _PointerActivityOptions = {
  signal: AbortSignal,
  // modifiersToWatch: Set<Pointer.Modifier>,
};

class _PointerActivityImpl implements PointerActivity {
  readonly #controller: _PointerActivityController;
  readonly #pointerId: pointerid;
  readonly #device: PointerDevice;
  readonly #isPrimary: boolean;
  readonly #target: WeakRef<Element>;
  readonly #traceStream: ReadableStream<PointerActivity.Trace>;
  readonly #progress: Promise<void>;

  constructor(controller: _PointerActivityController, source: PointerActivity.Trace.Source, target: Element, underlyingSource: UnderlyingDefaultSource<PointerActivity.Trace>, progress: Promise<void>) {
    this.#controller = controller;
    this.#pointerId = source.pointerId;
    this.#device = PointerDevice.of(source);
    this.#isPrimary = source.isPrimary;
    this.#target = new WeakRef(target);
    this.#traceStream = new ReadableStream(underlyingSource);
    this.#progress = progress;
  }

  get pointerId(): pointerid {
    return this.#pointerId;
  }

  get device(): PointerDevice {
    return this.#device;
  }

  get isPrimary(): boolean {
    return this.#isPrimary;
  }

  get target(): Element | null {
    return this.#target.deref() ?? null;
  }

  get startTime(): timestamp {
    return this.#controller.startTrace ? this.#controller.startTrace.timeStamp : Number.NaN;
  }

  get duration(): milliseconds {
    return (this.#controller.lastTrace && this.#controller.startTrace) ? (this.#controller.lastTrace.timeStamp - this.#controller.startTrace.timeStamp) : Number.NaN;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<PointerActivity.Trace, void, void> {
    const streamReader = this.#traceStream.getReader();
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

  get result(): Promise<PointerActivity.Result> {
    return new Promise((resolve, reject) => {
      this.#progress.then(() => {
        const { movement, trackLength } = this.#controller;
        resolve({
          movementX: movement.x,
          movementY: movement.y,
          track: trackLength,
        });
      }).catch((r) => {
        reject(r);
      });
    });
  }

  get inProgress() {
    return this.#controller.inProgress;
  }
  get beforeTrace() {
    return this.#controller.beforeTrace;
  }
  get startTrace() {
    return this.#controller.startTrace;
  }
  get endTrace() {
    return this.#controller.endTrace;
  }
  // get watchedModifiers() {
  //   return this.#controller.watchedModifiers;
  // }

}

class _PointerActivityController {
  readonly #traceStreamTerminator: AbortController;
  readonly #activity: _PointerActivityImpl;
  // readonly #modifiersToWatch: Set<Pointer.Modifier>;

  #traceCount: number = 0;
  #terminated: boolean = false;
  #progressResolver: () => void = (): void => {};
  #traceStreamController: ReadableStreamDefaultController<PointerActivity.Trace> | null = null;
  #beforeTrace: PointerActivity.Trace | null = null;
  #startTrace: PointerActivity.Trace | null = null;
  #lastTrace: PointerActivity.Trace | null = null;
  #trackLength: number = 0;

  constructor(event: PointerActivity.Trace.Source, target: Element, options: _PointerActivityOptions) {
    this.#traceStreamTerminator = new AbortController();
    // this.#modifiersToWatch = options.modifiersToWatch;

    let start: (controller: ReadableStreamDefaultController<PointerActivity.Trace>) => void;
    if (options.signal.aborted === true) {
      start = (controller: ReadableStreamDefaultController<PointerActivity.Trace>): void => {
        controller.close();
      };
    }
    else {
      start = (controller: ReadableStreamDefaultController<PointerActivity.Trace>): void => {
        options.signal.addEventListener("abort", () => {
          controller.close();
        }, {
          passive: true,
          signal: this.#traceStreamTerminator.signal,
        });
        this.#traceStreamController = controller;
      };
    }
    const progress: Promise<void> = new Promise((resolve: () => void) => {
      this.#progressResolver = resolve;
    });
    this.#activity = new _PointerActivityImpl(this, event, target, { start }, progress);
  }

  get activity(): PointerActivity {
    return this.#activity;
  }

  //get startViewportOffset(): Geometry2d.Point | null {
  //  return this.#startTrace ? {x:this.#startTrace.viewportX : null;
  //}

  //get startTargetOffset(): Geometry2d.Point | null {
  //  return this.#startTrace ? {x:this.#startTrace.targetX,y:} : null;
  //}

  get movement(): Geometry2d.Point {
    if (this.lastTrace && this.startTrace) {
      return Object.freeze({
        x: (this.lastTrace.viewportX - this.startTrace.viewportX),
        y: (this.lastTrace.viewportY - this.startTrace.viewportY),
      });
    }
    return Object.freeze({
      x: 0,
      y: 0,
    });
  }

  get trackLength(): number {
    return this.#trackLength;
  }

  get inProgress(): boolean {
    return (this.#terminated !== true);
  }

  get beforeTrace(): PointerActivity.Trace | null {
    return this.#beforeTrace ? this.#beforeTrace : null;
  }

  get startTrace(): PointerActivity.Trace | null {
    return this.#startTrace ? this.#startTrace : null;
  }

  get lastTrace(): PointerActivity.Trace | null {
    return this.#lastTrace ? this.#lastTrace : null;
  }

  get endTrace(): PointerActivity.Trace | null {
    return (this.#terminated && this.#lastTrace) ? this.#lastTrace : null;
  }

  // get watchedModifiers(): Array<Pointer.Modifier> {
  //   return [...this.#modifiersToWatch];
  // }

  get traceCount(): number {
    return this.#traceCount;
  }

  terminate(): void {
    _Debug.assertWarn((this.#beforeTrace !== null), "beforeTrace not detected");  // 境界外からhoverまたは接触の状態でpointerenterした場合のみ存在する（タッチのように境界内でpointerenterした場合は無くても妥当）
    _Debug.assertWarn((this.#terminated !== true), "already terminated");

    if (this.#traceStreamController) {
      _Debug.logText(`activity terminated (${this.#activity.device.type}[${this.#activity.pointerId}])`);
      this.#traceStreamController.close();
      this.#traceStreamTerminator.abort();
    }

    this.#terminated = true;
    this.#progressResolver();
  }

  setBeforeTrace(source: PointerActivity.Trace.Source): void {
    const target = this.#activity.target as Element;// （終了後に外部から呼び出したのでもなければ）nullはありえない
    const trace: PointerActivity.Trace = PointerActivity.Trace.from(source, target, this.#lastTrace);
    this.#beforeTrace = trace;
  }

  appendTrace(source: PointerActivity.Trace.Source): void {
    if (this.#terminated === true) {
      throw new Error("InvalidStateError appendTrace#1");
    }

    if (this.#traceStreamController) {
      const target = this.#activity.target as Element;// （終了後に外部から呼び出したのでもなければ）nullはありえない
      const trace: PointerActivity.Trace = PointerActivity.Trace.from(source, target, this.#lastTrace);
      if (!this.#startTrace) {
        this.#startTrace = trace;
      }

      this.#trackLength = this.#trackLength + Geometry2d.Area.diagonal({
        width: Math.abs(trace.movementX),
        height: Math.abs(trace.movementY),
      });//XXX beforeとfirstの間の境界を起点にすべき

      this.#lastTrace = trace;
      this.#traceStreamController.enqueue(trace);
      this.#traceCount++;
    }
  }
}

type _PointerTypeFilter = (event: PointerEvent | PointerActivity.Trace.Source) => boolean;

// ダブルタップのズームはiOSでテキストをダブルタップしたときだけ？ →他の手段でズームしたのをダブルタップで戻すことはできる
// パン無効にする場合タブレット等でスクロール手段がなくなるので注意。スクロールが必要な場合は自前でスクロールを実装すること
// （広い範囲で）ズーム無効にする場合タブレット等で自動ズームを元に戻す手段がなくなるので注意（小さい入力欄にフォーカスしたとき等に自動ズームされる）
//type _PointerAction = "contextmenu" | "pan" | "pinch-zoom" | "double-tap-zoom" | "selection";// CSS touch-actionでは、ダブルタップズームだけを有効化する手段がない
const _PointerAction = {
  CONTEXTMENU: "contextmenu",
  PAN_AND_ZOOM: "pan-and-zoom",
  SELECTION: "selection",
} as const;
export type _PointerAction = typeof _PointerAction[keyof typeof _PointerAction];

type _ObservationOptions = {
  // modifiersToWatch: Set<Pointer.Modifier>,
  pointerTypeFilter: _PointerTypeFilter,
};

class _TargetObservation {
  private readonly _service: ViewportPointerTracker;//[$85]
  private readonly _observationCanceller: AbortController;//[$85]
  readonly #target: Element;
  readonly #callback: PointerObserver.Callback;
  readonly #activityControllers: Map<pointerid, _PointerActivityController>;
  readonly #capturingPointerIds: Set<pointerid>;

  readonly #includesHover: boolean;
  // readonly #modifiersToWatch: Set<Pointer.Modifier>;
  readonly #pointerTypeFilter: _PointerTypeFilter;
  readonly #usePointerCapture: boolean;
  // readonly #highPrecision: boolean;
  readonly #preventActions: Array<_PointerAction>;
  readonly #releaseImplicitPointerCapture: boolean;

  constructor(target: Element, callback: PointerObserver.Callback, options: _ObservationOptions) {
    this._service = ViewportPointerTracker.get(window);
    this._observationCanceller = new AbortController();
    this.#target = target;
    this.#callback = callback;
    this.#activityControllers = new Map();
    this.#capturingPointerIds = new Set();

    this.#includesHover = true;//XXX とりあえず固定 //XXX _pointerIsInContactの代わりを直接設定できるようにする
    // this.#modifiersToWatch = options.modifiersToWatch;
    this.#pointerTypeFilter = options.pointerTypeFilter;
    this.#usePointerCapture = true;
    // this.#highPrecision = false;//XXX webkit未実装:getCoalescedEvents
    this.#preventActions = [
      _PointerAction.CONTEXTMENU,
      _PointerAction.PAN_AND_ZOOM,
      _PointerAction.SELECTION,
    ];//XXX とりあえず固定
    this.#releaseImplicitPointerCapture = true;//XXX とりあえず固定

    const listenerOptions = {
      passive: true,
      signal: this._observationCanceller.signal,
    };

    const activeListenerOptions = {
      passive: false,
      signal: this._observationCanceller.signal,
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

      //[$109[ Safariでペンの場合、touchstartをキャンセルしないとポインターイベントの発火が間引かれる。
      //       touch-action:noneだけでは足りないらしい
      this.#target.addEventListener("touchstart", ((event: TouchEvent) => {
        event.preventDefault();
      }) as EventListener, activeListenerOptions);//XXX キャンセルするか設定可能にする
      //]$109]
      this.#target.addEventListener("touchmove", ((event: TouchEvent) => {
        event.preventDefault();
      }) as EventListener, activeListenerOptions);//XXX キャンセルするか設定可能にする
      this.#target.addEventListener("touchend", ((event: TouchEvent) => {
        event.preventDefault();
      }) as EventListener, activeListenerOptions);//XXX キャンセルするか設定可能にする
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

      this._setPointerCaptureIfContacted(event);
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointerup", ((event: PointerEvent): void => {
      if (PointerState.inContact(event) !== true) {
        (event.target as Element).releasePointerCapture(event.pointerId);
        this.#capturingPointerIds.delete(event.pointerId);
      }
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointercancel", ((event: PointerEvent): void => {
      _Debug.logEvent(event);
      (event.target as Element).releasePointerCapture(event.pointerId);
      this.#capturingPointerIds.delete(event.pointerId);
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointerleave", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      _Debug.logEvent(event);

      this.#handleTargetEvent(event).catch((reason?: any): void => {
        console.error(reason);
      });
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointerenter", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      _Debug.logEvent(event);

      this._setPointerCaptureIfContacted(event);

      this.#handleTargetEvent(event).catch((reason?: any): void => {
        console.error(reason);
      });
    }) as EventListener, listenerOptions);

    this._service.subscribe(this._handleWindowEvent);
  }

  private _setPointerCaptureIfContacted(event: PointerEvent): void {
    if (PointerState.inContact(event) === true) {
      if (this.#capturingPointerIds.has(event.pointerId) === true) {
        return;
      }

      if (this.#usePointerCapture === true) {
        if (this.#pointerTypeFilter(event) === true) {
          this.#capturingPointerIds.add(event.pointerId);
          this.#target.setPointerCapture(event.pointerId);
        }
      }
    }
  }

  get target(): Element {
    return this.#target;
  }

  //[$85]
  private _handleWindowEvent: (traceSource: PointerActivity.Trace.Source) => Promise<void> = (traceSource: PointerActivity.Trace.Source) => {
    const executor = (resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void) => {
      try {
        this.#handle(traceSource);
        resolve();
      }
      catch (exception) {
        console.error(exception);
        reject(exception);
      }
    };
    return new Promise(executor);
  }

  #handleTargetEvent: (event: PointerEvent) => Promise<void> = (event: PointerEvent) => {
    const executor = (resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void) => {
      try {
        this.#handle(PointerActivity.Trace.Source.from(event));
        resolve();
      }
      catch (exception) {
        console.error(exception);
        reject(exception);
      }
    };
    return new Promise(executor);
  }

  #handle(traceSource: PointerActivity.Trace.Source): void {
    if (this.#pointerTypeFilter(traceSource) !== true) {
      return;
    }

    const pointerHasContact = (PointerState.inContact(traceSource) === true);
    let activityController: _PointerActivityController;

    if (traceSource.composedPath.includes(this.#target) === true) {
      // targetまたはその子孫で発火の場合

      if (this.#activityControllers.has(traceSource.pointerId) !== true) {
        // activitiesに未登録の場合

        if ((this.#includesHover !== true) && (pointerHasContact !== true)) {
          return;
        }

        let appendAsLast = false;
        if (this.#includesHover === true) {
          // pointerenterでactivity生成、pointerleaveで終了
          appendAsLast = ["pointerdown", "pointermove", "pointerup"].includes(traceSource.type);
        }
        else {
          // pointerdown|pointermoveかつpointerHasContactでactivity生成、pointerHasContact!=trueで終了
          appendAsLast = ["pointerdown", "pointermove"].includes(traceSource.type) && (pointerHasContact === true);
        }

        activityController = new _PointerActivityController(traceSource, this.#target, {
          signal: this._observationCanceller.signal,
          // modifiersToWatch: this.#modifiersToWatch,
        });
        this.#activityControllers.set(traceSource.pointerId, activityController);
        if (appendAsLast === true) {
          if (traceSource.prev) {
            activityController.setBeforeTrace(traceSource.prev);
          }
          activityController.appendTrace(traceSource);
        }
      }
      else {
        // activitiesに登録済の場合

        activityController = this.#activityControllers.get(traceSource.pointerId) as _PointerActivityController;
        if (activityController.traceCount <= 0) {
          // pointerenterで生成されたので一度もappendしていない場合
          if (traceSource.prev) {
            activityController.setBeforeTrace(traceSource.prev);
          }
        }

        // includesHoverに関係なく、pointerdown|pointermove|pointerup|pointerleaveを_append
        // pointercancelは来ないはず
        // if ((this.#highPrecision === true) && (curr.type === "pointermove")) {
        //   for (const coalesced of curr.getCoalescedEvents()) {
        //     activityController.appendTrace(coalesced);
        //   }
        // }
        // else {
        activityController.appendTrace(traceSource);//XXX pointercancel（だけ？）は除外しないと座標が0,0？の場合がある 先にpointerleaveになるから問題ない？
        // }
      }

      if (activityController.traceCount === 1) {
        this.#callback(activityController.activity);
      }

      if (
        ((this.#includesHover !== true) && (pointerHasContact !== true))
        || (["pointercancel", "pointerleave"].includes(traceSource.type) === true)
      ) {
        this.#activityControllers.delete(traceSource.pointerId);
        activityController.terminate();
      }
    }
    else {
      // target外の発火の場合
      // targetのみの監視だと、ブラウザ毎に特定条件でpointerupが発火しないだの何だの様々な問題があって監視に漏れが発生するので、windowを監視してれば余程漏れは無いであろうということで。

      if (this.#activityControllers.has(traceSource.pointerId) === true) {
        activityController = this.#activityControllers.get(traceSource.pointerId) as _PointerActivityController;
        this.#activityControllers.delete(traceSource.pointerId);
        activityController.terminate();
      }
    }
  }

  dispose(): void {
    this._observationCanceller.abort();
    this._service.unsubscribe(this._handleWindowEvent);
  }
}

const _DEFAULT_POINTER_TYPE_FILTER = Object.freeze([
  PointerDevice.Type.MOUSE,
  PointerDevice.Type.PEN,
  PointerDevice.Type.TOUCH,
]);

// filterSourceは参照渡し
function _createPointerTypeFilter(pointerTypeFilterSource?: Array<string>): _PointerTypeFilter {
  if (!pointerTypeFilterSource ) {
    return () => true;
  }
  if (Array.isArray(pointerTypeFilterSource) !== true) {
    return () => true;
  }
  if (pointerTypeFilterSource.every((s) => typeof s === "string") !== true) {
    return () => true;
  }

  const pointerTypes = pointerTypeFilterSource ? [...pointerTypeFilterSource] : [..._DEFAULT_POINTER_TYPE_FILTER];
  return (event: PointerEvent | PointerActivity.Trace.Source): boolean => {
    return (pointerTypes.includes(event.pointerType) === true);
  };
}

function _normalizeModifiers(modifiers?: Array<string>): Set<Pointer.Modifier> {
  if (!modifiers) {
    return new Set();
  }
  if (Array.isArray(modifiers) !== true) {
    return new Set();
  }
  if (modifiers.every((s) => typeof s === "string") !== true) {
    return new Set();
  }

  const validModifiers = Object.values(Pointer.Modifier);
  return new Set([...modifiers].filter((modifier) => validModifiers.includes(modifier as Pointer.Modifier)) as Array<Pointer.Modifier>);
}

class PointerObserver {
  private readonly _callback: PointerObserver.Callback;//[$85] ES標準（#）でprivateにするとVueから使ったときエラーになるのでTypeScriptのprivate修飾子を使用
  private readonly _targets: Map<Element, Set<_TargetObservation>>;//[$85]

  // private readonly _modifiersToWatch: Set<Pointer.Modifier>;//[$85]
  private readonly _pointerTypeFilter: _PointerTypeFilter;//[$85]

  constructor(callback: PointerObserver.Callback, options: PointerObserver.Options = {}) {
    this._callback = callback;
    this._targets = new Map();
    // this._modifiersToWatch = _normalizeModifiers(options.modifiersToWatch);
    this._pointerTypeFilter = _createPointerTypeFilter(options.pointerTypeFilter);
  }

  observe(target: Element): void {
    const observation = new _TargetObservation(target, this._callback, {
      // modifiersToWatch: this._modifiersToWatch,
      pointerTypeFilter: this._pointerTypeFilter,
    });
    if (this._targets.has(target) !== true) {
      this._targets.set(target, new Set());
    }
    (this._targets.get(target) as Set<_TargetObservation>).add(observation);
  }

  unobserve(target: Element): void {
    const observations = (this._targets.get(target) as Set<_TargetObservation>);
    for (const observation of observations) {
      observation.dispose();
    }
    observations.clear();
    this._targets.delete(target);
  }

  disconnect(): void {
    for (const target of this._targets.keys()) {
      this.unobserve(target);
    }
  }

  /** @experimental */
  static _enableDevMode(): void {
    _Debug.setConfig({ enabled: true });
  }
}

namespace PointerObserver {

  export type Callback = (activity: PointerActivity) => void;

  /**
   * 
   */
  export type Options = {
    //XXX modifiersToWatch?: Array<string>,// PointerEvent発生時にgetModifierState()で検査する対象
    pointerTypeFilter?: Array<string>, // マッチしない場合streamを生成しない（pointerTypeは不変なので生成してからフィルタする必要はない）

    //XXX pointerdown,pointermove(,pointerupも？)イベントをキャンセルするか否か
    //    - 中ボタン押下でのスクロール
    //XXX activity終了時点でpointerはtarget上にあるか検査するか否か
    //    → お手軽なのは、
    //      - viewport座標がbounding-box内にあるか判定
    //      - viewport座標をelementsFromPointでヒットテスト
    //      のいずれかだが、いずれもpointerleaveの発火条件とは一致しない
    //      厳密にやるなら後者をtargetの全子孫に対して行う必要がある（ただしelementsFromPointはgetBoundingClientRectより有意に遅い）
    //XXX activityの生存条件（trueのとき生成し、falseになったら終了する）
    //XXX mouseButton,penButtonも指定されたもの以外は監視しない？
    //XXX pointer captureしない設定
    //XXX 排他設定（pointer 1つのみ監視）
    //XXX 監視中にポインターを停止している間、stream追加する/しない の設定
    //XXX pointerrawupdateを使用するか否か
    //XXX 合体イベントを分解するか否か
    //      windowで監視している関係上、targetの境界から内側に入る前のイベントも合体される（Chromeでは見かけないがブラウザによる。Firefoxは顕著）
    //        境界外のイベントの除外が必要
    //        - timeStampで除外・・・FirefoxのpointerenterのtimeStampが信用できない
    //        - 座標で除外・・・どこまでやるか
    //            - boundingboxで判定・・・一番早いが、target外辺とboundingboxが一致しない場合（角が丸い場合とか子孫が境界外に出ている場合とか）に対応できない
    //            - targetおよびそのすべての子孫でヒットテスト・・・明確に遅い
    //XXX visualViewportのscroll,resizeでactivityを終了させるか否か
  };

}

export {
  PointerObserver,
};
