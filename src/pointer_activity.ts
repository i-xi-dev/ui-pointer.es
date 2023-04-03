import { PointerProperties } from "./pointer_properties";

type timestamp = number;

//TODO 改名
namespace PointerActivity2 {
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
    readonly buttons: Array<string>,
    //TODO readonly modifiers: Array<Pointer.Modifier>;// タッチ間で共有だが現在値なのでここに持たせる //XXX buttonなどもふくめる
    readonly captured: boolean;// 「targetに」captureされているか否か
    //XXX readonly context: {
    //   dispatcher: Element,
    //   composedPath
    // };
    readonly source: Trace.Source;
    //prevTrace: Trace; //XXX リンク持たせるならどこかでリンク切らないと
  }

  export namespace Trace {
    //[$119] FirefoxでPointerEventを保持していると、いつのまにかoffsetX,Yが0に更新される為
    //       必要な項目だけコピーしたオブジェクトを保持する
    export interface Source extends PointerProperties.Source {
      buttons: number;
      clientX: number;
      clientY: number;
      composedPath: Array<Element>;
      currentTarget: Element | null;
      isPrimary: boolean;
      isTrusted: boolean;
      offsetX: number;
      offsetY: number;
      pointerId: number;
      pointerType: string;
      target: Element;
      timeStamp: number;
      type: string;
  
      // getCoalescedEvents() → 不要（Sourceを複数作成）
      // getModifierState() //XXX
      // getPredictedEvents() //XXX
      // preventDefault() → 不要
      // stopImmediatePropagation() → 不要
      // stopPropagation() → 不要
    }
  
    export namespace Source {
      export function from(event: PointerEvent): Source {
        return {
          // altKey: event.altKey,
          // bubbles: event.bubbles,
          // button: event.button,
          buttons: event.buttons,
          // cancelable: event.cancelable,
          clientX: event.clientX,
          clientY: event.clientY,
          // composed: event.composed,
          composedPath: event.composedPath() as Array<Element>,
          // ctrlKey: event.ctrlKey,
          currentTarget: event.currentTarget as (Element | null),
          // defaultPrevented: event.defaultPrevented,
          // detail: event.detail,
          // eventPhase: event.eventPhase,
          height: event.height,
          isPrimary: event.isPrimary,
          isTrusted: event.isTrusted,
          // metaKey: event.metaKey,
          // movementX: event.movementX,
          // movementY: event.movementY,
          offsetX: event.offsetX,
          offsetY: event.offsetY,
          // pageX: event.pageX,
          // pageY: event.pageY,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          pressure: event.pressure,
          // relatedTarget: event.relatedTarget as (Element | null),
          // screenX: event.screenX,
          // screenY: event.screenY,
          // shiftKey: event.shiftKey,
          tangentialPressure: event.tangentialPressure,
          target: event.target as Element,
          tiltX: event.tiltX,
          tiltY: event.tiltY,
          timeStamp: event.timeStamp,
          twist: event.twist,
          type: event.type,
          // view: event.view as Window,
          width: event.width,
        };
      }
    }
  }
}

export {
  PointerActivity2,
};
