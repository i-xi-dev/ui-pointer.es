//TODO-2 外に出す

import { Geometry2d } from "./geometry_2d";

type BoundingBox = Geometry2d.Rect/* & {

}*/;
namespace BoundingBox {
  /**
   * The point with the origin at the top left corner of the bounding box.
   */
  export type Inset = Geometry2d.Point;

  export function of(element: Element): Readonly<BoundingBox> {
    if ((element instanceof Element) !== true) {
      throw new TypeError("element");
    }
    if (element.isConnected !== true) {
      throw new Error("invalid state: element is not contained in document");
    }
    //XXX checkVisibility
    //XXX その他取得不能条件

    const view: Window | null = element.ownerDocument.defaultView;
    if (!view) {
      throw new Error("invalid state: element is not contained in document with the view");
    }

    const targetRect = element.getBoundingClientRect();

    return Object.freeze({
      x: targetRect.left,
      y: targetRect.top,
      width: targetRect.width,
      height: targetRect.height,
    });
  }
}

Object.freeze(BoundingBox);

export {
  BoundingBox,
};
