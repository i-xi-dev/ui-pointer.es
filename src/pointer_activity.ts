import { PointerDevice } from "./pointer_device";
import { PointerProperties } from "./pointer_properties";

type pointerid = number;
type timestamp = number;
type milliseconds = number;

namespace PointerActivity {
  export interface Trace {
    readonly timeStamp: timestamp;
    readonly viewportX: number, // from viewport left
    readonly viewportY: number, // from viewport top
    readonly targetX: number,// offset from target bounding box left
    readonly targetY: number,// offset from target bounding box top
    readonly movementX: number;// 直前のTraceからの相対位置
    readonly movementY: number;// 直前のTraceからの相対位置
    readonly inContact: boolean;// pointerがactiveかつ接触があるか否か
    readonly properties: PointerProperties,
    readonly buttons: Array<string>,//XXX Record<string, boolean>にする？
    //TODO readonly modifiers: Array<Pointer.Modifier>;//XXX Record<string, boolean>にする？ // タッチ間で共有だが現在値なのでここに持たせる //XXX buttonなどもふくめる
    readonly captured: boolean;// 「targetに」captureされているか否か
    //XXX readonly context: {
    //   dispatcher: Element,
    //   composedPath
    // };
    readonly source: Trace.Source;
  }

  export namespace Trace {
    //[$119] FirefoxでPointerEventを保持していると、いつのまにかoffsetX,Yが0に更新される為
    //       必要な項目だけコピーしたオブジェクトを保持する
    export interface Source extends PointerProperties.Source {
      readonly buttons: number;
      readonly clientX: number;
      readonly clientY: number;
      readonly composedPath: Array<Element>;
      readonly currentTarget: Element | null;
      readonly isPrimary: boolean;
      readonly isTrusted: boolean;
      readonly offsetX: number;
      readonly offsetY: number;
      readonly pointerId: number;
      readonly pointerType: string;
      readonly target: Element;
      readonly timeStamp: number;
      readonly type: string;

      prev: Source | null;

      // getCoalescedEvents() → 不要（Sourceを複数作成）
      // getModifierState() //XXX
      // getPredictedEvents() //XXX
    }

    export namespace Source {
      export function from(event: PointerEvent): Source {
        return {
          buttons: event.buttons,
          clientX: event.clientX,
          clientY: event.clientY,
          composedPath: event.composedPath() as Array<Element>,
          currentTarget: event.currentTarget as (Element | null),
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
        };
      }
    }
  }

  export interface Result {
    readonly movementX: number;// PointerActivity始点からの相対位置
    readonly movementY: number;// PointerActivity始点からの相対位置
    readonly track: number;// 軌跡の近似値
  }
}

interface PointerActivity {
  /**
   * The identifier for the pointer.
   * @see {@link https://www.w3.org/TR/pointerevents2/#dom-pointerevent-pointerid | [Pointer Events Level 2] pointerId}
   */
  readonly pointerId: pointerid;
  readonly device: PointerDevice;
  readonly isPrimary: boolean;// 途中で変わることはない（複数タッチしてプライマリを離した場合、タッチを全部離すまでプライマリは存在しなくなる。その状態でタッチを増やしてもプライマリは無い）
  readonly target: Element | null;
  readonly startTime: timestamp;
  readonly duration: milliseconds;
  //XXX readonly traceStream: ReadableStream<PointerActivity.Trace>;
  //XXX readonly startViewportOffset: Geometry2d.Point | null;
  //XXX readonly startTargetOffset: Geometry2d.Point | null;
  readonly result: Promise<PointerActivity.Result>;

  //XXX readonly current

  readonly [Symbol.asyncIterator]: () => AsyncGenerator<PointerActivity.Trace, void, void>;
  readonly inProgress: boolean;
  readonly beforeTrace: PointerActivity.Trace | null;
  readonly startTrace: PointerActivity.Trace | null;
  //XXX readonly lastTrace: PointerActivity.Trace | null; その時点の最新trace 終了後はendTraceと同じ
  readonly endTrace: PointerActivity.Trace | null;
  //XXX readonly watchedModifiers: Array<Pointer.Modifier>;
  //XXX getPredictedTrace()
}

export {
  PointerActivity,
};
