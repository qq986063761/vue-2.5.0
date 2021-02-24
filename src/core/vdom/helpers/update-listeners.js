/* @flow */

import { warn } from 'core/util/index'
import { cached, isUndef } from 'shared/util'

// 解析事件修饰符，通过命名中的一些规则判断事件冒泡、捕获、绑定一次等行为
const normalizeEvent = cached((name: string): {
  name: string,
  once: boolean,
  capture: boolean,
  passive: boolean
} => {
  const passive = name.charAt(0) === '&'
  name = passive ? name.slice(1) : name
  const once = name.charAt(0) === '~' // Prefixed last, checked first
  name = once ? name.slice(1) : name
  const capture = name.charAt(0) === '!'
  name = capture ? name.slice(1) : name
  return {
    name,
    once,
    capture,
    passive
  }
})

// 创建函数调用对象
export function createFnInvoker (fns: Function | Array<Function>): Function {
  // 最终的事件执行函数
  function invoker () {
    // 获取当前应该执行的回调对象
    const fns = invoker.fns
    // 如果事件回调是数组，则遍历了依次调用
    if (Array.isArray(fns)) {
      const cloned = fns.slice()
      for (let i = 0; i < cloned.length; i++) {
        cloned[i].apply(null, arguments)
      }
    } else {
      // 如果事件回调不是数组，则直接调用
      return fns.apply(null, arguments)
    }
  }
  // 将用户自定义的事件回调，挂到 invoker.fns 上，方便后续直接调用
  invoker.fns = fns
  return invoker
}

export function updateListeners (
  on: Object,
  oldOn: Object,
  add: Function,
  remove: Function,
  vm: Component
) {
  let name, cur, old, event
  for (name in on) {
    cur = on[name]
    old = oldOn[name]
    // 解析 event name，获取当前事件名相关的事件配置对象
    event = normalizeEvent(name)
    
    // 如果当前自定义事件不存在，则警告
    if (isUndef(cur)) {
      process.env.NODE_ENV !== 'production' && warn(
        `Invalid handler for event "${event.name}": got ` + String(cur),
        vm
      )
    } else if (isUndef(old)) {
      // 如果没有老的 on 上对应 key 的值，则设置当前新值
      if (isUndef(cur.fns)) {
        // 调用 createFnInvoker 创建新的包装后的执行函数
        cur = on[name] = createFnInvoker(cur)
      }
      // 添加事件
      // add 定义位置1：src/core/instance/events.js
      // add 定义位置2：src/platforms/web/runtime/modules/events.js
      add(event.name, cur, event.once, event.capture, event.passive)
    } else if (cur !== old) {
      // 如果新老事件绑定有变化，则直接更新 old.fns 即可
      // 因为上面初始化时，createFnInvoker 函数包装过的函数内部会直接执行函数的 fns
      old.fns = cur
      on[name] = old
    }
  }
  // 如果旧的 on 事件对象中存在，但是当前 on 对象中已经不存在了，说明已经不需要调用此回调了，则遍历移除事件监听
  for (name in oldOn) {
    if (isUndef(on[name])) {
      event = normalizeEvent(name)
      remove(event.name, oldOn[name], event.capture)
    }
  }
}
