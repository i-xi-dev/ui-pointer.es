import {
  type milliseconds,
  type pointerid,
  type timestamp,
  type PointerActivity,
  type PointerMovement,
  type PointerMotion,
  _pointerFrom,
  _pointerIsInContact,
  _pointerMotionFrom,
  Pointer,
  PointerModifier,
  PointerType,
} from "./pointer";
import { ViewportPointerTracker } from "./viewport_pointer_tracker";

type _PointerActivityOptions = {
  signal: AbortSignal,
  watchModifiers: Set<PointerModifier>,
};

class _PointerActivity implements PointerActivity {
  readonly #watchModifiers: Set<PointerModifier>;
  readonly #motionStreamTerminator: AbortController;
  readonly #pointer: Pointer;
  readonly #target: Element;
  readonly #motionStream: ReadableStream<PointerMotion>;

  #motionStreamController: ReadableStreamDefaultController<PointerMotion> | null = null;
  #firstMotion: PointerMotion | null = null;
  #lastMotion: PointerMotion | null = null;
  #absoluteX: number = 0;
  #absoluteY: number = 0;

  constructor(event: PointerEvent, target: Element, options: _PointerActivityOptions) {
    this.#watchModifiers = options.watchModifiers;
    this.#motionStreamTerminator = new AbortController();
    this.#pointer = _pointerFrom(event);
    this.#target = target;
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
    return this.#firstMotion ? this.#firstMotion._source.timeStamp : Number.NaN;
  }

  get duration(): milliseconds {//TODO firefoxのpointerenterのtimeStampは同じ座標の最初のpointermoveより後になる
    return (this.#lastMotion && this.#firstMotion) ? (this.#lastMotion._source.timeStamp - this.#firstMotion._source.timeStamp) : Number.NaN;
  }

  get motionStream(): ReadableStream<PointerMotion> {
    return this.#motionStream;
  }

  get movement(): PointerMovement {
    if (this.#lastMotion && this.#firstMotion) {
      const lastViewportOffset = this.#lastMotion.viewportOffset;
      const firstViewportOffset = this.#firstMotion.viewportOffset;
      return Object.freeze({
        relativeX: (lastViewportOffset.x - firstViewportOffset.x),
        relativeY: (lastViewportOffset.y - firstViewportOffset.y),
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

  get firstMotion(): PointerMotion | null {
    return this.#firstMotion ? this.#firstMotion : null;
  }

  get lastMotion(): PointerMotion | null {
    return this.#lastMotion ? this.#lastMotion : null;
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

  _terminate(): void {
    if (this.#motionStreamController) {
      this.#motionStreamController.close();
      this.#motionStreamTerminator.abort();
    }
  }

  _append(event: PointerEvent): void {
    if (this.#motionStreamController) {
      const motion: PointerMotion = _pointerMotionFrom(event, this.#target, {
        watchModifiers: this.#watchModifiers,
      });
      if (!this.#firstMotion) {
        this.#firstMotion = motion;
      }
      if (this.#lastMotion) {
        const lastViewportOffset = this.#lastMotion.viewportOffset;
        const currViewportOffset = motion.viewportOffset;
        this.#absoluteX = this.#absoluteX + Math.abs(lastViewportOffset.x - currViewportOffset.x);
        this.#absoluteY = this.#absoluteY + Math.abs(lastViewportOffset.y - currViewportOffset.y);
      }
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
  pointerTypeFilter: _PointerTypeFilter,
  activeStateFilter: boolean,
  autoCaptureEnabled: boolean,
  watchModifiers: Set<PointerModifier>,
};

class _TargetObservation {
  readonly #service: ViewportPointerTracker;
  readonly #observationCanceller: AbortController;
  readonly #target: Element;
  readonly #callback: PointerObserver.Callback;
  readonly #activities: Map<pointerid, PointerActivity>;
  readonly #capturingPointerIds: Set<pointerid>;

  readonly #highPrecision: boolean;
  readonly #pointerTypeFilter: _PointerTypeFilter;
  readonly #activeStateFilter: boolean;
  readonly #autoCaptureEnabled: boolean;
  readonly #watchModifiers: Set<PointerModifier>;
  readonly #preventActions: Array<_PointerAction>;
  readonly #releaseImplicitPointerCapture: boolean;

  constructor(target: Element, callback: PointerObserver.Callback, options: _ObservationOptions) {
    this.#service = ViewportPointerTracker.get(window);
    this.#observationCanceller = new AbortController();
    this.#target = target;
    this.#callback = callback;
    this.#activities = new Map();
    this.#capturingPointerIds = new Set();

    this.#highPrecision = false;//XXX webkit未実装:getCoalescedEvents
    this.#pointerTypeFilter = options.pointerTypeFilter;
    this.#activeStateFilter = options.activeStateFilter;
    this.#autoCaptureEnabled = options.autoCaptureEnabled;
    this.#watchModifiers = options.watchModifiers;
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

        if (this.#autoCaptureEnabled === true) {
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
        if ((this.#activeStateFilter === true) && (pointerHasContact !== true)) {
          return;
        }

        activity = new _PointerActivity(event, this.#target, {
          signal: this.#observationCanceller.signal,
          watchModifiers: this.#watchModifiers,
        });
        this.#activities.set(event.pointerId, activity);
        activity._append(event);
        this.#callback(activity);
      }
      else {
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
        ((this.#activeStateFilter === true) && (pointerHasContact !== true))
        || (["pointercancel", "pointerleave"].includes(event.type) === true)
      ) {
        this.#activities.delete(event.pointerId);
        activity._terminate();
      }
    }
    else {
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
  PointerType.MOUSE,
  PointerType.PEN,
  PointerType.TOUCH,
]);

// filterSourceは参照渡し
function _createPointerTypeFilter(filterSource?: PointerObserver.Filter): _PointerTypeFilter {
  return (event: PointerEvent): boolean => {
    if (!filterSource) {
      return true;
    }

    const pointerTypes = filterSource.pointerTypes ? [...filterSource.pointerTypes] : [..._DEFAULT_POINTER_TYPE_FILTER];
    if (pointerTypes.includes(event.pointerType) !== true) {
      return false;
    }

    return true;
  };
}

function _normalizeModifiers(modifiers?: Iterable<string>): Set<PointerModifier> {
  if (modifiers) {
    const validModifiers = Object.values(PointerModifier);
    return new Set([...modifiers].filter((modifier) => validModifiers.includes(modifier as PointerModifier)) as Array<PointerModifier>);
  }
  return new Set();
}

class PointerObserver {
  readonly #callback: PointerObserver.Callback;
  readonly #targets: Map<Element, Set<_TargetObservation>>;

  readonly #pointerTypeFilter: _PointerTypeFilter;
  readonly #activeStateFilter: boolean;
  readonly #autoCaptureEnabled: boolean;
  readonly #watchModifiers: Set<PointerModifier>;

  constructor(callback: PointerObserver.Callback, options: PointerObserver.Options = {}) {
    this.#callback = callback;
    this.#targets = new Map();
    this.#pointerTypeFilter = _createPointerTypeFilter(options.filter);
    this.#activeStateFilter = (options.filter?.contact === true);
    this.#autoCaptureEnabled = (options.pointerCapture?.autoSet === true);
    this.#watchModifiers = _normalizeModifiers(options.watch?.modifiers);
  }

  observe(target: Element): void {
    const observation = new _TargetObservation(target, this.#callback, {
      pointerTypeFilter: this.#pointerTypeFilter,
      activeStateFilter: this.#activeStateFilter,
      autoCaptureEnabled: this.#autoCaptureEnabled,
      watchModifiers: this.#watchModifiers,
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

namespace PointerObserver {

  export type Callback = (activity: PointerActivity) => void;

  export type Filter = {
      // 監視フィルタの場合、マッチしない場合streamを生成しない（pointerTypeは不変なので生成してからフィルタする必要はない）
      // キャプチャフィルタの場合、マッチしない場合キャプチャしない
      pointerTypes?: Iterable<string>,

      // falseの場合、pointerenterでstream生成、pointerleaveで破棄
      // trueの場合、buttons&1==1でstream生成、buttons&1!=1で破棄
      contact?: boolean;
  };

  /**
   * @experimental
   * TODO 項目の命名がイマイチ
   */
  export type Options = {
    filter?: Filter,

    pointerCapture?: {
      // 接触したときpointer captureを行うか否か
      autoSet?: boolean,

    },

    watch?: {
      modifiers?: Iterable<string>,
    },
  };

}

export {
  PointerObserver,
};
