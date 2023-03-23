import { Geometry2d } from "@i-xi-dev/ui-utils";
import {
  type milliseconds,
  type pointerid,
  type timestamp,
  type PointerActivity,
  type PointerMotion,
  _pointerIsInContact,
  _pointerMotionFrom,
  Pointer,
} from "./pointer";
import { ViewportPointerTracker } from "./viewport_pointer_tracker";

type _PointerActivityOptions = {
  signal: AbortSignal,
  modifiersToWatch: Set<Pointer.Modifier>,
};

class _PointerActivity implements PointerActivity {
  readonly #modifiersToWatch: Set<Pointer.Modifier>;
  readonly #motionStreamTerminator: AbortController;
  readonly #pointer: Pointer;
  readonly #target: WeakRef<Element>;
  readonly #progress: Promise<void>;
  readonly #motionStream: ReadableStream<PointerMotion>;

  #terminated: boolean = false;
  #progressResolver: () => void = (): void => {};
  #motionStreamController: ReadableStreamDefaultController<PointerMotion> | null = null;
  #firstMotion: PointerMotion | null = null;
  #lastMotion: PointerMotion | null = null;
  #trackLength: number = 0;

  constructor(event: PointerEvent, target: Element, options: _PointerActivityOptions) {
    this.#modifiersToWatch = options.modifiersToWatch;
    this.#motionStreamTerminator = new AbortController();
    this.#pointer = Pointer.from(event);
    this.#progress = new Promise((resolve: () => void) => {
      this.#progressResolver = resolve;
    });
    this.#target = new WeakRef(target);
    const start = (controller: ReadableStreamDefaultController<PointerMotion>): void => {
      options.signal.addEventListener("abort", () => {
        controller.close();
      }, {
        passive: true,
        signal: this.#motionStreamTerminator.signal,
      });
      this.#motionStreamController = controller;
    };
    if (options.signal.aborted === true) {
      this.#motionStream = new ReadableStream({
        start(controller) {
          controller.close();
        }
      });
      return;
    }
    this.#motionStream = new ReadableStream({
      start,
    });
  }

  get pointer(): Pointer {
    return this.#pointer;
  }

  get startTime(): timestamp {
    return this.#firstMotion ? this.#firstMotion.timeStamp : Number.NaN;
  }

  get duration(): milliseconds {//TODO firefoxのpointerenterのtimeStampは同じ座標の最初のpointermoveより後になる
    return (this.#lastMotion && this.#firstMotion) ? (this.#lastMotion.timeStamp - this.#firstMotion.timeStamp) : Number.NaN;
  }

  get motionStream(): ReadableStream<PointerMotion> {
    return this.#motionStream;
  }

  get startViewportOffset(): Geometry2d.Point | null {
    return this.#firstMotion ? this.#firstMotion.viewportOffset : null;
  }

  get startTargetOffset(): Geometry2d.Point | null {
    return this.#firstMotion ? this.#firstMotion.targetOffset : null;
  }

  get currentMovement(): Geometry2d.Point {
    if (this.#lastMotion && this.#firstMotion) {
      const lastViewportOffset = this.#lastMotion.viewportOffset;
      const firstViewportOffset = this.#firstMotion.viewportOffset;
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

  get firstMotion(): PointerMotion | null {
    return this.#firstMotion ? this.#firstMotion : null;
  }

  get lastMotion(): PointerMotion | null {
    return this.#lastMotion ? this.#lastMotion : null;
  }

  get watchedModifiers(): Array<Pointer.Modifier> {
    return [...this.#modifiersToWatch];
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<PointerMotion, void, void> {
    const streamReader = this.#motionStream.getReader();
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
      //motionStream
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
      //firstMotion
      //lastMotion
      watchedModifiers: [...this.watchedModifiers],
    };
  }

  _terminate(): void {
    console.assert(this.#terminated !== true, "slready terminated");

    if (this.#motionStreamController) {
      console.log("terminated");
      this.#motionStreamController.close();
      this.#motionStreamTerminator.abort();
    }

    this.#terminated = true;
    this.#progressResolver();
  }

  _append(event: PointerEvent): void {
    if (this.#terminated === true) {
      throw new Error("InvalidStateError _append#1");
    }

    if (this.#motionStreamController) {
      const target = this.target as Element;// （終了後に外部から呼び出したのでもなければ）nullはありえない
      const motion: PointerMotion = _pointerMotionFrom(event, target, {
        modifiersToWatch: this.#modifiersToWatch,
        prevMotion: this.#lastMotion,
      });
      if (!this.#firstMotion) {
        this.#firstMotion = motion;
      }

      const movement = motion.movement;
      this.#trackLength = this.#trackLength + Geometry2d.Area.diagonal({
        width: Math.abs(movement.x),
        height: Math.abs(movement.y),
      });

      this.#lastMotion = motion;
      this.#motionStreamController.enqueue(motion);
    }
  }
}

type _PointerTypeFilter = (event: PointerEvent) => boolean;

// ダブルタップのズームは最近のiOSでは出来ない →他の手段でズームしたのをダブルタップで戻すことはできる
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
  includesHover: boolean,
  modifiersToWatch: Set<Pointer.Modifier>,
  pointerTypeFilter: _PointerTypeFilter,
  usePointerCapture: boolean,
};

class _TargetObservation {
  readonly #service: ViewportPointerTracker;
  readonly #observationCanceller: AbortController;
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
    this.#service = ViewportPointerTracker.get(window);
    this.#observationCanceller = new AbortController();
    this.#target = target;
    this.#callback = callback;
    this.#activities = new Map();
    this.#capturingPointerIds = new Set();

    this.#includesHover = options.includesHover;
    this.#modifiersToWatch = options.modifiersToWatch;
    this.#pointerTypeFilter = options.pointerTypeFilter;
    this.#usePointerCapture = options.usePointerCapture;
    this.#highPrecision = false;//XXX webkit未実装:getCoalescedEvents
    this.#preventActions = [
      _PointerAction.CONTEXTMENU,
      _PointerAction.PAN_AND_ZOOM,
      _PointerAction.SELECTION,
    ];//XXX とりあえず固定
    this.#releaseImplicitPointerCapture = true;//XXX とりあえず固定

    const listenerOptions = {
      passive: true,
      signal: this.#observationCanceller.signal,
    };

    const activeListenerOptions = {
      passive: false,
      signal: this.#observationCanceller.signal,
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

      // if () {
      //   // touch-actionを一律禁止すると、タブレット等でスクロールできなくなってしまうので
      //   // 代わりにpointer capture中のtouchmoveをキャンセルする
      //   // いくつかの環境で試してみた結果ではtouchmoveのみキャンセルすれば問題なさそうだったが、
      //   //   Pointer Events仕様でもTouch Events仕様でも preventDefaultすると何が起きるのかがほぼ未定義なのはリスク
      //   this.target.addEventListener("touchmove", ((event: TouchEvent) => {
      //     if (this._trackingMap.size > 0) {
      //       event.preventDefault();
      //     }
      //   }) as EventListener, activeListenerOptions);
      // }
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

      this.#handleAsync(event).catch((reason?: any): void => {
        console.error(reason);
      });// pointerleaveでの#handleAsyncは必要。どこに移動したかわからなくなるので。
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointerenter", ((event: PointerEvent): void => {
      if (event.isTrusted !== true) {
        return;
      }

      this.#handleAsync(event).catch((reason?: any): void => {
        console.error(reason);
      });//TODO pointerenterでの#handleAsyncは不要 開始のみ実施
    }) as EventListener, listenerOptions);

    this.#service.subscribe(this.#handleAsync);
  }

  get target(): Element {
    return this.#target;
  }

  #handleAsync: (event: PointerEvent) => Promise<void> = (event: PointerEvent) => {
    const executor = (resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void) => {
      try {
        this.#handle(event);
        resolve();
      }
      catch (exception) {
        console.log(exception);
        reject(exception);
      }
    };
    return new Promise(executor);
  }

  #handle(event: PointerEvent): void {
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
          signal: this.#observationCanceller.signal,
          modifiersToWatch: this.#modifiersToWatch,
        });
        this.#activities.set(event.pointerId, activity);
        activity._append(event);
        this.#callback(activity);
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
      console.log(888)
      // targetのみの監視だと、ブラウザ毎に特定条件でpointerupが発火しないだの何だの様々な問題があって監視に漏れが発生するので、windowを監視してれば余程漏れは無いであろうということで。
      if (this.#activities.has(event.pointerId) === true) {
        activity = this.#activities.get(event.pointerId) as _PointerActivity;
        this.#activities.delete(event.pointerId);
        activity._terminate();
      }
    }
  }

  dispose(): void {
    this.#observationCanceller.abort();
    this.#service.unsubscribe(this.#handleAsync);
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
  readonly #callback: PointerObserver.Callback;
  readonly #targets: Map<Element, Set<_TargetObservation>>;

  readonly #includesHover: boolean;
  readonly #modifiersToWatch: Set<Pointer.Modifier>;
  readonly #pointerTypeFilter: _PointerTypeFilter;
  readonly #usePointerCapture: boolean;

  constructor(callback: PointerObserver.Callback, options: PointerObserver.Options = {}) {
    this.#callback = callback;
    this.#targets = new Map();
    this.#includesHover = (options.includesHover === true);
    this.#modifiersToWatch = _normalizeModifiers(options.modifiersToWatch);
    this.#pointerTypeFilter = _createPointerTypeFilter(options.pointerTypeFilter);
    this.#usePointerCapture = (options.usePointerCapture === true);
  }

  observe(target: Element): void {
    const observation = new _TargetObservation(target, this.#callback, {
      includesHover: this.#includesHover,
      modifiersToWatch: this.#modifiersToWatch,
      pointerTypeFilter: this.#pointerTypeFilter,
      usePointerCapture: this.#usePointerCapture,
    });
    if (this.#targets.has(target) !== true) {
      this.#targets.set(target, new Set());
    }
    (this.#targets.get(target) as Set<_TargetObservation>).add(observation);
  }

  unobserve(target: Element): void {
    const observations = (this.#targets.get(target) as Set<_TargetObservation>);
    for (const observation of observations) {
      observation.dispose();
    }
    observations.clear();
    this.#targets.delete(target);
  }

  disconnect(): void {
    for (const target of this.#targets.keys()) {
      this.unobserve(target);
    }
  }
}

type _UsePointerCapture = boolean;//XXX 将来対応とする | ((event: PointerEvent) => boolean);

namespace PointerObserver {

  export type Callback = (activity: PointerActivity) => void;

  /**
   * 
   */
  export type Options = {
    includesHover?: boolean, // falseの場合、buttons&1==1でstream生成、buttons&1!=1で破棄 trueの場合、pointerenterでstream生成、pointerleaveで破棄
    modifiersToWatch?: Array<string>,// PointerEvent発生時にgetModifierState()で検査する対象
    pointerTypeFilter?: Array<string>, // マッチしない場合streamを生成しない（pointerTypeは不変なので生成してからフィルタする必要はない）
    usePointerCapture?: _UsePointerCapture,// 「接触したとき」に、pointer captureを行うか否か
  };

}

export {
  PointerObserver,
};
