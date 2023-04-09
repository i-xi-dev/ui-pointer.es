import { nextTick } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const VTrackCanvas = {
  data() {
    return {
      context: null,
      dppx: 1,
      sizeX: 0,
      sizeY: 0,
    };
  },

  template: `
    <div class="v-track-layers">
      <canvas
      class="v-track-layer"
      :height="coordsY"
      ref="canvas1"
      :style="style"
      :width="coordsX"></canvas>
    </div>
  `,

  props: {
  },

  computed: {
    coordsX() {
      return this.sizeX * this.dppx;
    },

    coordsY() {
      return this.sizeY * this.dppx;
    },

    style() {
      return {
        "width": `${ this.sizeX }px`,
        "height": `${ this.sizeY }px`,
      };
    },
  },

  methods: {
    drawLine(x1, y1, x2, y2, { thickness, color } = {}) {
      this.context.lineCap = "round";
      this.context.lineWidth = thickness;
      this.context.strokeStyle = color;
      this.context.beginPath();
      this.context.moveTo(x1, y1);
      this.context.lineTo(x2, y2);
      this.context.stroke();
    },

    reset(sizeX, sizeY, dppx) {
      this.context.clearRect(0, 0, this.sizeX, this.sizeY);
      this.dppx = dppx;
      this.sizeX = sizeX;
      this.sizeY = sizeY;
      this.context.resetTransform();
      nextTick().then(() => {
        this.context.scale(this.dppx, this.dppx);
      });// width,heightが反映された後に実行する必要がある
    },
  },

  mounted() {
    this.context = this.$refs.canvas1.getContext("2d");
  },

  beforeDestroy() {
    this.context = null;
  },
};
