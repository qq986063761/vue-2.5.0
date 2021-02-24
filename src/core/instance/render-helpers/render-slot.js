/* @flow */

import { extend, warn, isObject } from 'core/util/index'

// 运行时渲染 slot 的方法
export function renderSlot (
  name: string,
  fallback: ?Array<VNode>,
  props: ?Object,
  bindObject: ?Object
): ?Array<VNode> {
  // 获取作用域 slot 的对应 name 函数
  const scopedSlotFn = this.$scopedSlots[name]
  // 如果能拿到 scopedSlotFn 说明是作用域 slots
  if (scopedSlotFn) { 
    props = props || {}
    if (bindObject) {
      if (process.env.NODE_ENV !== 'production' && !isObject(bindObject)) {
        warn(
          'slot v-bind without argument expects an Object',
          this
        )
      }
      props = extend(extend({}, bindObject), props)
    }

    // 返回 scopedSlotFn 函数的执行结果
    // scopedSlotFn 函数会创建子元素的 vnode，然后传入属性对象达到作用域 slots 的 scope 属性访问到子组件的属性
    return scopedSlotFn(props) || fallback
  } else {
    // 从 this.$slots 中获取对应 name 的节点数组
    const slotNodes = this.$slots[name]
    // warn duplicate slot usage
    if (slotNodes && process.env.NODE_ENV !== 'production') {
      slotNodes._rendered && warn(
        `Duplicate presence of slot "${name}" found in the same render tree ` +
        `- this will likely cause render errors.`,
        this
      )
      slotNodes._rendered = true
    }
    // 返回获取到的 slotNodes
    return slotNodes || fallback
  }
}
