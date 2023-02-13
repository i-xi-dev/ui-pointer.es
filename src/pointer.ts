import { Geometry2d, Keyboard } from "@i-xi-dev/ui-utils";

/**
 * The identifier for the pointer.
 */
type pointerid = number;

type milliseconds = number;

function _pointerModifiersOf(event: PointerEvent): Array<Pointer.Modifier> {
  const modifiers: Array<Pointer.Modifier> = [];
  if (event.altKey === true) {
    modifiers.push(Pointer.Modifier.ALT);
  }
  if (event.ctrlKey === true) {
    modifiers.push(Pointer.Modifier.CONTROL);
  }
  if (event.metaKey === true) {
    modifiers.push(Pointer.Modifier.META);
  }
  if (event.shiftKey === true) {
    modifiers.push(Pointer.Modifier.SHIFT);
  }
  return modifiers;
}

function _pointerStateOf(event: PointerEvent): Pointer.State {
  if (event.type === "pointercancel") {
    return Pointer.State.INACTIVE;
  }
  else if (event.buttons === 0) {
    return Pointer.State.HOVER;
  }
  else {
    return Pointer.State.CONTACT;
  }
}

function _mouseButtonsOf(event: PointerEvent): Array<Pointer.MouseButton> {
  const mouseButtons: Array<Pointer.MouseButton> = [];
  if ((event.buttons & 0b10) === 0b10) {
    mouseButtons.push(Pointer.MouseButton.RIGHT);
  }
  if ((event.buttons & 0b100) === 0b100) {
    mouseButtons.push(Pointer.MouseButton.MIDDLE);
  }
  if ((event.buttons & 0b1000) === 0b1000) {
    mouseButtons.push(Pointer.MouseButton.X1);
  }
  if ((event.buttons & 0b10000) === 0b10000) {
    mouseButtons.push(Pointer.MouseButton.X2);
  }
  return mouseButtons;
}

function _penButtonsOf(event: PointerEvent): Array<Pointer.PenButton> {
  const penButtons: Array<Pointer.PenButton> = [];
  if ((event.buttons & 0b10) === 0b10) {
    penButtons.push(Pointer.PenButton.BARREL);
  }
  if ((event.buttons & 0b100000) === 0b100000) {
    penButtons.push(Pointer.PenButton.ERASER);
  }
  return penButtons;
}

namespace Pointer {
  export const Type = {
    MOUSE: "mouse",
    PEN: "pen",
    TOUCH: "touch",
    UNKNOWN: "",
  } as const;

  /**
   * The pointer identification.
   */
  export type Identification = {
    readonly id: pointerid,
    readonly type: string,
    readonly isPrimary: boolean,
    readonly isTrusted: boolean,
  };
  export namespace Identification {
    export function of(event: PointerEvent): Pointer.Identification {
      return Object.freeze({
        id: event.pointerId,
        type: event.pointerType,
        isPrimary: event.isPrimary,
        isTrusted: event.isTrusted,
      });
    }
  }

  export type Geometry = {
    readonly point: Geometry2d.Point, // viewport座標
    readonly size: Geometry2d.Area,
  };
  export namespace Geometry {
    export function of(event: PointerEvent): Pointer.Geometry {
      return Object.freeze({
        point: Object.freeze({
          x: event.clientX,
          y: event.clientY,
        }),
        size: Object.freeze({
          width: event.width,
          height: event.height,
        }),
      });
    }
  }

  export const State = {
    CONTACT: "contact",
    HOVER: "hover",
    INACTIVE: "inactive",
  } as const;
  export type State = typeof State[keyof typeof State];

  export const Modifier = {
    ALT: Keyboard.Key.ALT,
    CONTROL: Keyboard.Key.CONTROL,
    META: Keyboard.Key.META,
    SHIFT: Keyboard.Key.SHIFT,
  } as const;
  export type Modifier = typeof Modifier[keyof typeof Modifier];

  export const MouseButton = {
    //LEFT: "left", stateがcontactかどうか
    MIDDLE: "middle",
    RIGHT: "right",
    X1: "x1",
    X2: "x2",
  } as const;
  export type MouseButton = typeof MouseButton[keyof typeof MouseButton];

  export const PenButton = {
    BARREL: "barrel",
    ERASER: "eraser",
  } as const;
  export type PenButton = typeof PenButton[keyof typeof PenButton];

  export interface Track {
    readonly pointer: Identification;
    readonly timestamp: number;
    readonly state: State,
    readonly modifiers: Array<Modifier>,
    readonly buttons: (Array<MouseButton> | Array<PenButton>),
    readonly geometry: Geometry;
    // pressure,tangentialPressure,tiltX,tiltY,twist,altitudeAngle,azimuthAngle
    // ,composedPath, ...
  };
  export namespace Track {
    export function from(event: PointerEvent): Track {
      const pointer = Identification.of(event);
      const state = _pointerStateOf(event);
      const modifiers = _pointerModifiersOf(event);
      let buttons: (Array<MouseButton> | Array<PenButton>);
      if (event.pointerType === Type.MOUSE) {
        buttons = _mouseButtonsOf(event);
      }
      else if (event.pointerType === Type.PEN) {
        buttons = _penButtonsOf(event);
      }
      else {
        buttons = [];
      }
      const geometry = Geometry.of(event);
      return Object.freeze({
        pointer,
        timestamp: event.timeStamp,
        state,
        modifiers,
        buttons,
        geometry,
      });
    }
  }

  export type TrackingResult = {
    pointer: Identification;
    duration: milliseconds,
    startPoint: Geometry2d.Point, // viewport座標
    endPoint: Geometry2d.Point, // viewport座標
    relativeX: number, // 終点の始点からの相対位置
    relativeY: number, // 終点の始点からの相対位置
    movementX: number, // 絶対移動量
    movementY: number, // 絶対移動量
  };

  export class Tracking {
    readonly #pointer: Identification;
    readonly #trackStream: ReadableStream<Track>;
    #controller: ReadableStreamDefaultController<Track> | null = null;
    readonly #task: Promise<TrackingResult>;
    #onTrackingComplete: (value: TrackingResult) => void = (): void => undefined;
    #onTrackingFail: (reason?: any) => void = (): void => undefined;

    constructor(pointer: Identification, signal: AbortSignal) {
      this.#pointer = pointer;
      const start = (controller: ReadableStreamDefaultController<Track>) => {
        signal.addEventListener("abort", () => {
          controller.close();
        }, { passive: true });
        this.#controller = controller;
      };
      this.#trackStream = new ReadableStream({
        start,
      });
      this.#task = new Promise((resolve, reject) => {
        this.#onTrackingComplete = resolve;
        this.#onTrackingFail = reject;
      });
    }

    get pointer(): Identification {
      return this.#pointer;
    }

    // get tracks(): ReadableStream<Track> {
    //   return this.#trackStream;
    // }

    async result(): Promise<TrackingResult> {
      if (this.#trackStream.locked !== true) {
        for await (const track of this.tracks()) {
        }
      }
      return this.#task;
    }

    // append(event: PointerEvent): void {
    // }

    append(track: Track): void {
      if (!!this.#controller) {
        this.#controller.enqueue(track);
      }
    }

    terminate(): void {
      if (!!this.#controller) {
        this.#controller.close();
      }
    }

    async * tracks(): AsyncGenerator<Track, void, void> {
      try {
        let movementX: number = 0;
        let movementY: number = 0;
        let firstTrack: Track | undefined = undefined;
        let lastTrack: Track | undefined = undefined;
        for await (const track of this.#tracks()) {
          if (!!lastTrack) {
            movementX = movementX + Math.abs(lastTrack.geometry.point.x - track.geometry.point.x);
            movementY = movementY + Math.abs(lastTrack.geometry.point.y - track.geometry.point.y);
          }
          if (!firstTrack) {
            firstTrack = track;
          }
          lastTrack = track;
          yield track;
        }

        if (!firstTrack || !lastTrack) {
          throw new Error("TODO");
        }

        let duration: milliseconds = 0;
        let relativeX: number = 0;
        let relativeY: number = 0;

        duration = (lastTrack.timestamp - firstTrack.timestamp);
        const firstTrackPoint = firstTrack.geometry.point;
        const lastTrackPoint = lastTrack.geometry.point;
        const startPoint = Object.freeze({
          x: firstTrackPoint.x,
          y: firstTrackPoint.y,
        });
        const endPoint = Object.freeze({
          x: lastTrackPoint.x,
          y: lastTrackPoint.y,
        });

        relativeX = (endPoint.x - startPoint.x);
        relativeY = (endPoint.y - startPoint.y);

        this.#onTrackingComplete(Object.freeze({
          pointer: firstTrack.pointer,
          duration,
          startPoint,
          endPoint,
          relativeX,
          relativeY,
          movementX,
          movementY,
        }));
        return;
      }
      catch (exception) {
        this.#onTrackingFail(exception);
      }
    }

    // ReadableStream#[Symbol.asyncIterator]がブラウザでなかなか実装されないので…
    async * #tracks(): AsyncGenerator<Track, void, void> {
      const streamReader = this.#trackStream.getReader();
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
  }

  //XXX ターゲットを問わない（ElementかWindow）Trackerを追加（pointerenterで追跡開始）
}

export {
  type pointerid,
  Pointer,
};
