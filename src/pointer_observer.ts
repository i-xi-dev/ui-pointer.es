import { Geometry2d, Keyboard } from "@i-xi-dev/ui-utils";

type pointerid = number;

const PointerType = {
  MOUSE: "mouse",
  PEN: "pen",
  TOUCH: "touch",
  UNKNOWN: "",
} as const;

const PointerState = {
  CONTACT: "contact",
  HOVER: "hover",
  INACTIVE: "inactive",
} as const;
type PointerState = typeof PointerState[keyof typeof PointerState];

const PointerModifier = {
  ALT: Keyboard.Key.ALT,
  CONTROL: Keyboard.Key.CONTROL,
  META: Keyboard.Key.META,
  SHIFT: Keyboard.Key.SHIFT,
} as const;
type PointerModifier = typeof PointerModifier[keyof typeof PointerModifier];

const MouseButton = {
  LEFT: "left",
  MIDDLE: "middle",
  RIGHT: "right",
  X1: "x1",
  X2: "x2",
} as const;
type MouseButton = typeof MouseButton[keyof typeof MouseButton];

const PenButton = {
  BARREL: "barrel",
  ERASER: "eraser",
} as const;
type PenButton = typeof PenButton[keyof typeof PenButton];

interface PointerTrack {
  readonly timestamp: number;
  readonly pointerId: pointerid;
  //readonly trustedPointer: boolean;
  readonly pointerState: PointerState;
  readonly modifiers: Array<PointerModifier>;
  readonly buttons: (Array<MouseButton> | Array<PenButton>);
  readonly contact: {
    readonly radiusX: number,
    readonly radiusY: number,
    readonly pressure: number,
  },
  readonly offset: {
    readonly fromViewport: {
      readonly x: number,
      readonly y: number,
    },
    readonly fromTargetBoundingBox: {
      readonly x: number,
      readonly y: number,
    },
  },
  readonly target: Element | null;
}
namespace PointerTrack {
  export function from(event: PointerEvent, target: Element): PointerTrack {
    const dispatcher = (event.target instanceof Element) ? event.target : null;
    let targetX = Number.NaN;
    let targetY = Number.NaN;
    if (dispatcher) {
      targetX = event.offsetX;
      targetY = event.offsetY;
    }
    if (!!dispatcher && (target !== dispatcher)) {
      const targetBoundingBox = target.getBoundingClientRect();
      const dispatcherBoundingBox = dispatcher.getBoundingClientRect();
      const { x, y } = Geometry2d.Point.distanceBetween(targetBoundingBox, dispatcherBoundingBox);
      targetX = targetX + x;
      targetY = targetY + y;
    }

    return Object.freeze({
      timestamp: event.timeStamp,
      pointerId: event.pointerId,
      pointerState: _pointerStateOf(event),
      modifiers: _pointerModifiersOf(event),
      buttons: (event.pointerType === PointerType.PEN) ? _penButtonsOf(event) : _mouseButtonsOf(event),
      contact: Object.freeze({
        radiusX: event.width / 2,
        radiusY: event.height / 2,
        pressure: event.pressure,
      }),
      offset: Object.freeze({
        fromViewport: Object.freeze({
          x: event.clientX,
          y: event.clientY,
        }),
        fromTargetBoundingBox: Object.freeze({
          x: targetX,
          y: targetY,
        }),
      }),
      target,
    });
  }
}

function _pointerStateOf(event: PointerEvent): PointerState {
  if (event.type === "pointercancel") {
    return PointerState.INACTIVE;
  }
  else if (event.buttons === 0) {
    return PointerState.HOVER;
  }
  else {
    return PointerState.CONTACT;
  }
}

function _pointerModifiersOf(event: PointerEvent): Array<PointerModifier> {
  const modifiers: Array<PointerModifier> = [];
  if (event.altKey === true) {
    modifiers.push(PointerModifier.ALT);
  }
  if (event.ctrlKey === true) {
    modifiers.push(PointerModifier.CONTROL);
  }
  if (event.metaKey === true) {
    modifiers.push(PointerModifier.META);
  }
  if (event.shiftKey === true) {
    modifiers.push(PointerModifier.SHIFT);
  }
  return modifiers;
}

function _mouseButtonsOf(event: PointerEvent): Array<MouseButton> {
  const mouseButtons: Array<MouseButton> = [];
  if ((event.buttons & 0b1) === 0b1) {
    mouseButtons.push(MouseButton.LEFT);
  }
  if ((event.buttons & 0b10) === 0b10) {
    mouseButtons.push(MouseButton.RIGHT);
  }
  if ((event.buttons & 0b100) === 0b100) {
    mouseButtons.push(MouseButton.MIDDLE);
  }
  if ((event.buttons & 0b1000) === 0b1000) {
    mouseButtons.push(MouseButton.X1);
  }
  if ((event.buttons & 0b10000) === 0b10000) {
    mouseButtons.push(MouseButton.X2);
  }
  return mouseButtons;
}

function _penButtonsOf(event: PointerEvent): Array<PenButton> {
  const penButtons: Array<PenButton> = [];
  if ((event.buttons & 0b10) === 0b10) {
    penButtons.push(PenButton.BARREL);
  }
  if ((event.buttons & 0b100000) === 0b100000) {
    penButtons.push(PenButton.ERASER);
  }
  return penButtons;
}

type PointerMovement = {
  readonly relativeX: number,
  readonly relativeY: number,
  readonly absoluteX: number,
  readonly absoluteY: number,
};

type PointerTrackListener<T extends PointerTrack> = (track: T) => void;

interface PointerTrackSequence<T extends PointerTrack> {
  readonly pointerId: pointerid;
  readonly pointerType: string;
  readonly primaryPointer: boolean;// 途中で変わることはない？（タッチの場合pointerIdが変わる、マウスの場合pointerIdは変わらない、ペンが複数の場合は？）
  readonly startTime: number;
  readonly duration: number;
  readonly stream: ReadableStream<T>;
  readonly movement: PointerMovement;
  readonly target: Element;
  readonly [Symbol.asyncIterator]: () => AsyncGenerator<T, void, void>;
  //readonly consume: (ontrack?: PointerTrackListener<T>) => Promise<void>;
}

type PointerTrackSequenceOptions = {
  signal?: AbortSignal,
};

class _PointerTrackSequence implements PointerTrackSequence<PointerTrack> {
  readonly #pointerId: pointerid;
  readonly #pointerType: string;
  readonly #primaryPointer: boolean;
  readonly #stream: ReadableStream<PointerTrack>;
  readonly #target: Element;
  #controller: ReadableStreamDefaultController<PointerTrack> | null = null;
  #firstTrack: PointerTrack | null = null;
  #lastTrack: PointerTrack | null = null;
  #absoluteX: number = 0;
  #absoluteY: number = 0;

  constructor(event: PointerEvent, target: Element, options: PointerTrackSequenceOptions = {}) {
    this.#pointerId = event.pointerId;
    this.#pointerType = event.pointerType;
    this.#primaryPointer = event.isPrimary;
    const start = (controller: ReadableStreamDefaultController<PointerTrack>): void => {
      if (options.signal) {
        options.signal.addEventListener("abort", () => {
          controller.close();
        }, { passive: true });
      }
      this.#controller = controller;
    };
    this.#stream = new ReadableStream({
      start,
    });
    this.#target = target;
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
  get startTime(): number {
    return this.#firstTrack ? this.#firstTrack.timestamp : Number.NaN;
  }
  get duration(): number {
    return this.#lastTrack ? (this.#lastTrack.timestamp - this.startTime) : Number.NaN;
  }
  get stream(): ReadableStream<PointerTrack> {
    return this.#stream;
  }
  get movement(): PointerMovement {
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
  async * [Symbol.asyncIterator](): AsyncGenerator<PointerTrack, void, void> {
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
  // async consume(ontrack: PointerTrackListener<PointerTrack> = () => {}): Promise<void> {
  //   for await (const track of this) {
  //     ontrack(track);
  //   }
  // }
  
  _terminate(): void {
    if (this.#controller) {
      this.#controller.close();
    }
  }
  _append(event: PointerEvent): void {
    if (this.#controller) {
      const track: PointerTrack = PointerTrack.from(event, this.#target);
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










class ViewportPointerTrackingService {
  static #instance: ViewportPointerTrackingService | null = null;
  readonly #view: Window;
  readonly #targetObservations: Set<TargetObservation>;
  readonly #aborter: AbortController;
  private constructor(view: Window) {
    this.#view = view;
    this.#targetObservations = new Set();
    this.#aborter = new AbortController();

    const options = {
      passive: true,
      signal: this.#aborter.signal,
    };
    this.#view.addEventListener("pointerenter", (event: PointerEvent) => {
      this.#handle(event);
    }, options);
    this.#view.addEventListener("pointerleave", (event: PointerEvent) => {
      this.#handle(event);
    }, options);
    this.#view.addEventListener("pointermove", (event: PointerEvent) => {
      this.#handle(event);
    }, options);
    this.#view.addEventListener("pointerdown", (event: PointerEvent) => {
      this.#handle(event);
    }, options);
    this.#view.addEventListener("pointerup", (event: PointerEvent) => {
      this.#handle(event);
    }, options);
    this.#view.addEventListener("pointercancel", (event: PointerEvent) => {
      this.#handle(event);
    }, options);
  }

  static get(view: Window): ViewportPointerTrackingService {
    if (!ViewportPointerTrackingService.#instance) {
      ViewportPointerTrackingService.#instance = new ViewportPointerTrackingService(view);
    }
    return ViewportPointerTrackingService.#instance;
  }
  dispose(): void {
    this.#targetObservations.forEach((targetObservation) => targetObservation.dispose());
    this.#targetObservations.clear();
    this.#aborter.abort();
  }
  addObservation(targetObservation: TargetObservation): void {
    this.#targetObservations.add(targetObservation);
  }
  removeHandler(targetObservation: TargetObservation): void {
    this.#targetObservations.delete(targetObservation);
  }
  #handle(event: PointerEvent): void {
    for (const targetObservation of this.#targetObservations) {
      targetObservation.xxxx1(event);
    }
  }
}

type PointerObserverCallback = (trackSequence: PointerTrackSequence<PointerTrack>) => void;

class TargetObservation {
  readonly #target: Element;
  readonly #callback: PointerObserverCallback;
  readonly #trackSequences: Map<pointerid, PointerTrackSequence<PointerTrack>>;
  constructor(target: Element, callback: PointerObserverCallback) {
    this.#target = target;
    this.#callback = callback;
    this.#trackSequences = new Map();
  }
  get target(): Element {
    return this.#target;
  }
  xxxx1(event: PointerEvent): void {
    let trackSequence: _PointerTrackSequence;

    if (event.composedPath().includes(this.#target) === true) {
      if (this.#trackSequences.has(event.pointerId) !== true) {
        trackSequence = new _PointerTrackSequence(event, this.#target);
        this.#trackSequences.set(event.pointerId, trackSequence);
        trackSequence._append(event);//TODO フィルタリングする
        this.#callback(trackSequence);
      }
      else {
        trackSequence = this.#trackSequences.get(event.pointerId) as _PointerTrackSequence;
        trackSequence._append(event);//TODO フィルタリングする
      }

      if (event.type === "pointercancel") {
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
  }
}

//TODO optionsでtouchmove,contextmenuはキャンセルする

//TODO optionsでpointercapture対応
//TODO optionsで合成イベント対応

class PointerObserver {
  readonly #callback: PointerObserverCallback;
  readonly #service: ViewportPointerTrackingService;
  constructor(callback: PointerObserverCallback, options: {}) {
    this.#callback = callback;
    this.#service = ViewportPointerTrackingService.get(window);
  }
  observe(target: Element): void {
    const observation = new TargetObservation(target, this.#callback);
    this.#service.addObservation(observation);
  }
  unobserve(target: Element): void {

  }
  disconnect(): void {

  }
}

export {
  PointerObserver,
};

