import { PointerProperties } from "./pointer_properties";

type timestamp = number;

//TODO 改名
interface PointerTrace2 {
  readonly timeStamp: timestamp;
  readonly viewportX: number, // from viewport left
  readonly viewportY: number, // from viewport top
  readonly targetX: number,// offset from target bounding box left
  readonly targetY: number,// offset from target bounding box top
  readonly movementX: number;// 直前のPointerTraceからの相対位置
  readonly movementY: number;// 直前のPointerTraceからの相対位置
  readonly inContact: boolean;// pointerがactiveかつ接触があるか否か
  readonly properties: PointerProperties,
  readonly buttons: Array<string>,
  //TODO readonly modifiers: Array<Pointer.Modifier>;// タッチ間で共有だが現在値なのでここに持たせる //XXX buttonなどもふくめる
  readonly captured: boolean;// 「targetに」captureされているか否か
  //XXX readonly context: {
  //   dispatcher: Element,
  //   composedPath
  // };
  readonly source: PointerTrace2.Source;
  //prevTrace: PointerTrace2; //XXX リンク持たせるならどこかでリンク切らないと
}

namespace PointerTrace2 {
  //[$119] FirefoxでPointerEventを保持していると、いつのまにかoffsetX,Yが0に更新される為
  //       必要な項目だけコピーしたオブジェクトを保持する
  export interface Source {
    // altKey: boolean;
    // bubbles: boolean;
    // button: number;
    buttons: number;
    // cancelable: boolean;
    clientX: number;
    clientY: number;
    // composed: boolean;
    composedPath: Array<Element>;
    // ctrlKey: boolean;
    currentTarget: Element | null;
    // defaultPrevented: boolean;
    // detail: number;
    // eventPhase: number;
    height: number;
    isPrimary: boolean;
    isTrusted: boolean;
    // metaKey: boolean;
    // movementX: number;
    // movementY: number;
    offsetX: number;
    offsetY: number;
    // pageX: number;
    // pageY: number;
    pointerId: number;
    pointerType: string;
    pressure: number;
    // relatedTarget: Element | null;
    // screenX: number;
    // screenY: number;
    // shiftKey: boolean;
    // sourceCapabilities
    tangentialPressure: number;
    target: Element;
    tiltX: number;
    tiltY: number;
    timeStamp: number;
    twist: number;
    type: string;
    // view: Window;
    width: number;

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

export {
  PointerTrace2,
};
