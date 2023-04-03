
type pointerid = number;

interface PointerIdentification {
  /**
   * The identifier for the pointer.
   * @see {@link https://www.w3.org/TR/pointerevents2/#dom-pointerevent-pointerid | [Pointer Events Level 2] pointerId}
   */
  readonly id: pointerid;

  /**
   * The pointer device type.
   * @see {@link https://www.w3.org/TR/pointerevents2/#dom-pointerevent-pointertype | [Pointer Events Level 2] pointerType}
   */
  readonly type: string;

  readonly isPrimary: boolean;// 途中で変わることはない（複数タッチしてプライマリを離した場合、タッチを全部離すまでプライマリは存在しなくなる。その状態でタッチを増やしてもプライマリは無い）

  //XXX sourceCapabilities
}

namespace PointerIdentification {
  export type Source = {
    isPrimary: boolean,
    pointerId: number,
    pointerType: string,
  };

  export function from(event: Source): PointerIdentification {
    return Object.freeze({
      id: event.pointerId,
      type: event.pointerType,
      isPrimary: event.isPrimary,
    });
  }
}

export {
  type pointerid,
  PointerIdentification,
};
