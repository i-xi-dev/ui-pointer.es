export * from "./pointer";
export * from "./pointer_capture";
export * from "./pointer_observer";

/*

PointerObserver(callback, options)

  options
    type: "mouse" | "pen" | "touch"
    primary: boolean
    captureWhenContact: boolean
    mode: 
      hover,    (mouse-no-buttons, pen-hover, -)
      contact,  (mouse-left-button, pen-contact, touch-contact)
    modifier: mouse-button, pen-button, key


observe(target)

unobserve(target)

disconnect()


PointerObserverService()
streams
(最大数をmaxTouchPoints
*/