import { Geometry2d } from "@i-xi-dev/ui-utils";
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
import { ViewportPointerTracker } from "./viewport_pointer_tracker";

type _PointerActivityOptions = {
  signal: AbortSignal,
  modifiersToWatch: Set<Pointer.Modifier>,
};

class _PointerActivity implements PointerActivity {
  readonly #modifiersToWatch: Set<Pointer.Modifier>;
  readonly #traceStreamTerminator: AbortController;
  readonly #pointer: Pointer;
  readonly #target: WeakRef<Element>;
  readonly #progress: Promise<void>;
  readonly #traceStream: ReadableStream<PointerTrace>;

  #appendCount: number = 0;
  #terminated: boolean = false;
  #progressResolver: () => void = (): void => {};
  #traceStreamController: ReadableStreamDefaultController<PointerTrace> | null = null;
  #beforeTrace: PointerTrace | null = null;//TODO
  #firstTrace: PointerTrace | null = null;
  #lastTrace: PointerTrace | null = null;
  #afterTrace: PointerTrace | null = null;//TODO
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

  get pointer(): Pointer {
    return this.#pointer;
  }

  get startTime(): timestamp {
    return this.#firstTrace ? this.#firstTrace.timeStamp : Number.NaN;
  }

  get duration(): milliseconds {
    return (this.#lastTrace && this.#firstTrace) ? (this.#lastTrace.timeStamp - this.#firstTrace.timeStamp) : Number.NaN;
  }

  get traceStream(): ReadableStream<PointerTrace> {
    return this.#traceStream;
  }

  get startViewportOffset(): Geometry2d.Point | null {
    return this.#firstTrace ? this.#firstTrace.viewportOffset : null;
  }

  get startTargetOffset(): Geometry2d.Point | null {
    return this.#firstTrace ? this.#firstTrace.targetOffset : null;
  }

  get currentMovement(): Geometry2d.Point {
    if (this.#lastTrace && this.#firstTrace) {
      const lastViewportOffset = this.#lastTrace.viewportOffset;
      const firstViewportOffset = this.#firstTrace.viewportOffset;
      return Object.freeze({
        x: (lastViewportOffset.x - firstViewportOffset.x),
        y: (lastViewportOffset.y - firstViewportOffset.y),
      });
    }
    return Object.freeze({
      x: 0,
      y: 0,
    });
  }

  get resultMovement(): Promise<Geometry2d.Point> {
    return new Promise((resolve, reject) => {
      this.#progress.then(() => {
        resolve(this.currentMovement);
      }).catch((r) => {
        reject(r);
      });
    });
  }

  get currentTrackLength(): number {
    return this.#trackLength;
  }

  get resultTrackLength(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.#progress.then(() => {
        resolve(this.currentTrackLength);
      }).catch((r) => {
        reject(r);
      });
    });
  }

  get target(): Element | null {
    return this.#target.deref() ?? null;
  }

  get inProgress(): boolean {
    return (this.#terminated !== true);
  }

  get beforeTrace(): PointerTrace | null {
    return this.#beforeTrace ? this.#beforeTrace : null;
  }

  get firstTrace(): PointerTrace | null {
    return this.#firstTrace ? this.#firstTrace : null;
  }

  get lastTrace(): PointerTrace | null {
    return this.#lastTrace ? this.#lastTrace : null;
  }

  get afterTrace(): PointerTrace | null {
    return this.#afterTrace ? this.#afterTrace : null;
  }

  get watchedModifiers(): Array<Pointer.Modifier> {
    return [...this.#modifiersToWatch];
  }

  get _appendCount(): number {
    return this.#appendCount;
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

  toJSON() {
    return {
      pointer: this.pointer,
      startTime: this.startTime,
      duration: this.duration,
      //traceStream
      startViewportOffset: this.startViewportOffset ? {
        x: this.startViewportOffset.x,
        y: this.startViewportOffset.y,
      } : null,
      startTargetOffset: this.startTargetOffset ? {
        x: this.startTargetOffset.x,
        y: this.startTargetOffset.y,
      } : null,
      movement: {
        x: this.currentMovement.x,
        y: this.currentMovement.y,
      },
      trackLength: this.currentTrackLength,
      inProgress: this.inProgress,
      //firstTrace
      //lastTrace
      watchedModifiers: [...this.watchedModifiers],
    };
  }

  _terminate(): void {
    console.assert(this.#terminated !== true, "slready terminated");

    if (this.#traceStreamController) {
      console.log("terminated");
      this.#traceStreamController.close();
      this.#traceStreamTerminator.abort();
    }

    this.#terminated = true;
    this.#progressResolver();
  }

  _append(event: PointerEvent): void {
    if (this.#terminated === true) {
      throw new Error("InvalidStateError _append#1");
    }

    if (this.#traceStreamController) {
      const target = this.target as Element;// （終了後に外部から呼び出したのでもなければ）nullはありえない
      const trace: PointerTrace = _pointerTraceFrom(event, target, {
        modifiersToWatch: this.#modifiersToWatch,
        prevTrace: this.#lastTrace,
      });
      if (!this.#firstTrace) {
        this.#firstTrace = trace;
      }

      const movement = trace.movement;
      this.#trackLength = this.#trackLength + Geometry2d.Area.diagonal({
        width: Math.abs(movement.x),
        height: Math.abs(movement.y),
      });

      this.#lastTrace = trace;
      this.#traceStreamController.enqueue(trace);
      this.#appendCount++;
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

    this.#includesHover = true;
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
      // ]$109]
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
      (event.target as Element).releasePointerCapture(event.pointerId);
      this.#capturingPointerIds.delete(event.pointerId);
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointerleave", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }

      this.#handleAsync(event, true).catch((reason?: any): void => {
        console.error(reason);
      });// pointerleaveは一応streamに追加する。どこに移動したかわからなくなるので。//XXX どこに出て行ったかはstreamとは別にするか？
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointerenter", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }

      console.log(`pointerenter: ${event.clientX}, ${event.clientY} / ${event.timeStamp}`);
      this.#handleAsync(event, false).catch((reason?: any): void => {
        console.error(reason);
      });// pointerenterはstreamに追加しない（firefoxで同時に起きたはずの同座標のwindowのpointermoveよりtimeStampが遅い（2回目のpointermoveの後くらいになる））（chromeはpointermoveと必ず？同座標になるため無駄）
    }) as EventListener, listenerOptions);

    this._service.subscribe(this._handleAsync2);
  }

  get target(): Element {
    return this.#target;
  }

  //[$85]
  private _handleAsync2: (event: PointerEvent) => Promise<void> = (event: PointerEvent) => {
    const executor = (resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void) => {
      try {
        this.#handle(event, true);
        resolve();
      }
      catch (exception) {
        console.log(exception);
        reject(exception);
      }
    };
    return new Promise(executor);
  }

  #handleAsync: (event: PointerEvent, toAppend: boolean) => Promise<void> = (event: PointerEvent, toAppend: boolean) => {
    const executor = (resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void) => {
      try {
        this.#handle(event, toAppend);
        resolve();
      }
      catch (exception) {
        console.log(exception);
        reject(exception);
      }
    };
    return new Promise(executor);
  }

  #handle(event: PointerEvent, toAppend: boolean): void {
    if (this.#pointerTypeFilter(event) !== true) {
      return;
    }

    const pointerHasContact = (_pointerIsInContact(event) === true);
    let activity: _PointerActivity;

    if (event.composedPath().includes(this.#target) === true) {
      if (this.#activities.has(event.pointerId) !== true) {
        console.log(666)
        if ((this.#includesHover !== true) && (pointerHasContact !== true)) {
          return;
        }

        activity = new _PointerActivity(event, this.#target, {
          signal: this._observationCanceller.signal,
          modifiersToWatch: this.#modifiersToWatch,
        });
        this.#activities.set(event.pointerId, activity);
        if (toAppend === true) {
          activity._append(event);
        }
      }
      else {
        console.log(777)
        activity = this.#activities.get(event.pointerId) as _PointerActivity;
        if ((this.#highPrecision === true) && (event.type === "pointermove")) {
          for (const coalesced of event.getCoalescedEvents()) {
            activity._append(coalesced);
          }
        }
        else {
          activity._append(event);//XXX pointercancel（だけ？）は除外しないと座標が0,0？の場合がある 先にpointerleaveになるから問題ない？
        }
      }

      if (activity._appendCount === 1) {
        this.#callback(activity);
      }

      if (
        ((this.#includesHover !== true) && (pointerHasContact !== true))
        || (["pointercancel", "pointerleave"].includes(event.type) === true)
      ) {
        this.#activities.delete(event.pointerId);
        console.log(event)
        activity._terminate();
      }
    }
    else {
      // targetのみの監視だと、ブラウザ毎に特定条件でpointerupが発火しないだの何だの様々な問題があって監視に漏れが発生するので、windowを監視してれば余程漏れは無いであろうということで。
      if (this.#activities.has(event.pointerId) === true) {
        console.log(888);
        activity = this.#activities.get(event.pointerId) as _PointerActivity;
        this.#activities.delete(event.pointerId);
        activity._terminate();
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
