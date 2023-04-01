export { type PointerActivity, type PointerTrace, Pointer } from "./pointer";
export { PointerObserver } from "./pointer_observer";

// 既知の問題 //TODO 仕分けする

// - Chrome, Edge
//   ターゲット要素のスクロールバー上のpointerdownでsetPointerCaptureしたとき、pointer captureされるがpointermoveが発火しない
//   おそらくスクロールバーにcaptureを取られている
//   firefoxは問題ない

// - Chrome
//   いつのまにかpenのpointerenter,pointerleaveで、pointerType:mouseのpointerenter,pointerleaveが発火するようになった

//備忘

// - 前提条件として
//   - windowとtargetでlistenしているので、到達前にpointereventをキャンセルされたら検知できなくなる
//   - touch-actionはブロックに適用
//   - その他box数が1ではない場合
//     - 0: displayがnone,contents,...
//     - 1以上: displayがinline,...
//     - 通常は1だが2以上になることがある: page-break以外のbreak (regionは廃止されたのでcolumnだけか？) //TODO これは重大な問題な気がしてきた targetX/Yは一旦消すか？
//   - 非trustedなPointerEventは無条件で無視している
//   - 異なるpointerTypeのポインターを同時操作できるかはブラウザに依存

// - gotpointercaptureは使用しないことにした
//     - Chromeで発火しない場合があるため（mouseでtargetのスクロールバー上でpointerdownした場合とか）
// - lostpointercaptureは使用しないことにした
//     - Chromeで発火しない場合があるため（gotopointercaptureとおそらく同じ問題）

// - stream終了時点でpointerはtarget上にあるか検査するか
//   → streamの各trackもしくは、trackSequence.lastTrackで判定すればよい
//     お手軽なのは、
//     - viewport座標がbounding-box内にあるか判定
//     - viewport座標をelementsFromPointでヒットテスト
//     のいずれかだが、いずれもpointerleaveの発火条件とは一致しない
//     厳密にやるなら後者をtargetの全子孫に対して行う必要がある（ただしelementsFromPointはgetBoundingClientRectより有意に遅い）



// ターゲットのboundingBox外に位置する子孫の扱い
// Trackingは開始する仕様とする
// - ターゲットの子孫が何らかのCSS(position:absoluteなど)で、ターゲットのboundingBoxの外にある時
//   - その子孫でPointerEventが起きれば、当然ターゲットに伝播する
//   - このとき、PointerEventの座標でelementsFromPoint()したとき、ターゲットはヒットしない
//   - IntersectionObserverだとどうなるか要確認 TODO
//   - 



// 将来検討
// - optionsでフィルタ対応 streamの読み取り側でフィルタ出来るので初期バージョンでは対応しない
// - pointerrawupdate設定可にする
// - visualViewportのscroll,resizeに追随させる？
// - touchmoveキャンセル（touch-action:none強制設定を解除できるようにした場合）
// - 中クリックの自動スクロールがpointerdown(chrome) おそらく対処不能
// - 念のためmaxTouchPointsで上限設定する（ロストしたときに必ず_terminateしていれば不要なはず）（監視漏れがなければ）
// - 合体イベントの分解
//     → 要素境界をまたいでもpointermoveは合体されてる（windowでpointermoveをlistenしているので当然だが）
//       → 境界外のはstreamに出力しないように除外する？
//         → 厳密に判定するのは高コストなので（角が丸い場合とか子孫が境界外に出ている場合とか）
//           無視するか？firefoxのpointerenterのtimeStampがあてになるならtemeStampで絞れば良いが・・・
//           → とりあえず初期バージョンでは対応しないことにした
// - mouseButton,penButtonも指定されたもの以外は監視しない？
// - 排他設定（pointer 1つのみ監視）
// - safari: ダブルタップ？でテキスト選択になる （-webkit-user-selectで選択できないテキストでも。最も近く？の選択可能テキストを選択する）
//     → documentElement以下全てを選択不可にしてもらう他ない
// - pointer captureしない設定
// - stream生成条件、enqueue条件
// - タッチの総体やwheelを扱う版
//     wheelでスクロールしたときブラウザによってpointerenter,pointerleaveが発火しない
// - 監視中にポインターを停止している間、stream追加する/しない の設定

