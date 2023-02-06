//TODO 外に出す

namespace GenericGeometry {

  export type PointOffset = {
    readonly left: number,
    readonly top: number,
    // inlineStart
    // blockStart
  };

  export type RectSize = {
    readonly width: number,
    readonly height: number,
    // inlineSize
    // blockSize
  };

  export type RectOffset = {
    readonly left: number,
    readonly top: number,
    readonly right: number,
    readonly bottom: number,
    // inlineStart
    // inlineEnd
    // blockStart
    // blockEnd
  };

}

export {
  type GenericGeometry,
};
