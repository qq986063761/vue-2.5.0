/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'

function ensureCtor (comp: any, base) {
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default
  }
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

export function createAsyncPlaceholder (
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}

export function resolveAsyncComponent (
  factory: Function,
  baseCtor: Class<Component>,
  context: Component
): Class<Component> | void {
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }

  // 如果当前时刻已经加载了异步组件，则直接返回
  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  // 如果组件工厂函数定义了 contexts 则直接缓存起来
  if (isDef(factory.contexts)) {
    // already pending
    factory.contexts.push(context)
  } else {
    // 否则缓存上下文中的组件实例，用于后面调用强制更新方法
    const contexts = factory.contexts = [context]
    let sync = true

    const forceRender = () => {
      // 遍历缓存的上下文组件实例，调用 $forceUpdate 强制更新异步组件的渲染（也就是 update、render、patch 的流程）
      // 重新触发 update 之后又会回到 create-component 调用获取异步组件的函数，这时候异步组件已经生成，会在上面的流程中被返回
      for (let i = 0, l = contexts.length; i < l; i++) {
        contexts[i].$forceUpdate()
      }
    }
    
    // 创建异步组件时候用户调用的 resolve 函数，这里用 once 包装一下，保证被多次调用时，也只会执行一次避免重复获取异步组件实例
    const resolve = once((res: Object | Class<Component>) => {
      // 当用户需要加载异步组件时，缓存到 resolved 中，用于待下次进入 resolveAsyncComponent 函数时返回异步组件实例
      factory.resolved = ensureCtor(res, baseCtor)
      // 用户确认需要加载异步组件的时候，sync 已经是 false，所以会执行下面的 forceRender 强制渲染组件
      if (!sync) {
        // 用户调用后。开始渲染异步组件
        forceRender()
      }
    })

    // 创建异步组件时候用户调用的 reject 函数
    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender()
      }
    })

    // 调用用户定义的异步组件函数，让用户决定渲染组件的时机
    const res = factory(resolve, reject)

    if (isObject(res)) {
      if (typeof res.then === 'function') {
        // () => Promise
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      } else if (isDef(res.component) && typeof res.component.then === 'function') {
        res.component.then(resolve, reject)

        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          if (res.delay === 0) {
            factory.loading = true
          } else {
            setTimeout(() => {
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender()
              }
            }, res.delay || 200)
          }
        }

        if (isDef(res.timeout)) {
          setTimeout(() => {
            if (isUndef(factory.resolved)) {
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }
    
    // 把 sync 标识设置为 false，表示同步流程已经走完
    sync = false
    // 同步返回异步组件的不同状态下的元素，如果传了加载组件，则先展示 loading 组件，否则异步组件已经存在则返回组件本身
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}
