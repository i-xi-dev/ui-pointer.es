
/*
function _hitTest(element: Element, { x, y, rx, ry }: Pointer.Geometry): { insideHitRegion: boolean, insideBoundingBox: boolean } { // x,yはviewport座標
  const root = element.getRootNode();
  if ((root instanceof Document) || (root instanceof ShadowRoot)) {
    const insideHitRegion = root.elementsFromPoint((x - rx), (y - ry)).includes(element)
      || root.elementsFromPoint((x + rx), (y - ry)).includes(element)
      || root.elementsFromPoint((x - rx), (y + ry)).includes(element)
      || root.elementsFromPoint((x + rx), (y + ry)).includes(element);

    let insideBoundingBox = false;
    const boundingBox = element.getBoundingClientRect();
    insideBoundingBox = ((x + rx) >= boundingBox.left) && ((x - rx) <= boundingBox.right)
      && ((y + ry) >= boundingBox.top) && ((y - ry) <= boundingBox.bottom);

    return {
      insideHitRegion,
      insideBoundingBox,
    };
  }
  throw new Error("invalid state: element is not connected");
}
*/

/*
class _PointerCaptureTarget extends Pointer.TrackingTarget<PointerCapture.Track> {

  constructor(target: Element, callback: Pointer.DetectedCallback<PointerCapture.Track>, options: Pointer.DetectionOptions) {
    super(target, callback, options);

    // touch-actionを一律禁止すると、タブレット等でスクロールできなくなってしまうので
    // 代わりにpointer capture中のtouchmoveをキャンセルする
    // いくつかの環境で試してみた結果ではtouchmoveのみキャンセルすれば問題なさそうだったが、
    //   Pointer Events仕様でもTouch Events仕様でも preventDefaultすると何が起きるのかがほぼ未定義なのはリスク
    this.target.addEventListener("touchmove", ((event: TouchEvent) => {
      if (this._trackingMap.size > 0) {
        event.preventDefault();
      }
    }) as EventListener, this._activeOptions);

  }
}
*/

// namespace PointerCapture {

//   export interface TrackingResult extends Pointer.TrackingResult<Track> {
//     /** @experimental */
//     wentOutOfHitRegion: boolean; // 終了時点でhit testをパスするか
//     /** @experimental */
//     wentOutOfBoundingBox: boolean; // 終了時点でbounding boxの外に出ているか（bounding boxが移動/リサイズした等には関知しない）
//     // XXX 上記いずれもstreamを読んでる側で取得可能の為不要では
//   }

// }

// 備忘
// - 同時追跡数はとりあえず1固定にしている
//     ブラウザのpointer captureが複数captureに対応してないので。（複数captureは可能だが、アクティブになるのは直近のcapture 1つのみ。releaseしたらその前のcaptureがアクティブになるが同時にアクティブにはならない）

// - $31 Chrome
//   mouseでpointer capture中にtouchして、mouseをtargetの外に出しpointerupしてもpointerupが発火しない
//   lostpointercaptureは、touchのpointerupの後、かつ、mouseが動く直前まで遅延される

// 将来検討
// - pointerrawupdate設定可にする
// - callbackでなく、{ start(track) => {}, progress(track) => {}, end(track) => {} }の方が便利か？
//   trackに直前のtrackとの差分なんかも持たせる？
// - 終了条件を設定可にする？（今はmouseはボタンは1つも押していない、pen,touchは接触を失った）
