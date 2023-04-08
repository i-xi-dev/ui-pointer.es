import { createApp } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";
import { VItem } from "../docs/example/dragdrop-item.js";
import { PointerObserver } from "../dist/index.js";

const template = `
<div class="v-app">
  <div :class="gridCssClass" :style="gridCssStyle" class="v-grid">
    <div class="v-grid-scrollport" ref="ref1">
      <div class="v-grid-head">
        <div class="v-grid-colheads">
          <div
          v-for="col of cols"
          :aria-current="(currentColNum === col.colNum) ? 'true' : undefined"
          class="v-grid-colhead">{{ String(col.colNum).padStart(3, '0') }}</div>
        </div>
        <div class="v-grid-rowheads">
          <div
          v-for="row of rows"
          :aria-current="(currentRowNum === row.rowNum) ? 'true' : undefined"
          class="v-grid-rowhead">{{ String(row.rowNum).padStart(3, '0') }}</div>
        </div>
      </div>
      <div class="v-grid-main" ref="ref2">
        <div v-if="!!dragTarget"
        :style="{
          'grid-column': dragTarget.dragoverColNum,
          'grid-row': dragTarget.dragoverRowNum,
        }"
        class="v-grid-cell">
          <div class="v-grid-cell-main"></div>
        </div>

        <v-item v-for="item of items"
        :col-width="colWidth"
        :is-anchor="!!dragTarget && (item === dragTarget.item)"
        :item="item"
        :row-height="rowHeight"
        
        @pointerdown="onItemPointerDown($event, item)"
        @pointerenter="onItemPointerEnter(item)"
        @pointerleave="onItemPointerLeave(item)"
        @pointermove="onItemPointerMove(item)">
        </v-item>
      </div>
    </div>

    <div v-if="mode === 'itemdrag'" class="v-grid-shadow">
      <div v-if="!!dragTarget"
      :style="{
        'left': dragTarget.dragXInBoundingBox + 'px',
        'top': dragTarget.dragYInBoundingBox + 'px',
      }"
      class="v-item-shadow"><!--TODO v-item共用にする -->
        <div class="v-item-main">
          <div class="v-item-name">{{ dragTarget.item.name }}</div>
        </div>
      </div>
    </div>
  </div>
</div>
`;

createApp({
  data() {
    return {
      colCount: 200,
      rowCount: 200,
      colWidth: 80,
      rowHeight: 80,
      xSpace: 100,
      ySpace: 100,
      cellPadding: 10,

      pointColNum: Number.NaN,
      pointRowNum: Number.NaN,

      items: [
        { id: 1, colNum: 1, rowNum: 1, name: "A" },
        { id: 2, colNum: 2, rowNum: 1, name: "B" },
        { id: 3, colNum: 3, rowNum: 1, name: "C" },
        { id: 4, colNum: 4, rowNum: 1, name: "D" },
        { id: 5, colNum: 5, rowNum: 1, name: "E" },
        { id: 6, colNum: 6, rowNum: 1, name: "F" },
        { id: 7, colNum: 7, rowNum: 1, name: "G" },
        { id: 8, colNum: 8, rowNum: 1, name: "H" },
        { id: 9, colNum: 1, rowNum: 2, name: "I" },
        { id: 10, colNum: 2, rowNum: 2, name: "J" },
        { id: 11, colNum: 3, rowNum: 2, name: "K" },
        { id: 12, colNum: 4, rowNum: 2, name: "L" },
        { id: 13, colNum: 5, rowNum: 2, name: "M" },
        { id: 14, colNum: 6, rowNum: 2, name: "N" },
        { id: 15, colNum: 7, rowNum: 2, name: "O" },
        { id: 16, colNum: 8, rowNum: 2, name: "P" },
      ],
      draggingItems: [],
      dragTarget: null,//TODO draggingItemsに
      pointerdownedTempItems: new Map(),
    };
  },

  components: {
    "v-item": VItem,
  },

  template,

  computed: {
    mode() {
      if (!!this.dragTarget) {
        return "itemdrag";
      }
      else {
        return "normal";
      }
    },

    gridBgImage() {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.colWidth}" height="${this.rowHeight}"><rect fill="#e4eef444" rx="10" ry="10" x="${this.cellPadding}" y="${this.cellPadding}" width="${this.colWidth - (this.cellPadding * 2)}" height="${this.rowHeight - (this.cellPadding * 2)}"/></svg>`;
    },

    gridCssClass() {
      return {
        "t3-mode-itemdrag": (this.mode === "itemdrag"),
        "t3-nodrop": (this.items.some((i) => i.colNum === this.currentColNum && i.rowNum === this.currentRowNum)),
      };
    },

    gridCssStyle() {
      return {
        "--x-col-count": `${this.colCount}`,
        "--x-row-count": `${this.rowCount}`,
        "--x-col-width": `${this.colWidth}px`,
        "--x-row-height": `${this.rowHeight}px`,
        "--x-x-space": `${this.xSpace}px`,
        "--x-y-space": `${this.ySpace}px`,
        "--x-cell-padding": `${this.cellPadding}px`,
        "--x-cell-bg": `url("data:image/svg+xml,${globalThis.encodeURIComponent(this.gridBgImage)}")`,
      };
    },

    cols() {
      const colArray = [];
      for (let colIndex = 0; colIndex < this.colCount; colIndex++) {
        colArray.push({
          colNum: colIndex + 1,
        });
      }
      return colArray;
    },

    rows() {
      const rowArray = [];
      for (let rowIndex = 0; rowIndex < this.rowCount; rowIndex++) {
        rowArray.push({
          rowNum: rowIndex + 1,
        });
      }
      return rowArray;
    },

    cells() {
      const cellArray = [];
      for (let rowIndex = 0; rowIndex < this.rowCount; rowIndex++) {
        for (let colIndex = 0; colIndex < this.colCount; colIndex++) {
          cellArray.push({
            colNum: colIndex + 1,
            rowNum: rowIndex + 1,
          });
        }
      }
      return cellArray;
    },

    currentColNum() {
      if (this.mode === "itemdrag") {
        return this.dragTarget.dragoverColNum;
      }
      else {
        return this.pointColNum;
      }
    },

    currentRowNum() {
      if (this.mode === "itemdrag") {
        return this.dragTarget.dragoverRowNum;
      }
      else {
        return this.pointRowNum;
      }
    },
  },

  methods: {
    onItemPointerDown(event, item) {
      this.pointerdownedTempItems.set(event.pointerId, item);
    },

    onItemPointerEnter(item) {
      this.pointColNum = item.colNum;
      this.pointRowNum = item.rowNum;
    },

    onItemPointerMove(item) {
      this.pointColNum = item.colNum;
      this.pointRowNum = item.rowNum;
    },

    onItemPointerLeave(item) {
      this.pointColNum = Number.NaN;
      this.pointRowNum = Number.NaN;
    },
  },

  mounted() {
  },
}).mount("#app");
