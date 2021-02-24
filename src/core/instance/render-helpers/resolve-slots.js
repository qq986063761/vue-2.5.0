/* @flow */

/**
 * Runtime helper for resolving raw children VNodes into a slot object.
 */
export function resolveSlots (
  children: ?Array<VNode>,
  context: ?Component
): { [key: string]: Array<VNode> } {
  const slots = {}
  if (!children) {
    return slots
  }
  const defaultSlot = []
  // 遍历父节点的 children 获取当前节点的 slots 数据
  for (let i = 0, l = children.length; i < l; i++) {
    const child = children[i]
    const data = child.data
    // remove slot attribute if the node is resolved as a Vue slot node
    if (data && data.attrs && data.attrs.slot) {
      delete data.attrs.slot
    }
    // 如果传入 children 中的上下文和父节点是同一个上下文，且 data 数据中存在 slot 属性
    // 则说明存在需要渲染的 slot
    if ((child.context === context || child.functionalContext === context) &&
      data && data.slot != null
    ) {
      // 获取 slot name 和 slot 内容
      const name = child.data.slot
      // 定义 slots[name]
      const slot = (slots[name] || (slots[name] = []))
      if (child.tag === 'template') {
        slot.push.apply(slot, child.children)
      } else {
        // 将 child 节点 push 到对应的 slots[name] 中
        slot.push(child)
      }
    } else {
      // 没有定义 slot name 的节点就放入默认 slot 数组中
      defaultSlot.push(child)
    }
  }
  
  // ignore whitespace
  if (!defaultSlot.every(isWhitespace)) {
    slots.default = defaultSlot
  }
  return slots
}

function isWhitespace (node: VNode): boolean {
  return node.isComment || node.text === ' '
}

// 解析作用域 slots，返回 key fn 的一个用于执行的对象
export function resolveScopedSlots (
  fns: ScopedSlotsData, // see flow/vnode
  res?: Object
): { [key: string]: Function } {
  res = res || {}
  for (let i = 0; i < fns.length; i++) {
    if (Array.isArray(fns[i])) {
      resolveScopedSlots(fns[i], res)
    } else {
      res[fns[i].key] = fns[i].fn
    }
  }
  // 返回一个key value形式的对象
  // 比如在作用域 slots 场景下，返回的是 {default: fn(){...}}
  return res
}
