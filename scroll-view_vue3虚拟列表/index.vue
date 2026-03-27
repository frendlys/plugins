<template>
  <scroll-view
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
    <!-- 占位容器，撑开滚动区域 -->
    <view
      class="virtual-list-placeholder"
      :style="{ height: totalHeight + 'px' }"
    ></view>

    <!-- 实际渲染的列表项 -->
    <view
      class="virtual-list-content"
      :style="{ transform: `translateY(${offsetY}px)` }"
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
  </scroll-view>
</template>

<script setup lang="ts">
import {
  computed,
  getCurrentInstance,
  nextTick,
  onMounted,
  ref,
  watch,
} from "vue";

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
const instance = getCurrentInstance();

const itemHeight = computed(() => props.itemHeight);
const totalHeight = computed(() => props.data.length * itemHeight.value);
const refreshHeaderStyle = computed(() => ({
  height: `${props.refreshHeaderHeight * 2}rpx`,
  top: `-${props.refreshHeaderHeight * 2}rpx`,
}));
const refresherTriggered = computed(() => props.refresherTriggered);

const updateVisibleData = (scrollTopValue = 0) => {
  const itemH = itemHeight.value;
  if (!itemH || itemH <= 0) return;
  const start = Math.floor(scrollTopValue / itemH);
  const visibleCount = Math.ceil(containerHeight.value / itemH);
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
    .boundingClientRect((rect: { height?: number } | null) => {
      if (!rect || !rect.height) return;
      containerHeight.value = rect.height;
      updateVisibleData(Number(props.scrollTop || 0));
    })
    .exec();
};

const handleScroll = (e: { detail?: { scrollTop?: number } }) => {
  const currentScrollTop = Number(e?.detail?.scrollTop || 0);
  updateVisibleData(currentScrollTop);
  emit("scroll", e);
};

const handleScrollTopChange = (value: number | string) => {
  updateVisibleData(Number(value || 0));
};

const handleScrollToUpper = (e: unknown) => emit("scrolltoupper", e);
const handleScrollToLower = (e: unknown) => emit("scrolltolower", e);
const handleRefresherPulling = (e: unknown) => emit("refresherpulling", e);
const handleRefresherRefresh = (e: unknown) => emit("refresherrefresh", e);
const handleRefresherRestore = (e: unknown) => emit("refresherrestore", e);
const handleRefresherAbort = (e: unknown) => emit("refresherabort", e);

watch(
  () => props.data,
  () => {
    nextTick(() => {
      getContainerHeight();
      updateVisibleData(Number(props.scrollTop || 0));
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
  updateVisibleData(Number(props.scrollTop || 0));
  nextTick(() => {
    getContainerHeight();
  });
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
}
</style>
