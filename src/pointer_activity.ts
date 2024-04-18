import { Geometry2d } from "@i-xi-dev/ui-utils";
import { type pointerid } from "./pointer";
import { PointerDevice } from "./pointer_device";
import {
  type _PointerStateSource,
  _pointerIsInContact,
  _pointerStateOf,
  PointerState,
} from "./pointer_state";

type timestamp = number;
type milliseconds = number;

// [$119] FirefoxでPointerEventを保持していると、いつのまにかoffsetX,Yが0に更新される為
//       必要な項目だけコピーしたオブジェクトを保持する
interface _PointerActivityTraceSource extends _PointerStateSource {
  readonly clientX: number;
  readonly clientY: number;
  readonly composedPath: Array<Element>;
  readonly isPrimary: boolean;
  readonly isTrusted: boolean;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly target: Element;
  readonly timeStamp: number;
  readonly type: string;

  prev: _PointerActivityTraceSource | null;
  readonly raw: PointerEvent;// [$141] ink用に追加

  // getCoalescedEvents() → 不要（Sourceを複数作成）
  // getModifierState() //XXX
  // getPredictedEvents() //XXX
}

function _pointerActivityTraceSourceFrom(event: PointerEvent): _PointerActivityTraceSource {
  return {
    buttons: event.buttons,
    clientX: event.clientX,
    clientY: event.clientY,
    composedPath: event.composedPath() as Array<Element>,
    height: event.height,
    isPrimary: event.isPrimary,
    isTrusted: event.isTrusted,
    offsetX: event.offsetX,
    offsetY: event.offsetY,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    pressure: event.pressure,
    tangentialPressure: event.tangentialPressure,
    target: event.target as Element,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    timeStamp: event.timeStamp,
    twist: event.twist,
    type: event.type,
    width: event.width,
    prev: null,
    raw: event,
  };
}

function _pointerActivityTraceFrom(source: _PointerActivityTraceSource, target: Element, prevTrace: PointerActivity.Trace | null): PointerActivity.Trace {
  const dispatcher = (source.target instanceof Element) ? source.target : null;
  if (!dispatcher) {
    // ありえないはず
    throw new Error("PointerEvent.target is falsy");
  }

  let targetX = source.offsetX;
  let targetY = source.offsetY;
  if (target !== dispatcher) {
    const targetBoundingBox = target.getBoundingClientRect();
    const dispatcherBoundingBox = dispatcher.getBoundingClientRect();
    const { x, y } = Geometry2d.Point.distanceBetween(targetBoundingBox, dispatcherBoundingBox);
    targetX = targetX + x;
    targetY = targetY + y;
  }

  const viewportX = source.clientX;
  const viewportY = source.clientY;

  let movementX: number = 0;
  let movementY: number = 0;
  if (prevTrace) {
    movementX = (viewportX - prevTrace.viewportX);
    movementY = (viewportY - prevTrace.viewportY);
  }

  // const modifiers: Array<Pointer.Modifier> = [...options.modifiersToWatch].filter((modifier) => event.getModifierState(modifier) === true);

  return Object.freeze({
    timeStamp: source.timeStamp,
    viewportX,
    viewportY,
    targetX,
    targetY,
    movementX,
    movementY,
    inContact: _pointerIsInContact(source),
    properties: _pointerStateOf(source),
    isCaptured: target.hasPointerCapture(source.pointerId),
    source: source.raw,
    directlyOver: dispatcher,
  });
}

/**
 * Represents a pointer activity.
 */
namespace PointerActivity {
  /**
   * Represents a `PointerEvent`.
   * 
   * This is an immutable object.
   */
  export interface Trace {
    /**
     * Indicates the {@link https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp | `timeStamp`} property of the `PointerEvent`.
     */
    readonly timeStamp: timestamp;

    /**
     * Indicates the {@link https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/clientX | `clientX`} property of the `PointerEvent`.
     */
    readonly viewportX: number;

    /**
     * Indicates the {@link https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/clientY | `clientY`} property of the `PointerEvent`.
     */
    readonly viewportY: number;

    /**
     * Indicates the x-coordinate in the bounding box (not a padding-box) of the {@link PointerActivity.target | target element} of the `PointerActivity`.
     */
    readonly targetX: number;

    /**
     * Indicates the y-coordinate in the bounding box (not a padding-box) of the {@link PointerActivity.target | target element} of the `PointerActivity`.
     */
    readonly targetY: number;

    /**
     * Indicates the difference from x-coordinate of the previous `PointerActivity.Trace`.
     */
    readonly movementX: number;

    /**
     * Indicates the difference from y-coordinate of the previous `PointerActivity.Trace`.
     */
    readonly movementY: number;

    /**
     * Indicates whether any of the following are true.
     * 
     * - The left mouse button is pressed.
     * - The pen is in contact.
     * - The touch is in contact.
     */
    readonly inContact: boolean;

    /**
     * Indicates the `PointerState` properties.
     */
    readonly properties: PointerState;

    /**
     * Indicates the {@link PointerActivity.pointerId | pointer id} of the `PointerActivity` is pointer-captured by the {@link PointerActivity.target | target element} of the `PointerActivity`.
     */
    readonly isCaptured: boolean;

    /**
     * References the source {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent | `PointerEvent`} of `PointerActivity.Trace`.
     */
    readonly source: PointerEvent;

    /**
     * References the `Element` that fired the source `PointerEvent`.
     */
    readonly directlyOver: Element;
  }

  /**
   * Represents a pointer activity result.
   * 
   * This is an immutable object.
   */
  export interface Result {
    /**
     * Indicates the relative distance from the start point of the `PointerActivity` to the end point of the `PointerActivity`.
     */
    readonly movement: {
      x: number,
      y: number,
      length: number,
      angle: number,
    };

    /**
     * Indicates the track length from the start point of the `PointerActivity` to the end point of the `PointerActivity`.
     */
    readonly track: number;
  }
}

/**
 * Represents a pointer activity.
 * 
 * An object that represents a sequence of `PointerEvent`s with the same `pointerId` from after `pointerenter` to `ponterleave`.
 */
interface PointerActivity {
  /**
   * Indicates the {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pointerId | `pointerId`} property of the `PointerEvent`.
   * 
   * This value is never changed.
   */
  readonly pointerId: pointerid;

  /**
   * Indicates the `PointerDevice`.
   * 
   * This value is never changed.
   */
  readonly device: PointerDevice;

  /**
   * Indicates the {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/isPrimary | `isPrimary`} property of the `PointerEvent`.
   * 
   * This value is never changed.
   */
  readonly isPrimary: boolean;

  /**
   * Indicates the monitoring target element of the {@link PointerActivityObserver | `PointerActivityObserver`}.
   * 
   * This value is never changed.
   */
  readonly target: Element | null;

  /**
   * Indicates the `timeStamp` property of this {@link PointerActivity.startTrace | `startTrace`} record.
   * 
   * This value is never changed.
   */
  readonly startTime: timestamp;

  /**
   * Indicates the elapsed time from {@link PointerActivity.startTrace | `startTrace`} record to latest `PointerActivity.Trace` record.
   *
   * This value is `0` when the instance is created; it keeps increasing while tracking the pointer. When the instance {@link PointerActivity.inProgress | `inProgress`} is set to `false`, this value is not changed thereafter.
   */
  readonly duration: milliseconds;

  readonly movement: {
    x: number,
    y: number,
    length: number,
    angle: number,
  };

  readonly track: number;

  /**
   * Returns the AsyncGenerator of `PointerActivity.Trace` records.
   */
  [Symbol.asyncIterator](): AsyncGenerator<PointerActivity.Trace, void, void>;

  /**
   * The `Promise` that resolves to a `PointerActivity.Result`.
   */
  readonly result: Promise<PointerActivity.Result>;

  // XXX readonly traceStream: ReadableStream<PointerActivity.Trace>;
  // XXX readonly startViewportOffset: Geometry2d.Point | null;
  // XXX readonly startTargetOffset: Geometry2d.Point | null;

  // XXX readonly current

  /**
   * Indicates whether that no {@link PointerActivity.endTrace | `endTrace`} record has been recorded.
   * 
   * The value is `true` when the instance is created. Never changed after being changed to `false`.
   */
  readonly inProgress: boolean;

  /**
   * Indicates the `PointerActivity.Trace` record before the {@link PointerActivity.startTrace | `startTrace`} record.
   * Set if the pointer is `pointerenter` from outside the boundaries of {@link PointerActivity.target | target element}. Otherwise, `null`.
   * 
   * This value is never changed.
   */
  readonly beforeTrace: PointerActivity.Trace | null;

  /**
   * Indicates the start `PointerActivity.Trace` record of the `PointerActivity`.
   * 
   * This value is never changed.
   */
  readonly startTrace: PointerActivity.Trace | null;

  // XXX readonly lastTrace: PointerActivity.Trace | null; その時点の最新trace 終了後はendTraceと同じ

  /**
   * Indicates the end `PointerActivity.Trace` record of the `PointerActivity`.
   * 
   * This value is `null` when the instance is created. When the instance {@link PointerActivity.inProgress | `inProgress`} is set to `false`, the `PointerActivity.Trace` is set to this value and this value is not changed thereafter.
   */
  readonly endTrace: PointerActivity.Trace | null;

  // XXX readonly watchedModifiers: Array<Pointer.Modifier>;
  // XXX getPredictedTrace()
}

export {
  _pointerActivityTraceFrom,
  _pointerActivityTraceSourceFrom,
  _PointerActivityTraceSource,
  PointerActivity,
};
