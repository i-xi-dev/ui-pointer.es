
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

export {
  PointerProperties,
};
