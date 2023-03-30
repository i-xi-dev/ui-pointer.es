import { createApp } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";
import { PointerObserver } from "../dist/index.js";

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
        :class="{
          'v-output-detail-timeline': true,
          'v--live': seg.live === true,
        }"
        :style="{
          '--start': (seg.startTime * timeScale) + 'px',
          '--len': (seg.duration * timeScale) + 'px',
        }"
        :title="seg.startTimeStr"
        v-for="seg of item.seqs">
          <div
          :class="{
            'v-output-detail-timeline-2': true,
            'v--live': seg2.live === true,
          }"
          :style="{
            '--start2': ((seg2.startTime - seg.startTime) * timeScale) + 'px',
            '--len2': (seg2.duration * timeScale) + 'px',
          }"
          v-for="seg2 of seg.contactHistory"></div>
        </div>
      </div>
    </div>
  </div>
</div>
`;

createApp({
  data() {
    return {
      timeScale: 0.01,
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
        startTime: (activity.startTime - this.watchingStartAt),
        startTimeStr: formatTimeStamp(activity.startTime),
        offsetX,
        offsetY,
        width: 1,
        height: 1,
        inContact: false,
        contactHistory: [],
        path,
        duration: 0,
        durationStr: "0",
        live: true,
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
      indicator.live = false;

      if (this.drawMode === "canvas") {
        //
      }
      else if (this.drawMode === "svg") {
        //
      }
    },

    onprogress(activity, trace, prevTrace) {
      const offsetX = trace.targetOffset.x;
      const offsetY = trace.targetOffset.y;
      const inContact = trace.inContact;

      const indicator = this.indicatorMap.get(activity);

      let contactSeg;
      if (trace.inContact === true) {
        if (indicator.inContact !== true) {
          contactSeg = {};
          indicator.contactHistory.push(contactSeg);
          contactSeg.startTime = (trace.timeStamp - this.watchingStartAt);
          contactSeg.duration = 0;
          contactSeg.live = true;
        }
        else {
          contactSeg = indicator.contactHistory.at(-1);
          contactSeg.duration = contactSeg.duration + (trace.timeStamp - prevTrace.timeStamp);
        }
      }
      else {
        contactSeg = indicator.contactHistory.at(-1);
        if (contactSeg?.live === true) {
          contactSeg.duration = contactSeg.duration + (trace.timeStamp - prevTrace.timeStamp);
          contactSeg.live = false;
        }
      }

      indicator.offsetX = offsetX;
      indicator.offsetY = offsetY;
      indicator.width = trace.properties.radiusX * 2;
      indicator.height = trace.properties.radiusY * 2;
      indicator.inContact = inContact;
      indicator.contactHistory
      indicator.duration = activity.duration;
      indicator.durationStr = activity.duration.toFixed(3);

      if (this.drawMode === "canvas") {
        if (inContact === true && prevTrace) {
          const prevOffsetX = prevTrace.targetOffset.x;
          const prevOffsetY = prevTrace.targetOffset.y;
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
        let prevTrace = null;
        for await (const trace of activity) {
          this.onprogress(activity, trace, prevTrace);
          prevTrace = trace;
        }
        this.onend(activity);
      }, {
        pointerTypeFilter,
      });

      this.watchingStartAt = performance.now();
      this.timer = setInterval(this.drawOutputHead, 100);

      console.log(this.$refs.input1.tagName);
      this.observer.observe(this.$refs.input1);
    },

    drawOutputHead() {
      const a = (performance.now() - this.watchingStartAt) * this.timeScale;
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
