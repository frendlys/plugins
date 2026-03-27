一个基于uni-app scroll-view实现的高性能虚拟列表组件，适用于显示大量数据的场景。

## 特点

- 基于scroll-view组件，保留其所有原生功能
- 虚拟渲染，只渲染可视区域内的列表项，大幅提升性能
- 支持动态数据更新
- 支持自定义列表项样式
- 支持下拉刷新和上拉加载更多

## 使用方法

### 引入组件

```javascript
import VirtualList from '@/components/virtual-list/list.vue';

export default {
  components: {
    VirtualList
  }
}
```

### 基础用法

```vue
<virtual-list
  :data="listData"
  :item-height="80"
  :buffer-size="5"
  scroll-y
>
 ##自定义下拉动画插入插槽
  <template #custom-refresh-header>
    <view class="load-more-container">
      <img
        class="load-more"
        src="http://img.xindielu.com/web/1774497457100loading.webp"
      />
        <text class="load-toast">加载中</text>
    </view>
  </template>

  <template v-slot="{ item, index }">
    <view class="list-item">
      <text>{{ index + 1 }}. {{ item.title }}</text>
    </view>
  </template>
</virtual-list>
```

### 带下拉刷新和上拉加载更多

```vue
<virtual-list
  :data="listData"
  :item-height="80" 注：(list-item高度为70px，两个list-item之间有10px的间距，故item-height为70+10=80)
  :buffer-size="5"
  scroll-y
  :refresher-enabled="true"
  :refresher-triggered="isRefreshing"
  @scrolltolower="loadMore"
  @refresherrefresh="refresh"
>
  <template v-slot="{ item, index }">
    <view class="list-item">
      <text>{{ index + 1 }}. {{ item.title }}</text>
    </view>
  </template>
</virtual-list>
```

## 属性

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| data | Array | [] | 列表数据源 |
| item-height | Number | - | 列表项高度(px)，必须是固定高度(包括每一项之外额外间距，例：上面使用的案例) |
| buffer-size | Number | 5 | 缓冲区大小，即可视区域外预渲染的列表项数量 |
| data-key | String | '' | 数据项的唯一键名，用于优化渲染性能 |

除了以上属性外，组件还支持scroll-view的所有原生属性，如：

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| scroll-x | Boolean | false | 是否允许横向滚动 |
| scroll-y | Boolean | true | 是否允许纵向滚动 |
| upper-threshold | Number/String | 50 | 距顶部/左边多远时触发scrolltoupper事件 |
| lower-threshold | Number/String | 50 | 距底部/右边多远时触发scrolltolower事件 |
| scroll-top | Number/String | 0 | 设置竖向滚动条位置 |
| scroll-left | Number/String | 0 | 设置横向滚动条位置 |
| scroll-into-view | String | '' | 值应为某子元素id，滚动到该元素 |
| scroll-with-animation | Boolean | false | 在设置滚动条位置时使用动画过渡 |
| enable-back-to-top | Boolean | false | iOS点击顶部状态栏、安卓双击标题栏时，滚动条返回顶部 |
| show-scrollbar | Boolean | true | 是否显示滚动条 |
| refresher-enabled | Boolean | false | 开启自定义下拉刷新 |
| refresher-threshold | Number | 45 | 设置自定义下拉刷新阈值 |
| refresher-default-style | String | 'black' | 设置自定义下拉刷新默认样式 |
| refresher-background | String | '#FFFFFF' | 设置自定义下拉刷新区域背景颜色 |
| refresher-triggered | Boolean | false | 设置当前下拉刷新状态 |
| refresh-header-height | Number/String | 75 | 设置自定义下拉刷新区域高度 |

## 事件

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| visible-change | 可视区域数据变化时触发 | { startIndex, endIndex, visibleData } |

除了以上事件外，组件还支持scroll-view的所有原生事件，如：

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| scroll | 滚动时触发 | e.detail = {scrollLeft, scrollTop, scrollHeight, scrollWidth, deltaX, deltaY} |
| scrolltoupper | 滚动到顶部/左边时触发 | - |
| scrolltolower | 滚动到底部/右边时触发 | - |
| refresherpulling | 自定义下拉刷新控件被下拉时触发 | - |
| refresherrefresh | 自定义下拉刷新被触发时触发 | - |
| refresherrestore | 自定义下拉刷新恢复时触发 | - |
| refresherabort | 自定义下拉刷新被中止时触发 | - |

## 插槽

| 插槽名 | 说明 | 作用域参数 |
|--------|------|----------|
| default | 列表项内容 | { item, index } |

## 注意事项

1. 列表项高度必须是固定的，否则可能导致渲染错位
2. 为了获得最佳性能，建议设置合适的buffer-size值，不宜过大或过小
3. 在App平台的nvue页面中，建议使用原生的list组件，性能更佳
4. 如果列表项高度不固定，可能需要更复杂的实现方案