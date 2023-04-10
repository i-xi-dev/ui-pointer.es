/**
 * Represents a pointer device.
 * 
 * This is an immutable object.
 */
interface PointerDevice {
  /**
   * Indicates the {@link https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pointerType | `pointerType`} property of the `PointerEvent`.
   */
  readonly type: string;

  //XXX sourceCapabilities
}

/**
 * The pointer device.
 */
namespace PointerDevice {
  /**
   * The type of the pointer device.
   */
  export const Type = {
    MOUSE: "mouse",
    PEN: "pen",
    TOUCH: "touch",
  } as const;
}

type _PointerDeviceSource = {
  pointerType: string,
};

function _pointerDeviceOf(source: _PointerDeviceSource): PointerDevice {
  return Object.freeze({
    type: source.pointerType,
  });
}

export {
  type _PointerDeviceSource,
  _pointerDeviceOf,
  PointerDevice,
};
