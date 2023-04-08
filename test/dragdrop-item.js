export const VItem = {
  data() {
    return {

    };
  },

  template: `
    <div
    :class="cssClass"
    :style="cssStyle">
      <div class="v-item-main">
        <div class="v-item-name">{{ item.name }}</div>
      </div>
    </div>
  `,

  props: {
    item: {
      required: true,
    },

    isAnchor: {
      required: true,
    },

    colWidth: {
      required: true,
    },

    rowHeight: {
      required: true,
    },
  },

  computed: {
    cssClass() {
      return {
        "v-item": true,
        "t3-anchor": this.isAnchor === true,
      };
    },

    cssStyle() {
      return {
        "left": `${((this.item.colNum - 1) * this.colWidth) + 0}px`,
        "top": `${((this.item.rowNum - 1) * this.rowHeight) + 0}px`,
      };
    },
  },
};
