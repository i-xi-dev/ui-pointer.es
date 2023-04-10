export { PointerDevice } from "./pointer_device";
export { PointerState } from "./pointer_state";
export { PointerActivity } from "./pointer_activity";
export { PointerObserver } from "./pointer_observer";

//TODO readmeに記載↓
// - ターゲットのboundingBox外に位置する子孫の扱い
//   Trackingは開始する仕様とする
//   - ターゲットの子孫が何らかのCSS(position:absoluteなど)で、ターゲットのboundingBoxの外にある時
//     - その子孫でPointerEventが起きれば、当然ターゲットに伝播する
//     - このとき、PointerEventの座標でelementsFromPoint()したとき、ターゲットはヒットしない
// - 前提条件として
//   - windowとtargetでlistenしているので、到達前にpointereventをキャンセルされたら検知できなくなる
//   - touch-actionはブロックに適用
//   - display算出値がinlineの場合、正常動作しない（座標系がブラウザによって異なる）
//     以下の場合もおそらく問題ある
//     - ボックスが0: displayがnone,contents,...
//     - ボックスが2以上: column-break等のbreak (regionは廃止され、screenでpage-breakするブラウザはなくなったので、column-breakだけか) 
//   - 非trustedなPointerEventは無条件で無視している
//   - 異なるpointerTypeのポインターを同時操作できるかはブラウザに依存
// readmeに記載↑

// 検討↓
// - タッチの総体やwheelも扱う版
//     wheelでスクロールしたときブラウザによってpointerenter,pointerleaveが発火しない
