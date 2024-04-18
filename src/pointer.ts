import { Keyboard } from "@i-xi-dev/ui-utils";

type pointerid = number;

// TODO 整理
namespace Pointer {
  export const Modifier = {
    ALT: Keyboard.Key.ALT,
    ALT_GRAPH: Keyboard.Key.ALT_GRAPH,
    CAPS_LOCK: Keyboard.Key.CAPS_LOCK,
    CONTROL: Keyboard.Key.CONTROL,
    F1: Keyboard.Key.F1,
    F2: Keyboard.Key.F2,
    F3: Keyboard.Key.F3,
    F4: Keyboard.Key.F4,
    F5: Keyboard.Key.F5,
    F6: Keyboard.Key.F6,
    F7: Keyboard.Key.F7,
    F8: Keyboard.Key.F8,
    F9: Keyboard.Key.F9,
    F10: Keyboard.Key.F10,
    F11: Keyboard.Key.F11,
    F12: Keyboard.Key.F12,
    F13: Keyboard.Key.F13,
    F14: Keyboard.Key.F14,
    F15: Keyboard.Key.F15,
    FN_LOCK: Keyboard.Key.FN_LOCK,
    HYPER: Keyboard.Key.HYPER,
    META: Keyboard.Key.META,
    NUM_LOCK: Keyboard.Key.NUM_LOCK,
    SCROLL_LOCK: Keyboard.Key.SCROLL_LOCK,
    SHIFT: Keyboard.Key.SHIFT,
    SUPER: Keyboard.Key.SUPER,
    SYMBOL: Keyboard.Key.SYMBOL,
    SYMBOL_LOCK: Keyboard.Key.SYMBOL_LOCK,
  } as const;
  export type Modifier = typeof Modifier[keyof typeof Modifier];

}

export {
  type pointerid,
  Pointer,
};
