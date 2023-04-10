/**
 * Represents a pointer device.
 */
interface PointerDevice {
  /**
   * Indicates the {@link https://www.w3.org/TR/pointerevents2/#dom-pointerevent-pointertype | PointerEvent#pointerType}.
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
