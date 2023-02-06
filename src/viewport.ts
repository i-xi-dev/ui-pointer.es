//TODO 外に出す

import { GenericGeometry } from "./generic_geometry";

namespace Viewport {
  // coord from left and top edge of viewport
  export type Inset = GenericGeometry.PointOffset;

  export type Geometry = GenericGeometry.RectSize & {
    //scrollLeft: number,//XXX rtlの場合の算出法が違う
    //scrollTop: number,//XXX 
  };

  export function geometryOf(view: Window): Geometry {
    if ((view instanceof Window) !== true) {
      throw new TypeError("view");
    }

    return {
      width: view.innerWidth,
      height: view.innerHeight,
      //scrollLeft: view.scrollX,
      //scrollTop: view.scrollY,
    };
  }
}

export {
  Viewport,
};
