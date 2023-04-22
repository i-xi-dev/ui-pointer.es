import { PointerActivityObserver } from "https://unpkg.com/@i-xi-dev/ui-pointer@1.0.0/dist/index.js";

const scroller = document.getElementById("Scroller");
const scrollbarX = document.getElementById("ScrollbarX");
const scrollbarY = document.getElementById("ScrollbarY");
const outputX = document.getElementById("OutputX");
const outputY = document.getElementById("OutputY");
const scrollportW = scroller.offsetWidth;
const scrollportH = scroller.offsetHeight;
const contentW = scroller.scrollWidth;
const contentH = scroller.scrollHeight;
const maxScrollLeft = contentW - scrollportW;
const maxScrollTop = contentH - scrollportH;
const indicatorWidth = scrollportW * (scrollportW / contentW);
const indicatorHeight = scrollportH * (scrollportH / contentH);

let lock = false;

function updateIndicator() {
  scrollbarX.style.setProperty("width", `${indicatorWidth}px`);
  scrollbarY.style.setProperty("height", `${indicatorHeight}px`);
  const rateX = scroller.scrollLeft / maxScrollLeft;
  const rateY = scroller.scrollTop / maxScrollTop;
  scrollbarX.style.setProperty("margin-left", `${(scrollportW - indicatorWidth) * rateX}px`);
  scrollbarY.style.setProperty("margin-top", `${(scrollportH - indicatorHeight) * rateY}px`);

  outputX.value = (rateX * 100).toFixed(2) + "%";
  outputY.value = (rateY * 100).toFixed(2) + "%";
}

const observer = new PointerActivityObserver(async (activity) => {
  if (lock === true) {
    return;
  }
  lock = true;

  for await (const trace of activity) {
    if (trace.inContact === true) {
      scroller.classList.add("xx-active");

      scroller.scrollBy(-trace.movementX, -trace.movementY);
      updateIndicator();
    }
    else {
      scroller.classList.remove("xx-active");
    }
  }

  lock = false;
}, {});
observer.observe(scroller);
