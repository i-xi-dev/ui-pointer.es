const _DEBUG = true;
const _FILTER = ["pointerenter", "pointerleave", "pointerdown", "pointerup", "pointercancel"];

function _formatTimeStamp(timeStamp: number): string {
  const e = performance.timeOrigin + timeStamp;
  const d = new Date(e);
  const utcStr = d.toISOString();
  return utcStr.substring(10, 17) + "%c" + utcStr.substring(17, 19) + "." + e.toFixed(6).padStart(10, "0").slice(-10).replace(".", "") + "%cZ";
}

namespace _Debug {
  export function log(pe: PointerEvent): void {
    if (_DEBUG !== true) {
      return;
    }
    if (_FILTER.includes(pe.type) !== true) {
      return;
    }

    console.log(`%c${_formatTimeStamp(pe.timeStamp)} - ${pe.type} : { x:${pe.clientX}, y:${pe.clientY} }`, "font-weight:400;", "font-weight:700;margin-inline:.5ch;", "font-weight:400;");
  }
}

export default _Debug;
