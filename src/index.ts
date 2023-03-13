
export { Pointer } from "./pointer";
export { PointerObserver } from "./pointer_observer";
export { ViewportPointerTracker } from "./viewport_pointer_tracker";

// 既知の問題

// - Firefox
//   mouseで2つのpointerIdが同時にactiveになる事がある
//   再現条件不明 適当にマウス動かしながらタッチしまくると発生する
//   で、2つ目はpointerleave無しにいつのまにか消える（pointermoveが発生しなくなる）ので、Trackingが終了しないまま残ってしまう
//   発生する状況は限定的なものの、残ったTrackingが終了しているのかどうかは検知しようがないので致命的
//   → mouseの2つ目以降のpointerIdは無視しても実質問題ないか？
//   → penだとどうなるか要確認 TODO

// - Chrome, Edge
//   ターゲット要素のスクロールバー上のpointerdownでsetPointerCaptureしたとき、pointer captureされるがpointermoveが発火しない
//   おそらくスクロールバーにcaptureを取られている
//   firefoxは問題ない

// - Firefox
//   mouse操作中にタッチすると、マウスのカーソルがタッチ地点に移動する
//   （pointerIdを区別してほしい）

// - Chrome, Edge
//   mouseのpointer capture中にtouchすると、おそらくタッチで発生した暗黙のpointer ceptureが優先になる
//   mouseの方のpointermove等がその間発火しない（すぐに暗黙のreleaseが起きるので重大な問題は無い？？）

// - 仕様未定義に起因
//   タッチのpointerupのwidth/heightがブラウザによって違う
//    - chrome: 離した後扱い？（1×1）
//    - firefox:離す前扱い
//   仕様としてどうあるべきかの記載はPointer Events仕様書には特になし（私の見落としでなければ）

//備忘

// - 前提条件として
//   - windowとtargetでlistenしているので、到達前にpointereventをキャンセルされたら検知できなくなる
//   - touch-actionはブロックに適用
//   - display:inlineの場合の座標基点がブラウザによって違う
//   - その他box数が1ではない場合
//     - 0: displayがnone,contents,...
//     - 1以上: displayがinline,...
//     - 通常は1だが2以上になることがある: page-break以外のbreak (regionは廃止されたのでcolumnだけか？)
//   - 非trustedなPointerEventは無条件で無視している
//     受け付けるようにする場合は、pointerdownがtrustedでpointermoveが非trustedの場合の挙動などをどうするか
//   - 同一要素に対する多重監視を許すか
//     基本的には許しても許さなくてもどうでもいいが、captureするなら問題になる（mouseのcaptureと、pen/touchのcaptureは両立しない）
//     →ブラウザの仕様の問題なので、注意喚起のみにとどめる

// - gotpointercaptureは使用しないことにした
//     - setPointerCapture後、Firefoxは即座にgotpointercaptureが発火するのに対して、Chromeは次にpointermoveなどが発火する直前まで遅延される為
//     - Chromeで発火しない場合があるため（mouseでtargetのスクロールバー上でpointerdownした場合とか）
// - lostpointercaptureは使用しないことにした
//     - Chromeで発火しない場合があるため（gotopointercaptureとおそらく同じ問題）



// ターゲットのboundingBox外に位置する子孫の扱い
// Trackingは開始する仕様とする
// - ターゲットの子孫が何らかのCSS(position:absoluteなど)で、ターゲットのboundingBoxの外にある時
//   - その子孫でPointerEventが起きれば、当然ターゲットに伝播する
//   - このとき、PointerEventの座標でelementsFromPoint()したとき、ターゲットはヒットしない
//   - IntersectionObserverだとどうなるか要確認 TODO
//   - 



// 将来検討
// - pointerrawupdate設定可にする
// - trackに直前のtrackとの差分なんかも持たせる？
// - visualViewportのscroll,resizeに追随させる？
