
function _formatTimeStamp(timeStamp: number): string {
  const e = performance.timeOrigin + timeStamp;
  const d = new Date(e);
  const utcStr = d.toISOString();
  return utcStr.substring(10, 17) + "%c" + utcStr.substring(17, 19) + "." + e.toFixed(6).padStart(10, "0").slice(-10).replace(".", "") + "%cZ";
}

const _DefaultEventFilter: Array<string> = [
  "pointercancel",
  "pointerdown",
  "pointerenter",
  "pointerleave",
  // "pointermove",
  "pointerup",
];

let _enabled: boolean = false;
let _eventFilter: Array<string> = [ ..._DefaultEventFilter ];

type _DebugConfig = {
  enabled: boolean,
  eventFilter?: Array<string>,
};

namespace _Debug {
  export function setConfig(config: _DebugConfig): void {
    _enabled = config.enabled;
    _eventFilter = Array.isArray(config.eventFilter) ? [ ...config.eventFilter ] : [ ..._DefaultEventFilter ];
  }

  export function logText(message: string): void {
    if (_enabled !== true) {
      return;
    }

    console.log(message);
  }

  export function logEvent(pe: PointerEvent): void {
    if (_enabled !== true) {
      return;
    }
    if (_eventFilter.includes(pe.type) !== true) {
      return;
    }

    console.log(`%c${_formatTimeStamp(pe.timeStamp)} - ${pe.pointerType}[${pe.pointerId}] ${pe.type} : { x:${pe.clientX}, y:${pe.clientY} }, { x:${pe.offsetX}, y:${pe.offsetY} }`, "font-weight:400;", "font-weight:700;margin-inline:.5ch;", "font-weight:400;");
  }

  export function assertWarn(assertion: boolean, message: string): void {
    if (_enabled !== true) {
      return;
    }

    if (assertion !== true) {
      console.warn(message);
    }
  }
}

export default _Debug;
