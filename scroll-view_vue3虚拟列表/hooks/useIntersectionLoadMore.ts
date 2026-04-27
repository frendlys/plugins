import type { ComponentInternalInstance } from "vue";

type UseIntersectionLoadMoreOptions = {
  /** 滚动容器选择器（作为相对参照） */
  rootSelector: string;
  /** 哨兵节点选择器（触底标识） */
  targetSelector: string;
  /** 触发回调（例如 postLoadMore） */
  onLoadMore: () => void;
  /** 是否跳过首次 observe 回调（默认跳过，避免初次就触发加载） */
  skipInitial?: boolean;
  /** 自定义上下文（一般传 getCurrentInstance() 即可） */
  context?: ComponentInternalInstance | any;
  /** 回调函数 */
  callback?: (res: any) => void;
};

export function useIntersectionLoadMore(
  options: UseIntersectionLoadMoreOptions,
) {
  const {
    rootSelector,
    targetSelector,
    onLoadMore,
    context,
    skipInitial = true,
    callback,
  } = options;
  let observer: UniApp.IntersectionObserver | null = null;
  let hasHandledInitial = false;
  let wasIntersecting = false;

  const start = () => {
    if (observer) return;
    hasHandledInitial = false;
    wasIntersecting = false;
    const ctx = (context as any)?.proxy ?? context;
    observer = uni.createIntersectionObserver(ctx);
    observer.relativeTo(rootSelector).observe(targetSelector, (res) => {
      callback?.(res);

      const isIntersecting = !!(
        res?.intersectionRatio && res.intersectionRatio > 0
      );

      // 首次回调（很多端会立即给 1），默认跳过，避免初始化就触发一次“触底加载”
      if (!hasHandledInitial) {
        hasHandledInitial = true;
        wasIntersecting = isIntersecting;
        if (skipInitial) return;
      }
      // 仅在“从不可见 -> 可见”时触发一次
      if (isIntersecting && !wasIntersecting) onLoadMore();
      wasIntersecting = isIntersecting;
    });
  };

  const stop = () => {
    observer?.disconnect();
    observer = null;
  };

  return { start, stop };
}
