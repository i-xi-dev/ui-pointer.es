import { PubSub } from "@i-xi-dev/pubsub";

const _TOPIC = Symbol();

type ViewportPointerRecord = {
  prev: PointerEvent | null,
  curr: PointerEvent,
};

class ViewportPointerTracker {
  static #instance: ViewportPointerTracker | null = null;

  readonly #aborter: AbortController;
  private readonly _broker: PubSub.Broker<ViewportPointerRecord>;//[$85]
  readonly #view: Window;
  #prevEvent: PointerEvent | null;

  private constructor(view: Window) {
    this.#aborter = new AbortController();
    this._broker = new PubSub.Broker();
    this.#view = view;
    this.#prevEvent = null;

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

      this.#publish(event);
    }, listenerOptions);

    this.#view.addEventListener("pointerdown", (event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }

      this.#publish(event);
    }, listenerOptions);

    this.#view.addEventListener("pointerup", (event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }

      this.#publish(event);
    }, listenerOptions);

    this.#view.addEventListener("pointercancel", (event: PointerEvent) => {
      if (event.isTrusted !== true) {
        return;
      }

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

  subscribe(callback: (message: ViewportPointerRecord) => Promise<void>): void {
    this._broker.subscribe(_TOPIC, callback, {
      signal: this.#aborter.signal,
    });
  }

  unsubscribe(callback: (message: ViewportPointerRecord) => Promise<void>): void {
    this._broker.unsubscribe(_TOPIC, callback);
  }

  #publish(event: PointerEvent): void {
    const message = {
      prev: this.#prevEvent,
      curr: event,
    };
    this.#prevEvent = event;
    this._broker.publish(_TOPIC, message).catch((reason?: any): void => {
      console.error(reason);
    });
  }
}

export {
  type ViewportPointerRecord,
  ViewportPointerTracker,
};
