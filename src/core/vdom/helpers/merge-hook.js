/* @flow */

import { createFnInvoker } from './update-listeners'
import { remove, isDef, isUndef, isTrue } from 'shared/util'

// 合并 vnode hook
export function mergeVNodeHook (def: Object, hookKey: string, hook: Function) {
  let invoker
  // 先获取老 hook
  const oldHook = def[hookKey]

  function wrappedHook () {
    hook.apply(this, arguments)
    // 移除合并的 hook 保证只调用一次，避免内存泄漏
    remove(invoker.fns, wrappedHook)
  }

  if (isUndef(oldHook)) {
    // 不存在老 hook，则创建一个新的执行函数
    invoker = createFnInvoker([wrappedHook])
  } else {
    if (isDef(oldHook.fns) && isTrue(oldHook.merged)) {
      // 已经合并过的 hook，直接添加到执行函数的 fns 中，执行时就会遍历调用
      invoker = oldHook
      invoker.fns.push(wrappedHook)
    } else {
      // 对于已经存在老 hook，则合并成 hook 数组创建新的执行函数
      invoker = createFnInvoker([oldHook, wrappedHook])
    }
  }

  invoker.merged = true
  def[hookKey] = invoker
}
