export { type PointerActivity, type PointerMotion, Pointer } from "./pointer";
export { PointerObserver } from "./pointer_observer";

// 既知の問題 //TODO 仕分けする

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

// - Chrome
//   mouseでpointer capture中にtouchして、mouseをtargetの外に出しpointerupしてもpointerupが発火しない

// - Firefox
//   mouse操作中にタッチすると、マウスのカーソルがタッチ地点に移動する
//   （pointerIdを区別してほしい）

// - Firefox
//   同時に起きたはずのPointerEventのtimeStampがずれてる
//     - 同座標での windowのpointermove と elementのpointerenter
//     - 同座標での elementのpointermove と 同elementのpointerenter
//     いずれも発火順はpointereneterが先なのにtimeStampは15ms前後遅れる

// - Chrome, Edge
//   mouseのpointer capture中にtouchすると、おそらくタッチで発生した暗黙のpointer ceptureが優先になる
//   mouseの方のpointermove等がその間発火しない（すぐに暗黙のreleaseが起きるので重大な問題は無い？？）

// - Chrome
//   いつのまにかpenのpointerenter,pointerleaveで、pointerType:mouseのpointerenter,pointerleaveが発火するようになった

// - 
//   ストリームにpushされるタイミングはブラウザ依存
//   - Chrome: touch,penが動いている間、mouseは無視される（touchとpenは同時操作でも問題なさそう、複数同時touchも問題なさそう）
//   - Firefox: touchが動いている間、pen,mouseはほぼ無視される（pointerIdが0でないmouseが検知されたり、相当怪しい）（penとmouseは同時操作でも問題なさそう、複数同時touchも問題なさそう）


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
//     - Chromeでgotpointercapture同様に遅延発火されるため

// - stream終了時点でpointerはtarget上にあるか検査するか
//   → streamの各trackもしくは、trackSequence.lastTrackで判定すればよい
//     お手軽なのは、
//     - viewport座標がbounding-box内にあるか判定
//     - viewport座標をelementsFromPointでヒットテスト
//     のいずれかだが、いずれもpointerleaveの発火条件とは一致しない
//     厳密にやるなら後者をtargetの全子孫に対して行う必要がある（ただしelementsFromPointはgetBoundingClientRectより有意に遅い）

// - wheel →wheelでスクロールしたときブラウザによってpointerenter,pointerleaveが発火しない


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
// - trackに直前のtrackとの差分なんかも持たせる？
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
//     → 全体を選択不可にしてもらうほかない

/*
TODO 下記対処したら脱alpha

1. pointerenterの直前の位置を追加する（開始前位置としてactivityに）leaveの位置も終了後位置に移す
3. safari: ダブルタップでズームしないのは非テキストのみ

*/
