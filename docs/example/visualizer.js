import { createApp } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { VTrackCanvas } from "./visualizer-tracks.js?1.2.1";
import { VPointerIndicator } from "./visualizer-pointer.js?1.2.1";
import { PointerActivityObserver } from "https://unpkg.com/@i-xi-dev/ui-pointer@1.2.1/dist/index.js";

function formatTimeStamp(timestamp) {
  const dt = new Date(performance.timeOrigin + timestamp);
  return dt.toISOString();
}

const template = `
<div
class="v-app"
:style="{
  '--content-size-x': inputSizeX + 'px',
  '--content-size-y': inputSizeY + 'px',
  '--inset': inputSpace + 'px',
}">
  <div class="v-control-pane">
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
        <legend>Canvas size</legend>
        <fieldset class="v-control-item v-control-group" :disabled="inWatching === true">
          <legend>Width</legend>
          <div class="v-control-item v--range">
            <input
            :disabled="inWatching === true"
            @input="clipSizeX = Number.parseInt($event.target.value)"
            min="200"
            max="1400"
            step="10"
            type="range"
            :value="clipSizeX"/>
            <output>{{ clipSizeX }}</output>
          </div>
        </fieldset>
        <fieldset class="v-control-item v-control-group" :disabled="inWatching === true">
          <legend>Height</legend>
          <div class="v-control-item v--range">
            <input
            :disabled="inWatching === true"
            @input="clipSizeY = Number.parseInt($event.target.value)"
            min="200"
            max="1400"
            step="10"
            type="range"
            :value="clipSizeY"/>
            <output>{{ clipSizeY }}</output>
          </div>
        </fieldset>
      </fieldset>
    </div>

    <div class="v-control">
      <fieldset class="v-control-group">
        <legend>Pen Stroke</legend>
        <fieldset class="v-control-item v-control-group">
          <legend>Color</legend>
          <div class="v-control-item v--color">
            <input type="color" v-model="penLineColor"/>
          </div>
        </fieldset>
        <fieldset class="v-control-item v-control-group">
          <legend>Thickness</legend>
          <div class="v-control-item v--range">
            <input
            @input="penLineThickness = Number.parseInt($event.target.value)"
            min="2"
            max="20"
            step="2"
            type="range"
            :value="penLineThickness"/>
            <output>{{ penLineThickness / 2 }}</output>
          </div>
        </fieldset>
        <label class="v-control-item v-control-button">
          <input type="checkbox" v-model="penPressure"/>
          <span>Detect pressure</span>
        </label>
      </fieldset>

      <fieldset class="v-control-group">
        <legend>Touch Stroke</legend>
        <fieldset class="v-control-item v-control-group">
          <legend>Color</legend>
          <div class="v-control-item v--color">
            <input type="color" v-model="touchLineColor"/>
          </div>
        </fieldset>
        <fieldset class="v-control-item v-control-group">
          <legend>Thickness</legend>
          <div class="v-control-item v--range">
            <input
            @input="touchLineThickness = Number.parseInt($event.target.value)"
            min="2"
            max="20"
            step="2"
            type="range"
            :value="touchLineThickness"/>
            <output>{{ touchLineThickness / 2 }}</output>
          </div>
        </fieldset>
      </fieldset>

      <fieldset class="v-control-group">
        <legend>Mouse Stroke</legend>
        <fieldset class="v-control-item v-control-group">
          <legend>Color</legend>
          <div class="v-control-item v--color">
            <input type="color" v-model="mouseLineColor"/>
          </div>
        </fieldset>
        <fieldset class="v-control-item v-control-group">
          <legend>Thickness</legend>
          <div class="v-control-item v--range">
            <input
            @input="mouseLineThickness = Number.parseInt($event.target.value)"
            min="2"
            max="20"
            step="2"
            type="range"
            :value="mouseLineThickness"/>
            <output>{{ mouseLineThickness / 2 }}</output>
          </div>
        </fieldset>
      </fieldset>
    </div>
  </div>

  <div class="v-input-pane">
    <div :aria-disabled="inWatching !== true ? 'true' : 'false'" class="v-input" ref="input1">
      <div class="v-input-clip"></div>
    </div>

    <v-track-canvas ref="canvas1"></v-track-canvas>
  </div>

  <div class="v-pointer-indicators">
    <v-pointer-indicator
    :indicator="indicator"
    v-for="indicator of indicators"></v-pointer-indicator>
  </div>

  <div class="v-output-pane" ref="out1">
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
      clipSizeX: 400,
      clipSizeY: 400,
      inputSpace: 100,
      dppx: 2,
      mouseLineColor: "#1a66b7",
      penLineColor: "#0f3a51",
      touchLineColor: "#4b89aa",
      mouseLineThickness: 2,
      penLineThickness: 10,
      touchLineThickness: 20,
      penPressure: true,
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
    };
  },

  template,

  components: {
    "v-pointer-indicator": VPointerIndicator,
    "v-track-canvas": VTrackCanvas,
  },

  computed: {
    inputSizeX() {
      return this.clipSizeX + (this.inputSpace * 2);
    },
    inputSizeY() {
      return this.clipSizeY + (this.inputSpace * 2);
    },
    indicators() {
      return [...this.indicatorMap.values()];
    },
  },

  methods: {
    nextId() {
      return this.idGen.next().value;
    },

    drawPathCanvas(x1, y1, x2, y2, trace, device, pointerEvent) {
      let lineThickness;
      let lineColor;
      switch (device.type) {
        case "pen":
          lineColor = this.penLineColor;
          if (this.penPressure === true) {
            lineThickness = Math.max(this.penLineThickness * trace.properties.pressure, 0.5);
          }
          else {
            lineThickness = this.penLineThickness;
          }
          break;
        case "touch":
          lineColor = this.touchLineColor;
          lineThickness = this.touchLineThickness;
          break;
        default:
          lineColor = this.mouseLineColor;
          lineThickness = this.mouseLineThickness;
          break;
      }
      this.$refs.canvas1.drawLine(x1, y1, x2, y2, {
        color: lineColor,
        thickness: lineThickness,
        pointerEvent,
      });
    },

    onstart(activity) {
      const { startTrace, beforeTrace } = activity;
      const offsetX = startTrace.targetX;
      const offsetY = startTrace.targetY;

      let path;
      if (startTrace.inContact === true && beforeTrace) {
        const prevOffsetX = beforeTrace.targetX;
        const prevOffsetY = beforeTrace.targetY;
        this.drawPathCanvas(prevOffsetX, prevOffsetY, offsetX, offsetY, startTrace, activity.device, startTrace.source);
      }

      const { device } = activity;
      const name = `${ device.type }:${ activity.pointerId }`;
      const indicator = {
        id: this.nextId(),
        type: device.type,
        primary: activity.isPrimary,
        name,
        startTime: (activity.startTime - this.watchingStartAt),
        startTimeStr: formatTimeStamp(activity.startTime),
        offsetX,
        offsetY,
        vX: startTrace.viewportX,
        vY: startTrace.viewportY,
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

    },

    onprogress(activity, trace, prevTrace) {
      const offsetX = trace.targetX;
      const offsetY = trace.targetY;
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
      indicator.vX = trace.viewportX;
      indicator.vY = trace.viewportY;
      indicator.width = trace.properties.radiusX * 2;
      indicator.height = trace.properties.radiusY * 2;
      indicator.inContact = inContact;
      indicator.contactHistory
      indicator.duration = activity.duration;
      indicator.durationStr = activity.duration.toFixed(3);

      if (inContact === true && prevTrace) {
        const prevOffsetX = prevTrace.targetX;
        const prevOffsetY = prevTrace.targetY;
        this.drawPathCanvas(prevOffsetX, prevOffsetY, offsetX, offsetY, trace, activity.device, trace.source);
      }
    },

    clearRecords() {
      this.$refs.canvas1.reset(this.inputSizeX, this.inputSizeX, this.dppx);

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

      this.observer = new PointerActivityObserver(async (activity) => {
        this.onstart(activity);
        let prevTrace = null;
        for await (const trace of activity) {
          this.onprogress(activity, trace, prevTrace);
          prevTrace = trace;
        }
        this.onend(activity);
      }, {
        //noAutoCapture: true,
      });

      this.watchingStartAt = performance.now();
      this.timer = setInterval(this.drawOutputHead, 100);

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

  created() {
    // PointerActivityObserver._enableDevMode();
  },

  mounted() {
    this.resetObserver();

    // mouseは境界外でpointerdownしてそのまま境界内にpointermoveするとpointerenterが発火する
    // pen,touchはそうはならない
    document.querySelector("*.v-input-pane").addEventListener("pointerdown", (e) => {
      if (e.target !== this.$refs.input1) {
        if (e.target.hasPointerCapture(e.pointerId)) {
          e.target.releasePointerCapture(e.pointerId);
        }
      }
    }, { passive: true, });
  },

  beforeDestroy() {
    this.disposeObserver();
  },

}).mount("#app");

document.querySelector("*.progress").hidden = true;