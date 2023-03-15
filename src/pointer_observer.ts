import { type pointerid, _inContact, _pointerTrackFrom, Pointer } from "./pointer";
import { ViewportPointerTracker } from "./viewport_pointer_tracker";
import { PointerCapture } from "./pointer_capture";

type timestamp = number;

type milliseconds = number;

type _PointerTrackSequenceOptions = {
  signal: AbortSignal,
};

class _PointerTrackSequence implements Pointer.TrackSequence {
  readonly #pointerId: pointerid;
  readonly #pointerType: string;
  readonly #primaryPointer: boolean;
  readonly #target: Element;
  readonly #stream: ReadableStream<Pointer.Track>;

  #controller: ReadableStreamDefaultController<Pointer.Track> | null = null;
  #firstTrack: Pointer.Track | null = null;
  #lastTrack: Pointer.Track | null = null;
  #absoluteX: number = 0;
  #absoluteY: number = 0;

  constructor(event: PointerEvent, target: Element, options: _PointerTrackSequenceOptions) {
    this.#pointerId = event.pointerId;
    this.#pointerType = event.pointerType;
    this.#primaryPointer = event.isPrimary;
    this.#target = target;
    const start = (controller: ReadableStreamDefaultController<Pointer.Track>): void => {
      options.signal.addEventListener("abort", () => {
        controller.close();
      }, { passive: true });
      this.#controller = controller;
    };
    if (options.signal.aborted === true) {
      this.#stream = new ReadableStream({
        start(controller) {
          controller.close();
        }
      });
      return;
    }
    this.#stream = new ReadableStream({
      start,
    });
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

  _append(event: PointerEvent, coalescedInto?: PointerEvent): void {
    if (this.#controller) {
      const track: Pointer.Track = _pointerTrackFrom(event, this.#target, (coalescedInto ? coalescedInto : undefined));
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

// ダブルタップのズームは最近のiOSでは出来ない →他の手段でズームしたのをダブルタップで戻すことはできる
// パン無効にする場合タブレット等でスクロール手段がなくなるので注意。スクロールが必要な場合は自前でスクロールを実装すること
// （広い範囲で）ズーム無効にする場合タブレット等で自動ズームを元に戻す手段がなくなるので注意（小さい入力欄にフォーカスしたとき等に自動ズームされる）
//type _PointerAction = "contextmenu" | "pan" | "pinch-zoom" | "double-tap-zoom" | "selection";// CSS touch-actionでは、ダブルタップズームだけを有効化する手段がない
type _PointerAction = "contextmenu" | "pan-and-zoom" | "selection";

type _PointerFilter = (event: PointerEvent) => boolean;

type _TargetObservationOptions = {
  highPrecision: boolean,
  streamInitFilter: _PointerFilter,
  autoCaptureEnabled: boolean,
  autoCaptureFilter: _PointerFilter, // フィルタ設定と関係なく、「接触あり」は絶対条件
  //preventActions?: Array<_PointerAction>,//XXX 初期バージョンではとりあえず変更不可
  //releaseImplicitPointerCapture?: boolean,//XXX 初期バージョンではとりあえず強制true
};

class _TargetObservation {
  readonly #service: ViewportPointerTracker;
  readonly #aborter: AbortController;
  readonly #target: Element;
  readonly #callback: PointerObserver.Callback;
  readonly #trackSequences: Map<pointerid, Pointer.TrackSequence>;
  readonly #capturingPointerIds: Set<pointerid>;

  readonly #highPrecision: boolean;
  readonly #streamInitFilter: _PointerFilter;
  readonly #autoCaptureEnabled: boolean;
  readonly #autoCaptureFilter: _PointerFilter;
  readonly #preventActions: Array<_PointerAction>;
  readonly #releaseImplicitPointerCapture: boolean;

  constructor(target: Element, callback: PointerObserver.Callback, options: _TargetObservationOptions) {
    this.#service = ViewportPointerTracker.get(window);
    this.#aborter = new AbortController();
    this.#target = target;
    this.#callback = callback;
    this.#trackSequences = new Map();
    this.#capturingPointerIds = new Set();

    this.#highPrecision = (options.highPrecision === true) && !!(new PointerEvent("test")).getCoalescedEvents;// webkit未実装:getCoalescedEvents
    this.#streamInitFilter = options.streamInitFilter;
    this.#autoCaptureEnabled = options.autoCaptureEnabled;
    this.#autoCaptureFilter = options.autoCaptureFilter;
    //this.#preventActions = ((options.preventActions) && (Array.isArray(options.preventActions) === true)) ? [...options.preventActions] : ["contextmenu", "pan-and-zoom", "doubletap-zoom", "selection"];
    this.#preventActions = ["contextmenu", "pan-and-zoom", "selection"];
    //this.#releaseImplicitPointerCapture = (options.releaseImplicitPointerCapture === true);
    this.#releaseImplicitPointerCapture = true;

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
      if (_inContact(event) === true) {
        if (this.#capturingPointerIds.has(event.pointerId) === true) {
          return;
        }

        if (this.#autoCaptureEnabled === true) {
          if (this.#autoCaptureFilter(event) === true) {
            this.#capturingPointerIds.add(event.pointerId);
            this.#target.setPointerCapture(event.pointerId);
          }
        }
      }
    }) as EventListener, listenerOptions);

    this.#target.addEventListener("pointerup", ((event: PointerEvent): void => {
      if (_inContact(event) !== true) {
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
      });//XXX pointerenterでの#handleAsyncは不要
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
    if (this.#streamInitFilter(event) !== true) {
      return;
    }

    let trackSequence: _PointerTrackSequence;

    if (event.composedPath().includes(this.#target) === true) {
      if (this.#trackSequences.has(event.pointerId) !== true) {
        trackSequence = new _PointerTrackSequence(event, this.#target, {
          signal: this.#aborter.signal,
        });
        this.#trackSequences.set(event.pointerId, trackSequence);
        trackSequence._append(event);
        this.#callback(trackSequence);
      }
      else {
        trackSequence = this.#trackSequences.get(event.pointerId) as _PointerTrackSequence;
        if ((this.#highPrecision === true) && (event.type === "pointermove")) {
          //let i = 0;
          for (const coalesced of event.getCoalescedEvents()) {
            trackSequence._append(coalesced, event);
            //i++;
          }
          //console.log(i);
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
    this.#service.unsubscribe(this.#handleAsync);
  }
}

const _DEFAULT_POINTER_TYPE_FILTER = Object.freeze([
  Pointer.Type.MOUSE,
  Pointer.Type.PEN,
  Pointer.Type.TOUCH,
]);

// filterSourceは参照渡し
function _createStartFilter(filterSource?: Pointer.Filter): _PointerFilter {
  return (event: PointerEvent): boolean => {
    if (!filterSource) {
      return true;
    }

    const pointerTypes = filterSource.pointerType ? [...filterSource.pointerType] : [..._DEFAULT_POINTER_TYPE_FILTER];
    if (pointerTypes.includes(event.pointerType) !== true) {
      return false;
    }

    const isPrimaryPointer = (filterSource.primaryPointer === true);
    if ((isPrimaryPointer === true) && (event.isPrimary !== true)) {
      return false;
    }

    return true;
  };
}

function _createPointerCaptureFilter(filterSource?: PointerCapture.Filter): _PointerFilter {
  return (event: PointerEvent): boolean => {
    const baseFilter = _createStartFilter(filterSource);
    if (baseFilter(event) !== true) {
      return false;
    }

    return true;
  };
}

class PointerObserver {
  readonly #callback: PointerObserver.Callback;
  readonly #targets: Map<Element, Set<_TargetObservation>>;

  readonly #highPrecision: boolean;
  readonly #streamInitFilter: _PointerFilter;
  readonly #autoCaptureEnabled: boolean;
  readonly #autoCaptureFilter: _PointerFilter;

  constructor(callback: PointerObserver.Callback, options: PointerObserver.Options = {}) {
    this.#callback = callback;
    this.#targets = new Map();
    this.#highPrecision = options.highPrecision ?? false;
    this.#streamInitFilter = _createStartFilter(options.filter);
    this.#autoCaptureEnabled = (options.autoCapture?.enabled === true);
    this.#autoCaptureFilter = _createPointerCaptureFilter(options.autoCapture?.filter);
  }

  observe(target: Element): void {
    const observation = new _TargetObservation(target, this.#callback, {
      highPrecision: this.#highPrecision,
      streamInitFilter: this.#streamInitFilter,
      autoCaptureEnabled: this.#autoCaptureEnabled,
      autoCaptureFilter: this.#autoCaptureFilter,
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

  export type Callback = (trackSequence: Pointer.TrackSequence) => void;

  export type Options = {
    highPrecision?: boolean,
    filter?: Pointer.Filter,
    autoCapture?: {
      enabled?: boolean,
      filter?: PointerCapture.Filter,
    },
  };

}

export {
  PointerObserver,
};





/*
TODO
- Firefoxでpointerenter前後のpointerevent発火順とstreamの順が一致しない
    → おそらく、firefoxのEvent.timeStampがそもそもおかしい

- 要素境界をまたいでもpointermoveは合体されてる（windowでpointermoveをlistenしているので当然だが）
    → 境界外のはstreamに出力しないように除外するか

- optionsでモード設定
  - すべて
  - 接触のみ
- capture始点からの相対距離
- capture終点はtarget上か否か →stream終了時点でtarget上か検査するoptionを追加する（pointercaptureしない場合は無意味なoptionとして）
- touchmoveキャンセル
- 中クリックの自動スクロールがpointerdown
- maxTouchPointsで上限設定する（ロストしたときに必ず_terminateしていれば不要なはず）（取りこぼしがなければ）
*/
