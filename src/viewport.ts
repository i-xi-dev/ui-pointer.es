//TODO-2 外に出す

import { Geometry2d } from "./geometry_2d";

type Viewport = Geometry2d.Rect/* & {
  scrollX: number, rtlの場合Window.scrollXをそのまま取ると、スクロールしてない状態で0、左にスクロールすると負の値になる
  scrollY: number,
}*/;
namespace Viewport {
  /**
   * The point with the origin at the top left corner of the viewport.
   */
  export type Inset = Geometry2d.Point;

  export function from(view: Window): Readonly<Viewport> {
    if ((view instanceof Window) !== true) {
      throw new TypeError("view");
    }

    return Object.freeze({
      x: 0,
      y: 0,
      width: view.innerWidth,
      height: view.innerHeight,
      //scrollX: view.scrollX,
      //scrollY: view.scrollY,
    });
  }
}

export {
  Viewport,
};
