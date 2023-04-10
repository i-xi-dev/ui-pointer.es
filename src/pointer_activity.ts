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

//[$119] FirefoxでPointerEventを保持していると、いつのまにかoffsetX,Yが0に更新される為
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
  readonly raw: PointerEvent;//[$141] ink用に追加

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
  let targetX = Number.NaN;
  let targetY = Number.NaN;
  if (dispatcher) {
    targetX = source.offsetX;
    targetY = source.offsetY;
  }
  if (!!dispatcher && (target !== dispatcher)) {
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
    captured: target.hasPointerCapture(source.pointerId),
    source: source.raw,
  });
}

/**
 * Represents a pointer activity.
 */
namespace PointerActivity {
  /**
   * Represents a pointer motion record.
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
    readonly captured: boolean;

    //XXX readonly context: {
    //   dispatcher: Element,
    //   composedPath
    // };

    /**
     * References the source {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent | `PointerEvent`} of `PointerActivity.Trace`.
     */
    readonly source: PointerEvent;
  }

  /**
   * Represents a pointer activity result.
   */
  export interface Result {
    /**
     * Indicates the relative distance in x-coordinates from the start point of the `PointerActivity` to the end point of the `PointerActivity`.
     */
    readonly movementX: number;

    /**
     * Indicates the relative distance in y-coordinates from the start point of the `PointerActivity` to the end point of the `PointerActivity`.
     */
    readonly movementY: number;

    /**
     * Indicates the track length from the start point of the `PointerActivity` to the end point of the `PointerActivity`.
     */
    readonly track: number;
  }
}

/**
 * Represents a pointer activity.
 */
interface PointerActivity {
  /**
   * Indicates the {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pointerId | `pointerId`} property of the `PointerEvent`.
   */
  readonly pointerId: pointerid;

  /**
   * Indicates the `PointerDevice`.
   */
  readonly device: PointerDevice;

  /**
   * Indicates the {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/isPrimary | `isPrimary`} property of the `PointerEvent`.
   */
  readonly isPrimary: boolean;// 途中で変わることはない（複数タッチしてプライマリを離した場合、タッチを全部離すまでプライマリは存在しなくなる。その状態でタッチを増やしてもプライマリは無い）

  /**
   * Indicates the monitoring target element of the {@link PointerObserver | `PointerObserver`}.
   */
  readonly target: Element | null;

  /**
   * Indicates the `timeStamp` property of this {@link PointerActivity.startTrace | `startTrace`} record.
   */
  readonly startTime: timestamp;


  readonly duration: milliseconds;


  readonly [Symbol.asyncIterator]: () => AsyncGenerator<PointerActivity.Trace, void, void>;

  /**
   * The `Promise` that resolves to a `PointerActivity.Result`.
   */
  readonly result: Promise<PointerActivity.Result>;

  //XXX readonly traceStream: ReadableStream<PointerActivity.Trace>;
  //XXX readonly startViewportOffset: Geometry2d.Point | null;
  //XXX readonly startTargetOffset: Geometry2d.Point | null;

  //XXX readonly current


  readonly inProgress: boolean;


  readonly beforeTrace: PointerActivity.Trace | null;

  /**
   * Indicates the start `PointerActivity.Trace` record of the `PointerActivity`.
   */
  readonly startTrace: PointerActivity.Trace | null;

  //XXX readonly lastTrace: PointerActivity.Trace | null; その時点の最新trace 終了後はendTraceと同じ


  readonly endTrace: PointerActivity.Trace | null;

  //XXX readonly watchedModifiers: Array<Pointer.Modifier>;
  //XXX getPredictedTrace()
}

export {
  _pointerActivityTraceFrom,
  _pointerActivityTraceSourceFrom,
  _PointerActivityTraceSource,
  PointerActivity,
};
