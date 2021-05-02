/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol,
  isPromise,
  remove
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'
import { currentRenderingInstance } from 'core/instance/render'

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
  baseCtor: Class<Component>
): Class<Component> | void {
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }
  
  // 当第一次初始化异步流程后这个 resolved 已经有了，下次触发 _update 渲染的时候就会直接返回
  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  const owner = currentRenderingInstance
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending
    factory.owners.push(owner)
  }

  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  // 初始化异步组件
  if (owner && !isDef(factory.owners)) {
    // 把当前渲染实例，保存到当前工厂函数组件的 owners 中用于记录实例中需要的异步组件
    const owners = factory.owners = [owner]
    let sync = true
    let timerLoading = null
    let timerTimeout = null

    ;(owner: any).$on('hook:destroyed', () => remove(owners, owner))
    
    // 强制更新渲染 vnode
    const forceRender = (renderCompleted: boolean) => {
      // 这里遍历之前保存的每个相关实例，强制更新一下实例渲染
      for (let i = 0, l = owners.length; i < l; i++) {
        (owners[i]: any).$forceUpdate()
      }

      if (renderCompleted) {
        owners.length = 0
        if (timerLoading !== null) {
          clearTimeout(timerLoading)
          timerLoading = null
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout)
          timerTimeout = null
        }
      }
    }

    // 包装两个一次性方法到工厂函数中
    const resolve = once((res: Object | Class<Component>) => {
      // 渲染的时候，获取到组件构造器保存到 factory.resolved 中
      factory.resolved = ensureCtor(res, baseCtor)
      // 之前同步的初始化异步组件的准备工作已经完成，在渲染的时候这里肯定会进入 forceRender
      if (!sync) {
        forceRender(true)
      } else {
        owners.length = 0
      }
    })

    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender(true)
      }
    })

    const res = factory(resolve, reject)
    // 这里 res 如果是对象的话说明不是单纯的 resolve 工厂函数，可能是 promise 对象，说明是配置的 () => import() 返回的组件
    if (isObject(res)) {
      if (isPromise(res)) {
        // promise 是没有配置 resolved 的，所以这里直接调用 then
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      // 如果是更高级配置异步组件，则进入到下面逻辑
      } else if (isPromise(res.component)) {
        res.component.then(resolve, reject)
        // 出错时显示的组件
        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }
        // 加载时显示的组件
        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          // 延迟是 0 的话最后会直接返回 factory.loadingComp 组件的
          if (res.delay === 0) {
            factory.loading = true
          } else {
            timerLoading = setTimeout(() => {
              timerLoading = null
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender(false)
              }
            }, res.delay || 200)
          }
        }
        // 组件渲染的超时时间
        if (isDef(res.timeout)) {
          timerTimeout = setTimeout(() => {
            timerTimeout = null
            // 如果到了超时时间后还没有 resolved 说明异步组件初始化失败了则加载错误组件
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

    sync = false
    // return in case resolved synchronously
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}
