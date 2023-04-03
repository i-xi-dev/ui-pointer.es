
interface PointerProperties {
  readonly pressure: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly tangentialPressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly twist: number;
  //XXX altitudeAngle 未実装のブラウザが多い
  //XXX azimuthAngle 未実装のブラウザが多い
}

namespace PointerProperties {
  export type Source = {
    height: number,
    pressure: number,
    tangentialPressure: number,
    tiltX: number,
    tiltY: number,
    twist: number,
    width: number,
  };

  export function of(source: Source): PointerProperties {
    return Object.freeze({
      pressure: source.pressure,
      radiusX: source.width / 2,
      radiusY: source.height / 2,
      tangentialPressure: source.tangentialPressure,
      tiltX: source.tiltX,
      tiltY: source.tiltY,
      twist: source.twist,
    });
  }
}

export {
  PointerProperties,
};
