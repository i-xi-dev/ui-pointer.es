import { Geometry2d } from "@i-xi-dev/ui-utils";
import _Debug from "./debug";
import {
  type milliseconds,
  type pointerid,
  type timestamp,
  type PointerActivity,
  type PointerTrace,
  _pointerIsInContact,
  _pointerTraceFrom,
  Pointer,
} from "./pointer";
import {
  type ViewportPointerRecord,
  ViewportPointerTracker,
} from "./viewport_pointer_tracker";

type _PointerActivityOptions = {
  signal: AbortSignal,
  modifiersToWatch: Set<Pointer.Modifier>,
};

namespace _Internal {
  export const terminate: unique symbol = Symbol();
  export const setBeforeTrace: unique symbol = Symbol();
  export const appendTrace: unique symbol = Symbol();
}

class _PointerActivity implements PointerActivity {
  readonly #modifiersToWatch: Set<Pointer.Modifier>;
  readonly #traceStreamTerminator: AbortController;
  readonly #pointer: Pointer;
  readonly #target: WeakRef<Element>;
  readonly #progress: Promise<void>;
  readonly #traceStream: ReadableStream<PointerTrace>;

  #traceCount: number = 0;
  #terminated: boolean = false;
  #progressResolver: () => void = (): void => {};
  #traceStreamController: ReadableStreamDefaultController<PointerTrace> | null = null;
  #beforeTrace: PointerTrace | null = null;
  #startTrace: PointerTrace | null = null;
  #lastTrace: PointerTrace | null = null;
  #trackLength: number = 0;

  constructor(event: PointerEvent, target: Element, options: _PointerActivityOptions) {
    this.#modifiersToWatch = options.modifiersToWatch;
    this.#traceStreamTerminator = new AbortController();
    this.#pointer = Pointer.from(event);
    this.#progress = new Promise((resolve: () => void) => {
      this.#progressResolver = resolve;
    });
    this.#target = new WeakRef(target);
    const start = (controller: ReadableStreamDefaultController<PointerTrace>): void => {
      options.signal.addEventListener("abort", () => {
        controller.close();
      }, {
        passive: true,
        signal: this.#traceStreamTerminator.signal,
      });
      this.#traceStreamController = controller;
    };
    if (options.signal.aborted === true) {
      this.#traceStream = new ReadableStream({
        start(controller) {
          controller.close();
        }
      });
      return;
    }
    this.#traceStream = new ReadableStream({
      start,
    });
  }

  // get activity(): PointerActivity {
  //   return this;//TODO _PointerActivityのメソッドを隠さなくても、PointerActivity型のオブジェクトを一方的に参照してそれをcallbackに渡せばいいのでは
  // }

  get pointer(): Pointer {
    return this.#pointer;
  }

  get target(): Element | null {
    return this.#target.deref() ?? null;
  }

  get startTime(): timestamp {
    return this.#startTrace ? this.#startTrace.timeStamp : Number.NaN;
  }

  get duration(): milliseconds {
    return (this.#lastTrace && this.#startTrace) ? (this.#lastTrace.timeStamp - this.#startTrace.timeStamp) : Number.NaN;
  }

  //get traceStream(): ReadableStream<PointerTrace> {
  //  return this.#traceStream;
  //}

  //get startViewportOffset(): Geometry2d.Point | null {
  //  return this.#startTrace ? {x:this.#startTrace.viewportX : null;
  //}

  //get startTargetOffset(): Geometry2d.Point | null {
  //  return this.#startTrace ? {x:this.#startTrace.targetX,y:} : null;
  //}

  get #currentMovement(): Geometry2d.Point {
    if (this.#lastTrace && this.#startTrace) {
      return Object.freeze({
        x: (this.#lastTrace.viewportX - this.#startTrace.viewportX),
        y: (this.#lastTrace.viewportY - this.#startTrace.viewportY),
      });
    }
    return Object.freeze({
      x: 0,
      y: 0,
    });
  }

  get result(): Promise<PointerActivity.Result> {
    return new Promise((resolve, reject) => {
      this.#progress.then(() => {
        const resultMovement = this.#currentMovement;
        resolve({
          movementX: resultMovement.x,
          movementY: resultMovement.y,
          track: this.#trackLength,
        });
      }).catch((r) => {
        reject(r);
      });
    });
  }

  get inProgress(): boolean {
    return (this.#terminated !== true);
  }

  get beforeTrace(): PointerTrace | null {
    return this.#beforeTrace ? this.#beforeTrace : null;
  }

  get startTrace(): PointerTrace | null {
    return this.#startTrace ? this.#startTrace : null;
  }

  // get lastTrace(): PointerTrace | null {
  //   return this.#lastTrace ? this.#lastTrace : null;
  // }

  get endTrace(): PointerTrace | null {
    return (this.#terminated && this.#lastTrace) ? this.#lastTrace : null;
  }

  get watchedModifiers(): Array<Pointer.Modifier> {
    return [...this.#modifiersToWatch];
  }

  get traceCount(): number {
    return this.#traceCount;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<PointerTrace, void, void> {
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

  [_Internal.terminate](): void {
    _Debug.assertWarn((this.#beforeTrace !== null), "beforeTrace not detected");  // 境界外からhoverまたは接触の状態でpointerenterした場合のみ存在する（タッチのように境界内でpointerenterした場合は無くても妥当）
    _Debug.assertWarn((this.#terminated !== true), "already terminated");

    if (this.#traceStreamController) {
      _Debug.logText("activity terminated");
      this.#traceStreamController.close();
      this.#traceStreamTerminator.abort();
    }

    this.#terminated = true;
    this.#progressResolver();
  }

  [_Internal.setBeforeTrace](event: PointerEvent): void {
    const target = this.target as Element;// （終了後に外部から呼び出したのでもなければ）nullはありえない
    const trace: PointerTrace = _pointerTraceFrom(event, target, {
      modifiersToWatch: this.#modifiersToWatch,
      prevTrace: this.#lastTrace,
    });
    this.#beforeTrace = trace;
  }

  [_Internal.appendTrace](event: PointerEvent): void {
    if (this.#terminated === true) {
      throw new Error("InvalidStateError appendTrace#1");
    }

    if (this.#traceStreamController) {
      const target = this.target as Element;// （終了後に外部から呼び出したのでもなければ）nullはありえない
      const trace: PointerTrace = _pointerTraceFrom(event, target, {
        modifiersToWatch: this.#modifiersToWatch,
        prevTrace: this.#lastTrace,
      });
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

type _PointerTypeFilter = (event: PointerEvent) => boolean;

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
  modifiersToWatch: Set<Pointer.Modifier>,
  pointerTypeFilter: _PointerTypeFilter,
};

class _TargetObservation {
  private readonly _service: ViewportPointerTracker;//[$85]
  private readonly _observationCanceller: AbortController;//[$85]
  readonly #target: Element;
  readonly #callback: PointerObserver.Callback;
  readonly #activities: Map<pointerid, PointerActivity>;
  readonly #capturingPointerIds: Set<pointerid>;

  readonly #includesHover: boolean;
  readonly #modifiersToWatch: Set<Pointer.Modifier>;
  readonly #pointerTypeFilter: _PointerTypeFilter;
  readonly #usePointerCapture: boolean;
  readonly #highPrecision: boolean;
  readonly #preventActions: Array<_PointerAction>;
  readonly #releaseImplicitPointerCapture: boolean;

  constructor(target: Element, callback: PointerObserver.Callback, options: _ObservationOptions) {
    this._service = ViewportPointerTracker.get(window);
    this._observationCanceller = new AbortController();
    this.#target = target;
    this.#callback = callback;
    this.#activities = new Map();
    this.#capturingPointerIds = new Set();

    this.#includesHover = true;//XXX とりあえず固定 //XXX _pointerIsInContactの代わりを直接設定できるようにする
    this.#modifiersToWatch = options.modifiersToWatch;
    this.#pointerTypeFilter = options.pointerTypeFilter;
    this.#usePointerCapture = true;
    this.#highPrecision = false;//XXX webkit未実装:getCoalescedEvents
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
      }) as EventListener, activeListenerOptions);
      //]$109]
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
      if (_pointerIsInContact(event) === true) {
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
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointerup", ((event: PointerEvent): void => {
      if (_pointerIsInContact(event) !== true) {
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

      this.#handleAsync(event).catch((reason?: any): void => {
        console.error(reason);
      });// pointerleaveは一応streamに追加する。どこに移動したかわからなくなるので。//XXX どこに出て行ったかはstreamとは別にするか？
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointerenter", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }
      _Debug.logEvent(event);

      this.#handleAsync(event).catch((reason?: any): void => {
        console.error(reason);
      });// pointerenterはstreamに追加しない（firefoxで同時に起きたはずの同座標のwindowのpointermoveよりtimeStampが遅い（2回目のpointermoveの後くらいになる））（chromeはpointermoveと必ず？同座標になるため無駄）
    }) as EventListener, listenerOptions);

    this._service.subscribe(this._handleAsync2);
  }

  get target(): Element {
    return this.#target;
  }

  //[$85]
  private _handleAsync2: (message: ViewportPointerRecord) => Promise<void> = (message: ViewportPointerRecord) => {
    const executor = (resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void) => {
      try {
        this.#handle(message);
        resolve();
      }
      catch (exception) {
        console.error(exception);
        reject(exception);
      }
    };
    return new Promise(executor);
  }

  #handleAsync: (event: PointerEvent) => Promise<void> = (event: PointerEvent) => {
    const executor = (resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void) => {
      try {
        this.#handle({
          curr: event,
          prev: null,
        });
        resolve();
      }
      catch (exception) {
        console.error(exception);
        reject(exception);
      }
    };
    return new Promise(executor);
  }

  #handle(message: ViewportPointerRecord): void {
    const { curr, prev } = message;
    if (this.#pointerTypeFilter(curr) !== true) {
      return;
    }

    const pointerHasContact = (_pointerIsInContact(curr) === true);
    let activity: _PointerActivity;

    if (curr.composedPath().includes(this.#target) === true) {
      // targetまたはその子孫で発火の場合

      if (this.#activities.has(curr.pointerId) !== true) {
        // activitiesに未登録の場合

        if ((this.#includesHover !== true) && (pointerHasContact !== true)) {
          return;
        }

        let appendAsLast = false;
        if (this.#includesHover === true) {
          // pointerenterでactivity生成、pointerleaveで終了
          appendAsLast = ["pointerdown", "pointermove", "pointerup"].includes(curr.type);
        }
        else {
          // pointerdown|pointermoveかつpointerHasContactでactivity生成、pointerHasContact!=trueで終了
          appendAsLast = ["pointerdown", "pointermove"].includes(curr.type) && (pointerHasContact === true);
        }

        activity = new _PointerActivity(curr, this.#target, {
          signal: this._observationCanceller.signal,
          modifiersToWatch: this.#modifiersToWatch,
        });
        this.#activities.set(curr.pointerId, activity);
        if (appendAsLast === true) {
          if (prev) {
            activity[_Internal.setBeforeTrace](prev);
          }
          activity[_Internal.appendTrace](curr);
        }
      }
      else {
        // activitiesに登録済の場合

        activity = this.#activities.get(curr.pointerId) as _PointerActivity;
        if (activity.traceCount <= 0) {
          // pointerenterで生成されたので一度もappendしていない場合
          if (prev) {
            activity[_Internal.setBeforeTrace](prev);
          }
        }

        // includesHoverに関係なく、pointerdown|pointermove|pointerup|pointerleaveを_append
        // pointercancelは来ないはず
        if ((this.#highPrecision === true) && (curr.type === "pointermove")) {
          for (const coalesced of curr.getCoalescedEvents()) {
            activity[_Internal.appendTrace](coalesced);
          }
        }
        else {
          activity[_Internal.appendTrace](curr);//XXX pointercancel（だけ？）は除外しないと座標が0,0？の場合がある 先にpointerleaveになるから問題ない？
        }
      }

      if (activity.traceCount === 1) {
        this.#callback(activity);
      }

      if (
        ((this.#includesHover !== true) && (pointerHasContact !== true))
        || (["pointercancel", "pointerleave"].includes(curr.type) === true)
      ) {
        this.#activities.delete(curr.pointerId);
        activity[_Internal.terminate]();
      }
    }
    else {
      // target外の発火の場合
      // targetのみの監視だと、ブラウザ毎に特定条件でpointerupが発火しないだの何だの様々な問題があって監視に漏れが発生するので、windowを監視してれば余程漏れは無いであろうということで。

      if (this.#activities.has(curr.pointerId) === true) {
        activity = this.#activities.get(curr.pointerId) as _PointerActivity;
        this.#activities.delete(curr.pointerId);
        activity[_Internal.terminate]();
      }
    }
  }

  dispose(): void {
    this._observationCanceller.abort();
    this._service.unsubscribe(this._handleAsync2);
  }
}

const _DEFAULT_POINTER_TYPE_FILTER = Object.freeze([
  Pointer.Type.MOUSE,
  Pointer.Type.PEN,
  Pointer.Type.TOUCH,
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
  return (event: PointerEvent): boolean => {
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

  private readonly _modifiersToWatch: Set<Pointer.Modifier>;//[$85]
  private readonly _pointerTypeFilter: _PointerTypeFilter;//[$85]

  constructor(callback: PointerObserver.Callback, options: PointerObserver.Options = {}) {
    this._callback = callback;
    this._targets = new Map();
    this._modifiersToWatch = _normalizeModifiers(options.modifiersToWatch);
    this._pointerTypeFilter = _createPointerTypeFilter(options.pointerTypeFilter);
  }

  observe(target: Element): void {
    const observation = new _TargetObservation(target, this._callback, {
      modifiersToWatch: this._modifiersToWatch,
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
    modifiersToWatch?: Array<string>,// PointerEvent発生時にgetModifierState()で検査する対象
    pointerTypeFilter?: Array<string>, // マッチしない場合streamを生成しない（pointerTypeは不変なので生成してからフィルタする必要はない）
  };

}

export {
  PointerObserver,
};
