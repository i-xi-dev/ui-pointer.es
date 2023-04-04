import { PubSub } from "@i-xi-dev/pubsub";
import _Debug from "./debug";
import { type pointerid } from "./pointer";
import { PointerActivity } from "./pointer_activity";

const _TRACE = Symbol();

class ViewportPointerTracker {
  static #instance: ViewportPointerTracker | null = null;

  readonly #aborter: AbortController;
  private readonly _broker: PubSub.Broker<PointerActivity.Trace.Source>;//[$85]
  readonly #view: Window;
  #prevMap: Map<pointerid, PointerActivity.Trace.Source>;

  private constructor(view: Window) {
    this.#aborter = new AbortController();
    this._broker = new PubSub.Broker();
    this.#view = view;
    this.#prevMap = new Map();

    const listenerOptions = {
      passive: true,
      signal: this.#aborter.signal,
    };

    // this.#view.addEventListener("pointerenter", (event: PointerEvent) => {
    // Windowでは起きないっぽい（すくなくともChromeとFirefoxは）
    // }, listenerOptions);

    // this.#view.addEventListener("pointerleave", (event: PointerEvent) => {
    // Windowでは起きないっぽい（すくなくともChromeとFirefoxは）
    // }, listenerOptions);

    this.#view.addEventListener("pointermove", (event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }
      _Debug.logEvent(event);

      this.#publish(event);
    }, listenerOptions);

    this.#view.addEventListener("pointerdown", (event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }
      _Debug.logEvent(event);

      this.#publish(event);
    }, listenerOptions);

    this.#view.addEventListener("pointerup", (event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }
      _Debug.logEvent(event);

      this.#publish(event);
    }, listenerOptions);

    this.#view.addEventListener("pointercancel", (event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }
      _Debug.logEvent(event);

      this.#publish(event);
    }, listenerOptions);

    // this.#view.screen.orientation.addEventListener("change", (event: Event) => {
    // 特に何かする必要は無いはず
    // }, listenerOptions);

    // this.#view.document.addEventListener("visibilitychange", (event: Event) => {
    // 特に何かする必要は無いはず
    // }, listenerOptions);
  }

  static get(view: Window): ViewportPointerTracker {
    if (!ViewportPointerTracker.#instance) {
      ViewportPointerTracker.#instance = new ViewportPointerTracker(view);
    }
    return ViewportPointerTracker.#instance;
  }

  dispose(): void {
    this.#aborter.abort();
    this._broker.clear();
  }

  subscribe(callback: (traceSource: PointerActivity.Trace.Source) => Promise<void>): void {
    this._broker.subscribe(_TRACE, callback, {
      signal: this.#aborter.signal,
    });
  }

  unsubscribe(callback: (traceSource: PointerActivity.Trace.Source) => Promise<void>): void {
    this._broker.unsubscribe(_TRACE, callback);
  }

  #publish(event: PointerEvent): void {
    const traceSource = PointerActivity.Trace.Source.from(event);
    traceSource.prev = this.#prevMap.get(event.pointerId) ?? null,
    this.#prevMap.set(event.pointerId, traceSource);
    this._broker.publish(_TRACE, traceSource).catch((reason?: any): void => {
      console.error(reason);
    });
  }
}

export {
  ViewportPointerTracker,
};
