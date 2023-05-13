import { PointerActivityObserver } from "../dist/index.js";

const range = document.getElementById("Range");
const thumb = document.getElementById("Thumb");
const ox = document.getElementById("OutputX");
const oy = document.getElementById("OutputY");
const oH = document.getElementById("OutputH");

let lock = Number.NaN;
let mX = 0;
let mY = 0;

let t = Number.NaN;

function draw(x, y) {
  let tX = Math.min(75, Math.max(-75, x));
  let tY = Math.min(75, Math.max(-75, y));
  thumb.style.setProperty("left", `${ tX }px`);
  thumb.style.setProperty("top", `${ tY }px`);

  ox.value = x.toFixed(2);
  oy.value = y.toFixed(2);
}

let h = 0;
let hF = 0;
function draw2(x, y) {
  if (x !== 0) {
    x = x + hF;
    h = x % 360;
    if (h < 0) {
      h = (360 + h);
    }
    const hsl = `hsl(${h}, 100%, 50%)`;
    oH.style.setProperty("--h", hsl);
    oH.textContent = h.toFixed(0);
    console.log(`x${x}, h:${h}, `);
  }
}

const observer = new PointerActivityObserver(async (activity) => {
  let startAt = Number.NaN;
  let xc = 0;
  let yc = 0;
  t = setInterval(() => {
    if (Number.isNaN(startAt)) {
      return;
    }

    if (mX > 75 || mX < -75 || mY > 75 || mY < -75) {
      const i = performance.now() - startAt;
      let mX2 = 0;
      let mY2 = 0;
      if (mX > 75 || mX < -75) {
        xc = xc + 1;
        if (mX > 75) {
          mX2 = mX + (xc);
        }
        else if (mX < -75) {
          mX2 = mX - (xc);
        }
      }
      else {
        xc = 0;
      }
      if (mY > 75 || mY < -75) {
        yc = yc + 1;
        if (mY > 75) {
          mY2 = mY + (yc);
        }
        else if (mY < -75) {
          mY2 = mY - (yc);
        }
      }
      else {
        yc = 0;
      }
      draw2(mX2, mY2);
    }
    else {
      draw2(mX, mY);
    }
  }, 100);

  for await (const trace of activity) {
    if (trace.inContact === true) {
      if (Number.isNaN(lock)) {
        lock = activity.pointerId;
      }
      if (lock !== activity.pointerId) {
        return;
      }
      if (Number.isNaN(startAt) && trace.directlyOver === thumb) {
        startAt = performance.now();
        range.classList.add("xx-active");
      }

      mX = mX + trace.movementX;
      mY = mY + trace.movementY;
      draw(mX, mY);
    }
    else {
      if (lock === activity.pointerId) {
        mX = 0;
        mY = 0;
        draw(0, 0);
        hF = h;
        lock = Number.NaN;
        range.classList.remove("xx-active");
        startAt = Number.NaN;
      }
    }
  }

  clearInterval(t);
  mX = 0;
  mY = 0;
  draw(0, 0);
  hF = h;
  lock = Number.NaN;
}, {});
observer.observe(range);
