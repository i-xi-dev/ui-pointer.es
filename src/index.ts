export { type PointerActivity, type PointerTrace, Pointer } from "./pointer";
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
//   - その他box数が1ではない場合
//     - 0: displayがnone,contents,...
//     - 1以上: displayがinline,...
//     - 通常は1だが2以上になることがある: page-break以外のbreak (regionは廃止されたのでcolumnだけか？) //TODO これは重大な問題な気がしてきた targetX/Yは一旦消すか？
//   - 非trustedなPointerEventは無条件で無視している
//   - 異なるpointerTypeのポインターを同時操作できるかはブラウザに依存

// readmeに記載↑

// 検討↓

// - タッチの総体やwheelも扱う版
//     wheelでスクロールしたときブラウザによってpointerenter,pointerleaveが発火しない
