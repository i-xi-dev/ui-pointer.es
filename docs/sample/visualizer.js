import { createApp } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
//import { PointerObserver } from "https://esm.sh/@i-xi-dev/ui-pointer@0.0.1-alpha-10";
import { PointerObserver } from "https://unpkg.com/@i-xi-dev/ui-pointer@0.0.1-alpha-10/dist/index.js";





function formatTimeStamp(timestamp) {
  const dt = new Date(performance.timeOrigin + timestamp);
  return dt.toISOString();
}

const template = `
<div class="v-app">
  <div class="v-control">
    <button class="v-control-button v--pushbutton" @click="onToggle">
      <svg v-if="inWatching === true" viewBox="0 0 24 24">
        <path d="M 5 5 L 19 5 L 19 19 L 5 19 z" fill="#fff"/>
      </svg>
      <svg v-else viewBox="0 0 24 24">
        <path d="M 3 3 L 22 12 L 3 21 z" fill="#fff"/>
      </svg>
      <span>{{ (inWatching === true) ? "Stop" : "Start" }}</span>
    </button>
    <label :aria-disabled="inWatching === true ? 'true' : 'false'" class="v-control-button">
      <input :disabled="inWatching === true" type="checkbox" v-model="includesHover"/>
      <span>Include pointer hover in watch</span>
    </label>
    <fieldset class="v-control-group" :disabled="inWatching === true">
      <legend>Watch following pointer types</legend>
      <div class="v-control-flow">
        <label :aria-disabled="inWatching === true ? 'true' : 'false'" class="v-control-button">
          <input type="checkbox" v-model="watchMouse"/>
          <span>Mouse</span>
        </label>
        <label :aria-disabled="inWatching === true ? 'true' : 'false'" class="v-control-button">
          <input type="checkbox" v-model="watchPen"/>
          <span>Pen</span>
        </label>
        <label :aria-disabled="inWatching === true ? 'true' : 'false'" class="v-control-button">
          <input type="checkbox" v-model="watchTouch"/>
          <span>Touch</span>
        </label>
      </div>
    </fieldset>
    <label :aria-disabled="inWatching === true ? 'true' : 'false'" class="v-control-button">
      <input :disabled="inWatching === true" type="checkbox" v-model="usePointerCapture"/>
      <span>Pointer-capture when pointer is contacted</span>
    </label>
  </div>

  <div class="v-input-wrapper">
    <div :aria-disabled="inWatching !== true ? 'true' : 'false'" class="v-input" ref="input1">
      <svg class="v-input-layers" v-if="drawMode === 'svg'" :viewBox="'0 0 ' + inputSize + ' ' + inputSize">
      </svg>
      <div class="v-input-layers" v-if="drawMode === 'canvas'">
        <canvas class="v-input-layer" :height="inputSize" :width="inputSize"></canvas>
      </div>

      <div
      :class="{
        'v-input-indicator': true,
        'v--primary': indicator.primary === true,
        'v--contact': indicator.inContact === true,
        'v--mouse': indicator.type === 'mouse',
        'v--pen': indicator.type === 'pen',
        'v--touch': indicator.type === 'touch',
      }"
      :style="{
        'left': indicator.offsetX + 'px',
        'top': indicator.offsetY + 'px',
        '--width': indicator.width + 'px',
        '--height': indicator.height + 'px',
      }"
      v-for="indicator of indicators">
        <div class="v-input-indicator-crosshair"></div>
        <div class="v-input-indicator-circle"></div>
        <div class="v-input-indicator-contact"></div>
      </div>
    </div>
  </div>

  <div class="v-output-wrapper" ref="out1">
    <div class="v-output">
      <div
      class="v-output-head"
      :style="{
        '--len': historyHead + 'px',
      }"></div>
      <div class="v-output-detail" v-for="item of history">
        <div class="v-output-detail-name">
          <div class="v-output-detail-name-content">{{ item.name }}</div>
        </div>
        <div
        class="v-output-detail-timeline"
        :style="{
          '--start': seg.startTime + 'px',
          '--len': seg.duration + 'px',
        }"
        v-for="seg of item.seqs">
          <div class="v-output-detail-timeline-det">
            {{ seg.startTimeStr }}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
`;

createApp({
  data() {
    return {
      drawMode: "svg", // "svg" | "canvas"
      inputSize: 400,
      layerContext: null,
      observer: null,
      watchingStartAt: 0,
      timer: undefined,
      indicatorMap: new Map(),
      idGen: (function*() {
        for (let i = 1; i <= Number.MAX_SAFE_INTEGER; i++) {
          yield i;
        }
        throw new Error("id overflow");
      })(),
      history: [],
      historyHead: 0,
      inWatching: false,
      usePointerCapture: false,
      includesHover: false,
      watchMouse: true,
      watchPen: true,
      watchTouch: true,
    };
  },

  template,

  computed: {
    indicators() {
      return [...this.indicatorMap.values()];
    },
  },

  methods: {
    nextId() {
      return this.idGen.next().value;
    },

    onstart(activity) {
      const offsetX = activity.startTargetOffset.x;
      const offsetY = activity.startTargetOffset.y;

      let path;
      if (this.drawMode === "svg") {
        path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.classList.add("v-input-layer-path");
        path.setAttribute("d", `M ${offsetX} ${offsetY}`);
        document.querySelector("*.v-input-layers").append(path);
      }

      const { pointer } = activity;
      const name = `${ pointer.type }:${ pointer.id }`;
      const indicator = {
        id: this.nextId(),
        type: pointer.type,
        primary: pointer.isPrimary,
        name,
        startTime: (activity.startTime - this.watchingStartAt) * 0.01,
        startTimeStr: formatTimeStamp(activity.startTime),
        offsetX,
        offsetY,
        width: 1,
        height: 1,
        inContact: false,
        path,
        duration: 0,
        durationStr: "0",
      };
      this.indicatorMap.set(activity, indicator);
      const hitem = this.history.find((item) => item.name === name);
      if (hitem) {
        hitem.seqs.push(indicator);
      }
      else {
        this.history.push({
          name,
          seqs: [indicator],
        });
      }
    },

    onend(activity) {
      const indicator = this.indicatorMap.get(activity);
      this.indicatorMap.delete(activity);

      if (this.drawMode === "canvas") {
        //
      }
      else if (this.drawMode === "svg") {
        //
      }
    },

    onprogress(activity, motion, prevMotion) {
      const offsetX = motion.targetOffset.x;
      const offsetY = motion.targetOffset.y;
      const inContact = motion.inContact;

      const indicator = this.indicatorMap.get(activity);
      indicator.offsetX = offsetX;
      indicator.offsetY = offsetY;
      indicator.width = motion.properties.radiusX * 2;
      indicator.height = motion.properties.radiusY * 2;
      indicator.inContact = inContact;
      indicator.duration = activity.duration * 0.01;
      indicator.durationStr = activity.duration.toFixed(3);

      if (this.drawMode === "canvas") {
        if (inContact === true && prevMotion) {
          const prevOffsetX = prevMotion.targetOffset.x;
          const prevOffsetY = prevMotion.targetOffset.y;
          this.layerContext.beginPath();
          this.layerContext.moveTo(prevOffsetX, prevOffsetY);
          this.layerContext.lineTo(offsetX, offsetY);
          this.layerContext.stroke();
          //XXX 座標動かさずにclickした場合に何も描画されない
        }
      }
      else if (this.drawMode === "svg") {
        const c = (inContact === true) ? "L" : "M";
        indicator.path.setAttribute("d", indicator.path.getAttribute("d") + ` ${c} ${offsetX} ${offsetY}`);
        //XXX 長いと重くなる 適当に切るか？
        //XXX Mの前がMの場合は、前のMは消す
      }
    },

    clearRecords() {
      if (this.drawMode === "svg") {
        const svg = document.querySelector("svg.v-input-layers");
        while (svg.firstElementChild) {
          svg.firstElementChild.remove();
        }
      }
      if (this.drawMode === "canvas") {
        this.layerContext.clearRect(0, 0, this.inputSize, this.inputSize);
      }

      this.history.splice(0);
      this.historyHead = 0;
    },

    onToggle() {
      if (this.inWatching === true) {
        this.disposeObserver();
      }
      else {
        this.resetObserver();
      }
    },

    resetObserver() {
      this.disposeObserver();
      this.clearRecords();
      this.inWatching = true;

      const pointerTypeFilter = [];
      if (this.watchMouse === true) {
        pointerTypeFilter.push("mouse");
      }
      if (this.watchPen === true) {
        pointerTypeFilter.push("pen");
      }
      if (this.watchTouch === true) {
        pointerTypeFilter.push("touch");
      }

      this.observer = new PointerObserver(async (activity) => {
        this.onstart(activity);
        let prevMotion = null;
        for await (const motion of activity) {
          this.onprogress(activity, motion, prevMotion);
          prevMotion = motion;
        }
        this.onend(activity);
      }, {
        includesHover: this.includesHover,
        pointerTypeFilter,
        usePointerCapture: this.usePointerCapture,
      });

      this.watchingStartAt = performance.now();
      this.timer = setInterval(this.drawOutputHead, 100);

      console.log(this.$refs.input1.tagName);
      this.observer.observe(this.$refs.input1);
    },

    drawOutputHead() {
      const a = (performance.now() - this.watchingStartAt) * 0.01;
      this.historyHead = a;
      this.$refs.out1.scrollLeft = this.$refs.out1.scrollLeft + a;
    },

    disposeObserver() {
      this.inWatching = false;
      if (this.observer) {
        this.observer.disconnect();
      }
      this.observer = null;
      clearInterval(this.timer);
      this.timer = undefined;
    },
  },

  mounted() {
    if (this.drawMode === "canvas") {
      this.layerContext = document.querySelector("canvas.v-input-layer")?.getContext("2d");
      this.layerContext.lineWidth = 1;
      this.layerContext.strokeStyle = "#d12";
    }
    this.resetObserver();
  },

  beforeDestroy() {
    this.disposeObserver();
    if (this.drawMode === "canvas") {
      this.layerContext = null;
    }
  },

}).mount("#app");
