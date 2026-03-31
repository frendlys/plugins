<template>
  <scroll-view
    :id="scrollViewId"
    class="custom-virtual-list"
    :scroll-x="scrollX"
    :scroll-y="scrollY"
    :upper-threshold="upperThreshold"
    :lower-threshold="lowerThreshold"
    :scroll-top="scrollTop"
    :scroll-left="scrollLeft"
    :scroll-into-view="scrollIntoView"
    :scroll-with-animation="scrollWithAnimation"
    :enable-back-to-top="enableBackToTop"
    :show-scrollbar="showScrollbar"
    :refresher-enabled="refresherEnabled"
    :refresher-threshold="refresherThreshold"
    :refresher-default-style="refresherDefaultStyle"
    :refresher-background="refresherBackground"
    :refresher-triggered="refresherTriggered"
    @scroll="handleScroll"
    @scrolltoupper="handleScrollToUpper"
    @scrolltolower="handleScrollToLower"
    @refresherpulling="handleRefresherPulling"
    @refresherrefresh="handleRefresherRefresh"
    @refresherrestore="handleRefresherRestore"
    @refresherabort="handleRefresherAbort"
  >
    <!-- 关闭默认下拉刷新样式：refresher-default-style："none",再使用自定义下拉刷新动画时-->
    <view
      class="custom-refresh-header"
      :style="refreshHeaderStyle"
      v-if="refresherTriggered && refresherDefaultStyle === 'none'"
    >
      <slot name="custom-refresh-header"></slot>
    </view>
    <!-- 自定义广告位 -->
    <view class="virtual-list-header">
      <slot name="header"></slot>
    </view>
    <!-- 占位容器，撑开滚动区域 -->
    <view
      class="virtual-list-placeholder"
      :style="{ height: totalHeight + 'px' }"
    ></view>

    <!-- 实际渲染的列表项 -->
    <view
      class="virtual-list-content"
      :style="{ transform: `translateY(${offsetY + headerHeight}px)` }"
    >
      <view
        v-for="(item, index) in visibleData"
        :key="dataKey ? item[dataKey] : index"
        class="virtual-list-item"
        :style="{ height: itemHeight + 'px' }"
      >
        <slot :item="item" :index="startIndex + index">
          <view>{{ item }}</view>
        </slot>
      </view>
    </view>

    <!-- 触底加载区：文档流撑高 scroll-view，与列表占位衔接；高度变化后会重新 measure -->
    <view class="virtual-list-more">
      <slot name="footer"></slot>
      <!-- 触底哨兵：进入可视区时触发分页（替代部分端上 scrolltolower 漏触发/频繁触发问题） -->
      <view :id="bottomSentinelId" class="virtual-list-bottom-sentinel" />
    </view>
  </scroll-view>
</template>

<script setup lang="ts" name="virtualList">
import {
  computed,
  getCurrentInstance,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { useIntersectionLoadMore } from "@/hooks/useIntersectionLoadMore";

interface VisibleChangePayload<T = any> {
  startIndex: number;
  endIndex: number;
  visibleData: T[];
}

const props = withDefaults(
  defineProps<{
    data: any[];
    // 必须是固定高度(包含每一项之外额外间距)，单位：px
    itemHeight: number;
    bufferSize?: number;
    dataKey?: string;
    scrollX?: boolean;
    scrollY?: boolean;
    upperThreshold?: number | string;
    lowerThreshold?: number | string;
    scrollTop?: number | string;
    scrollLeft?: number | string;
    scrollIntoView?: string;
    scrollWithAnimation?: boolean;
    enableBackToTop?: boolean;
    showScrollbar?: boolean;
    refresherEnabled?: boolean;
    refresherThreshold?: number;
    refresherDefaultStyle?: string;
    refresherBackground?: string;
    refreshHeaderHeight?: number;
    refresherTriggered?: boolean;
    /** 底部加载区固定高度(px)，不传则测量 .virtual-list-more；与 slot 内容变化时建议调 refreshLayout */
    moreFooterHeight?: number;
  }>(),
  {
    data: () => [],
    itemHeight: 0,
    bufferSize: 5,
    dataKey: "",
    scrollX: false,
    scrollY: true,
    upperThreshold: 50,
    lowerThreshold: 50,
    scrollTop: 0,
    scrollLeft: 0,
    scrollIntoView: "",
    scrollWithAnimation: false,
    enableBackToTop: false,
    showScrollbar: true,
    refresherEnabled: false,
    refresherThreshold: 45,
    refresherDefaultStyle: "black",
    refresherBackground: "rgba(0, 0, 0, 0)",
    refreshHeaderHeight: 75,
    refresherTriggered: false,
    moreFooterHeight: undefined,
  }
);

const emit = defineEmits<{
  (e: "scroll", ev: unknown): void;
  (e: "scrolltoupper", ev: unknown): void;
  (e: "scrolltolower", ev: unknown): void;
  (e: "refresherpulling", ev: unknown): void;
  (e: "refresherrefresh", ev: unknown): void;
  (e: "refresherrestore", ev: unknown): void;
  (e: "refresherabort", ev: unknown): void;
  (e: "visible-change", payload: VisibleChangePayload): void;
}>();

const startIndex = ref(0);
const endIndex = ref(0);
const offsetY = ref(0);
const visibleData = ref<any[]>([]);
const containerHeight = ref(0);
const headerHeight = ref(0);
const footerHeightMeasured = ref(0);
// 记录 scroll-view 的真实滚动位置，避免父组件重置数据时 props.scrollTop 仍是默认值导致可视区计算错位
const internalScrollTop = ref(0);
const instance = getCurrentInstance();

// 每个实例生成唯一 id，避免多列表场景 selector 冲突
const uniqueId = Math.random().toString(36).slice(2, 10);
const scrollViewId = `virtual-list-scroll-${uniqueId}`;
const bottomSentinelId = `virtual-list-bottom-sentinel-${uniqueId}`;

const itemHeight = computed(() => props.itemHeight);
const totalHeight = computed(() => props.data.length * itemHeight.value);
/** 列表内容总高度（不含 header、不含底部加载区），与占位 .virtual-list-placeholder 一致 */
const listContentHeight = computed(() => totalHeight.value);
const refreshHeaderStyle = computed(() => ({
  height: `${props.refreshHeaderHeight * 2}rpx`,
  top: `-${props.refreshHeaderHeight * 2}rpx`,
}));
const refresherTriggered = computed(() => props.refresherTriggered);

const updateVisibleData = (scrollTopValue = 0) => {
  const itemH = itemHeight.value;
  if (!itemH || itemH <= 0) return;
  // 相对 header 顶部的滚动量（列表占位 + 底部区在同一 scroll-view 内连续滚动）
  const rawListScroll = Math.max(0, scrollTopValue - headerHeight.value);
  const contentH = listContentHeight.value;
  // 滑入底部加载区时 rawListScroll 会大于列表总高，不裁剪会导致 floor 越界、空白屏
  const listScrollTop = contentH > 0 ? Math.min(rawListScroll, contentH) : 0;

  const availableHeight = Math.max(
    1,
    containerHeight.value - headerHeight.value
  );
  const start = Math.floor(listScrollTop / itemH);
  const visibleCount = Math.ceil(availableHeight / itemH);
  const safeVisibleCount = visibleCount > 0 ? visibleCount : 1;
  const end = Math.min(
    start + safeVisibleCount + props.bufferSize,
    props.data.length
  );

  startIndex.value = Math.max(0, start - props.bufferSize);
  endIndex.value = end;
  offsetY.value = startIndex.value * itemH;
  visibleData.value = props.data.slice(startIndex.value, endIndex.value);

  emit("visible-change", {
    startIndex: startIndex.value,
    endIndex: endIndex.value,
    visibleData: visibleData.value,
  });
};

const getContainerHeight = () => {
  if (!instance) return;
  const query = uni.createSelectorQuery().in(instance.proxy);
  query
    .select(".custom-virtual-list")
    .boundingClientRect()
    .select(".virtual-list-header")
    .boundingClientRect()
    .select(".virtual-list-more")
    .boundingClientRect()
    .exec((res: unknown) => {
      const arr = Array.isArray(res) ? res : [];
      const containerRect = arr[0] as { height?: number } | null;
      const headerRect = arr[1] as { height?: number } | null;
      const moreRect = arr[2] as { height?: number } | null;
      if (containerRect?.height != null) {
        containerHeight.value = Number(containerRect.height);
      }
      headerHeight.value = Number(headerRect?.height || 0);
      const fixedFooter = Number(props.moreFooterHeight);
      footerHeightMeasured.value =
        Number.isFinite(fixedFooter) && fixedFooter >= 0
          ? fixedFooter
          : Number(moreRect?.height || 0);
      updateVisibleData(internalScrollTop.value);
    });
};

const handleScroll = (e: { detail?: { scrollTop?: number } }) => {
  const currentScrollTop = Number(e?.detail?.scrollTop || 0);
  internalScrollTop.value = currentScrollTop;
  updateVisibleData(currentScrollTop);
  emit("scroll", e);
};

const handleScrollTopChange = (value: number | string) => {
  internalScrollTop.value = Number(value || 0);
  updateVisibleData(internalScrollTop.value);
};

const handleScrollToUpper = (e: unknown) => emit("scrolltoupper", e);
// 触底触发去重：快速滚动时可能多次进入/离开触发区
const lastLowerEmitAt = ref(0);
const lastTriggeredDataLen = ref(-1);
const triggerScrollToLower = () => {
  const now = Date.now();
  // 冷却时间可按体验微调：既避免“频繁触发”，也尽量不影响下一次分页
  const COOLDOWN_MS = 300;
  if (now - lastLowerEmitAt.value < COOLDOWN_MS) return;
  // 数据长度没变化时，通常表示上一次分页还在加载中（或本次没新增数据）
  // 不再重复触发，避免快速滑动造成“频次过高”的问题
  const currentLen = props.data?.length ?? 0;
  if (currentLen === lastTriggeredDataLen.value) return;
  lastLowerEmitAt.value = now;
  lastTriggeredDataLen.value = currentLen;
  emit("scrolltolower", {});
};
// 保留原生 scrolltolower 作为兜底，但统一走冷却锁逻辑
const handleScrollToLower = (_e: unknown) => triggerScrollToLower();
const handleRefresherPulling = (e: unknown) => emit("refresherpulling", e);
const handleRefresherRefresh = (e: unknown) => emit("refresherrefresh", e);
const handleRefresherRestore = (e: unknown) => emit("refresherrestore", e);
const handleRefresherAbort = (e: unknown) => emit("refresherabort", e);

// IntersectionObserver 触底：替代部分端上 scrolltolower 漏触发问题
const { start: startBottomObserve, stop: stopBottomObserve } =
  useIntersectionLoadMore({
    rootSelector: `#${scrollViewId}`,
    targetSelector: `#${bottomSentinelId}`,
    skipInitial: true,
    onLoadMore: () => triggerScrollToLower(),
    context: instance,
  });

watch(
  () => props.data,
  () => {
    nextTick(() => {
      getContainerHeight();
      updateVisibleData(internalScrollTop.value);
    });
  },
  { deep: true }
);

watch(
  () => props.scrollTop,
  (newVal) => {
    handleScrollTopChange(newVal);
  }
);

onMounted(() => {
  internalScrollTop.value = Number(props.scrollTop || 0);
  updateVisibleData(internalScrollTop.value);
  nextTick(() => {
    getContainerHeight();
    startBottomObserve();
  });
});

onUnmounted(() => {
  stopBottomObserve();
});

watch(
  () => props.moreFooterHeight,
  () => {
    nextTick(() => {
      getContainerHeight();
    });
  }
);

defineExpose({
  /** 头部/底部高度或列表数据变化后，可主动调用以重新测量并校正可视区 */
  refreshLayout: getContainerHeight,
});
</script>

<style lang="scss" scoped>
.custom-virtual-list {
  position: relative;
  width: 100%;
  height: 100%;

  .custom-refresh-header {
    width: 100%;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    position: absolute;
    left: 0;
  }

  .virtual-list-placeholder {
    width: 100%;
  }

  .virtual-list-header {
    width: 100%;
  }

  .virtual-list-content {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    z-index: 1;
  }

  .virtual-list-item {
    width: 100%;
    box-sizing: border-box;
  }

  .virtual-list-more {
    width: 100%;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .virtual-list-bottom-sentinel {
    width: 100%;
    height: 1px;
  }
}
</style>
