<!--  -->
<template>
  <scroll-view :id="scrollViewId" class="scroll-container" scroll-y show-scrollbar :scroll-top="datas.scrollTop"
    @scroll="handleScroll" @scrolltolower="handleScrollToLower" ref="scrollRef">
    <view class="scroll-header">
      <slot name="header"></slot>
    </view>

    <view class="scroll-box" :style="{ height: `${allHeight * 2}rpx` }">
      <view class="list-wrap" :style="{ transform: `translateY(${datas.offsetY * 2}rpx)` }">
        <slot :list="datas.nowList"></slot>
      </view>
    </view>

    <view class="scroll-footer">
      <slot name="footer"></slot>
      <view :id="sentinelId" class="bottom-sentinel"></view>
    </view>
  </scroll-view>
</template>

<script lang="ts" setup>
import { useIntersectionLoadMore } from "@/hooks/useIntersectionLoadMore";

const instance = getCurrentInstance();
const $emit = defineEmits(['scrolltolower']);
// const slots = useSlots();
const props = defineProps({
  // 外层盒子高度
  boxH: {
    type: Number,
    default: 0,
  },
  // 每个元素的高度
  itemH: {
    type: Number,
    required: true,
  },
  // 列表数据
  list: {
    type: Array,
    default: () => [],
    required: true,
  },
  // 上下多出n个列表项用于加载缓存
  cacheNum: {
    type: Number,
    default: 4,
  },
  listNum: {
    type: Number,
    required: true,
  },
  columnNum: {
    //一行展示几列
    type: Number,
    required: false,
    default: 2,
  },
  defaultIndex: {
    type: Number,
    default: 0,
  },
  // 是否启用底部哨兵触底触发
  useSentinel: {
    type: Boolean,
    default: true,
  },
  // 触底触发冷却时间(ms)，避免重复触发
  loadCooldown: {
    type: Number,
    default: 600,
  },
  // 触底阈值(px)：必须滚到距离底部 <= 该值才触发
  bottomTriggerOffset: {
    type: Number,
    default: 8,
  },
});
const datas: any = reactive({
  nowList: [], // 目前显示列表
  lastLoadTriggerTime: 0,
  lastTriggeredListLen: -1,
  offsetY: 0,
  defaultIndex: 0,
  scrollTop: 0,
  scrollTopBacktop: 0,
  lastScrollTop: 0,
});
const scrollRef = ref();
const scrollViewHeight = ref(0);
const headerHeight = ref(0);
const footerHeight = ref(0);
const scrollViewId = `virtual-list-grid-scroll-${Math.random().toString(36).slice(2, 10)}`;
const sentinelId = `virtual-list-grid-sentinel-${Math.random().toString(36).slice(2, 10)}`;
const effectiveBoxH = computed(() => props.boxH || scrollViewHeight.value);
const sourceList = computed<any[]>(() => (props.list as any[]) || []);
const effectiveListNum = computed(() => props.listNum || sourceList.value.length);
const visibleRows = computed(() => {
  const currentHeight = effectiveBoxH.value;
  if (!currentHeight || !props.itemH) return 0;
  // 列表可视高度只扣除 header；footer 在列表尾部，不应长期占用可视区
  const listViewportHeight = Math.max(0, currentHeight - headerHeight.value);
  return Math.max(1, Math.ceil(listViewportHeight / props.itemH));
});
const allRows = computed(() => Math.ceil(effectiveListNum.value / props.columnNum));
const pageRows = computed(() => visibleRows.value + props.cacheNum * 2);
const allHeight: any = computed(() => allRows.value * props.itemH);
const isAtBottomByScroll = computed(() => {
  const viewBottom = datas.scrollTopBacktop + effectiveBoxH.value;
  const totalScrollableHeight = headerHeight.value + allHeight.value + footerHeight.value;
  const distanceToBottom = totalScrollableHeight - viewBottom;
  return distanceToBottom <= props.bottomTriggerOffset;
});

const emitVisibleSlice = (scrollTop: number) => {
  if (!props.itemH || !props.columnNum) return;
  const listScrollTop = Math.max(0, scrollTop - headerHeight.value);
  const currentRow = Math.floor(listScrollTop / props.itemH);
  const startRow = Math.max(0, currentRow - props.cacheNum);
  const endRow = Math.min(allRows.value, startRow + pageRows.value);
  const startIndex = startRow * props.columnNum;
  const endIndex = Math.min(effectiveListNum.value, endRow * props.columnNum);

  datas.defaultIndex = startIndex;
  datas.offsetY = startRow * props.itemH;
  datas.nowList = sourceList.value.slice(startIndex, endIndex);
};

const init = () => {
  if (!props.itemH || !props.columnNum) return;
  const alignedIndex = Math.max(
    0,
    Math.floor(props.defaultIndex / props.columnNum) * props.columnNum,
  );
  datas.defaultIndex = alignedIndex;
  const rowOffset = Math.floor(alignedIndex / props.columnNum) * props.itemH;
  // defaultIndex=0 时保持顶部，避免 header 被初始滚动顶出视口
  datas.scrollTop = alignedIndex > 0 ? rowOffset + headerHeight.value : 0;
  // nextTick 后切片，避免首屏测高尚未完成导致只渲染很少数据
  nextTick(() => {
    emitVisibleSlice(datas.scrollTop);
  });
};

const measureHeaderAndFooter = (cb?: () => void) => {
  uni
    .createSelectorQuery()
    .in(instance)
    .select('.scroll-header')
    .boundingClientRect()
    .select('.scroll-footer')
    .boundingClientRect()
    .exec((res: any[]) => {
      headerHeight.value = Number(res?.[0]?.height || 0);
      footerHeight.value = Number(res?.[1]?.height || 0);
      cb?.();
    });
};

const emitScrollToLower = (source: 'event' | 'sentinel') => {
  const now = Date.now();
  if (now - datas.lastLoadTriggerTime < props.loadCooldown) return;
  const currentLen = sourceList.value.length;
  if (currentLen === datas.lastTriggeredListLen) return;
  datas.lastLoadTriggerTime = now;
  datas.lastTriggeredListLen = currentLen;
  $emit('scrolltolower', source);
};

const handleScrollToLower = () => {
  emitScrollToLower('event');
};

const { start: startBottomObserve, stop: stopBottomObserve } =
  useIntersectionLoadMore({
    rootSelector: `#${scrollViewId}`,
    targetSelector: `#${sentinelId}`,
    skipInitial: true,
    onLoadMore: () => {
      if (!props.useSentinel) return;
      // 哨兵本身已是“到达底部”信号，直接触发并交由去重逻辑兜底
      emitScrollToLower('sentinel');
    },
    context: instance,
  });

const handleScroll = (e: any) => {
  const scrollTop = Math.max(0, e.detail.scrollTop);
  datas.lastScrollTop = datas.scrollTopBacktop;
  datas.scrollTopBacktop = scrollTop;
  emitVisibleSlice(scrollTop);
};

const initScrollViewHeight = () => {
  uni
    .createSelectorQuery()
    .in(instance)
    .select(".scroll-container")
    .boundingClientRect((res: any) => {
      if (res) {
        const systemInfo = uni.getSystemInfoSync();
        const viewportHeight = systemInfo.safeArea?.height || systemInfo.windowHeight || 0;
        // 当容器没有显式高度时，按“容器到视口底部”的剩余高度兜底
        scrollViewHeight.value = res.height > 0 ? res.height : Math.max(0, viewportHeight - (res.top || 0));
      }
    })
    .exec();
}

const refreshLayout = () => {
  initScrollViewHeight();
  nextTick(() => {
    measureHeaderAndFooter(() => {
      const currentScrollTop = datas.scrollTopBacktop || datas.scrollTop || 0;
      emitVisibleSlice(currentScrollTop);
    });
  });
};

// 重置scroll
const reset = () => {
  datas.defaultIndex = 0;
  nextTick(() => {
    datas.scrollTop = 1;
    init();
  });
};

onMounted(() => {
  setTimeout(() => {
    initScrollViewHeight();
    measureHeaderAndFooter(() => {
      init();
    });
    startBottomObserve();
  }, 100);
});
watch(
  () => [props.itemH, effectiveBoxH.value, props.cacheNum, props.columnNum],
  () => {
    nextTick(() => {
      measureHeaderAndFooter(() => {
        init();
      });
    });
  },
  { flush: 'post' }
);

watch(
  () => sourceList.value.length,
  () => {
    // 分页追加时保持当前位置，只刷新可视切片
    nextTick(() => {
      measureHeaderAndFooter(() => {
        const currentScrollTop = datas.scrollTopBacktop || datas.scrollTop || 0;
        emitVisibleSlice(currentScrollTop);
      });
    });
  },
  { flush: 'post' }
);

onUnmounted(() => {
  stopBottomObserve();
});
defineExpose({
  reset,
  refreshLayout,
});
</script>

<style lang="scss" scoped>
.scroll-container {
  width: 100%;
  height: 100%;
}

.scroll-header,
.scroll-footer {
  width: 100%;
}

.scroll-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  // margin-top: 80rpx;
  box-sizing: border-box;
  flex-shrink: 0;
}

.bottom-sentinel {
  width: 100%;
  height: 2rpx;
}
</style>


/**
props：
属性名 说明 类型 默认值
boxH 外层盒子高度 Number
itemH 每个元素的高度 Number
list 列表数据 Array []
listNum 列表数据数量 Number 0
cacheNum 上下多出n个列表项用于加载缓存 Number 4
columnNum 一行展示几列 Number 2
defaultIndex 默认当前滚动位置的下标 Number 0

event：
事件名 说明 事件返回类型
setList 返回新的截取内容列表 Array
scrolltolower 滚动到底部触发 Array

Exposes：
事件名 说明
reset 调用重置状态，返回顶部并初始化截取，常用返回顶部或者查询条件改变需要重新截取
*/