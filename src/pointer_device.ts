/**
 * The pointer device.
 */
interface PointerDevice {
  /**
   * Indicates the {@link PointerDevice.Type | pointer device type}.
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
   * @see {@link https://www.w3.org/TR/pointerevents2/#dom-pointerevent-pointertype | [Pointer Events Level 2] pointerType}
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
