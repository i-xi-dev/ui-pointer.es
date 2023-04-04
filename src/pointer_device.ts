
interface PointerDevice {
  readonly type: string;
  //XXX sourceCapabilities
}

namespace PointerDevice {
  /**
   * The type of the pointer device.
   * @see {@link https://www.w3.org/TR/pointerevents2/#dom-pointerevent-pointertype | [Pointer Events Level 2] pointerType}
   */
  export const Type = {
    MOUSE: "mouse",
    PEN: "pen",
    TOUCH: "touch",
    UNKNOWN: "",
  } as const;

  export type Source = {
    pointerType: string,
  };

  export function of(source: Source): PointerDevice {
    return Object.freeze({
      type: source.pointerType,
    });
  }
}

export {
  PointerDevice,
};
