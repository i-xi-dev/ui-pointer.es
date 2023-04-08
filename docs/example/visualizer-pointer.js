export const VPointerIndicator = {
  data() {
    return {

    };
  },

  template: `
    <div
    :class="htmlClass"
    :style="style">
      <div class="v-pointer-indicator-crosshair"></div>
      <div class="v-pointer-indicator-circle"></div>
      <div class="v-pointer-indicator-contact"></div>
    </div>
  `,

  props: {
    indicator: {
      required: true,
    },
  },

  computed: {
    htmlClass() {
      return {
        "v-pointer-indicator": true,
        "v--primary": this.indicator.primary === true,
        "v--contact": this.indicator.inContact === true,
        "v--mouse": this.indicator.type === "mouse",
        "v--pen": this.indicator.type === "pen",
        "v--touch": this.indicator.type === "touch",
      };
    },

    style() {
      return {
        "left": `${ this.indicator.vX }px` ,
        "top": `${ this.indicator.vY }px` ,
        "--width": `${ this.indicator.width }px` ,
        "--height": `${ this.indicator.height }px` ,
      };
    },
  },
};
