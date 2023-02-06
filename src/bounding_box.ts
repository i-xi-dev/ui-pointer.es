//TODO 外に出す

import { GenericGeometry } from "./generic_geometry";

namespace BoundingBox {
  // coord from left and top edge of bounding box
  export type Inset = GenericGeometry.PointOffset;

  export type Geometry = GenericGeometry.RectSize & {
    readonly offset: GenericGeometry.RectOffset, // offset from `origin` bounding box. if `origin` is not specified, offset from layout viewport
  };

  export function geometryOf(target: Element, origin?: Element): Readonly<Geometry> {
    if ((target instanceof Element) !== true) {
      throw new TypeError("target");
    }
    if (target.isConnected !== true) {
      throw new Error("invalid state: target is not contained in document");
    }
    //XXX checkVisibility
    //XXX その他取得不能条件

    const view: Window | null = target.ownerDocument.defaultView;
    if (!view) {
      throw new Error("invalid state: target is not contained in document with the view");
    }

    if (!!origin) {
      if ((origin instanceof Element) !== true) {
        throw new TypeError("origin");
      }
      if (origin.isConnected !== true) {
        throw new Error("invalid state: origin is not contained in document");
      }
      //XXX checkVisibility
      //XXX その他取得不能条件

      if (view !== origin.ownerDocument.defaultView) {
        throw new Error("invalid state: elements are contained in another documents");
      }
    }

    const targetRect = target.getBoundingClientRect();
    if (!!origin) {
      const originRect = origin.getBoundingClientRect();
      return Object.freeze({
        width: targetRect.width,
        height: targetRect.height,
        offset: Object.freeze({
          left: targetRect.left - originRect.left,
          right: originRect.right - targetRect.right,
          top: targetRect.top - originRect.top,
          bottom: originRect.bottom - targetRect.bottom,
        }),
      });
    }

    return Object.freeze({
      width: targetRect.width,
      height: targetRect.height,
      offset: Object.freeze({
        left: targetRect.left,
        right: view.innerWidth - targetRect.right,
        top: targetRect.top,
        bottom: view.innerHeight - targetRect.bottom,
      }),
    });
  }
}

Object.freeze(BoundingBox);

export {
  BoundingBox,
};
