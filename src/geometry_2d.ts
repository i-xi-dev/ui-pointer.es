//TODO-2 外に出す

namespace Geometry2d {
  /**
   * A distance from origin. The "origin" depends on context.
   */
  export type Point = {
    x: number,
    y: number,
  };
  export namespace Point {
    /**
     * @param pointA 
     * @param pointB 
     * @returns A distance from `pointA` to `pointB`. In other words, the position of `pointB` relative to `pointA`.
     */
    export function distanceBetween(pointA: Point, pointB: Point): Point {
      return {
        x: (pointB.x - pointA.x),
        y: (pointB.y - pointA.y),
      };
    }
  }

  export type Area = {
    width: number,
    height: number,
  };

  /**
   * A rectangle with its sides parallel to the x-axis and y-axis.
   * This is equivalent to `(Point & Area)`. `Point` represents the top left vertex of the rectangle. 
   */
  export type Rect = {
    x: number,
    y: number,
    width: number,
    height: number,
  };
  export namespace Rect {
    export function centerOf(rect: Rect): Point {
      return {
        x: rect.x + (rect.width / 2),
        y: rect.y + (rect.height / 2),
      };
    }
  }
}

export {
  Geometry2d,
};
