/* @flow */

import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import VNode, { cloneVNodes, createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'

// 初始化渲染需要的相关属性
export function initRender (vm: Component) {
  vm._vnode = null // the root of the child tree
  const options = vm.$options
  const parentVnode = vm.$vnode = options._parentVnode // 在父节点下的占位节点，这个节点记录的信息还是当前实例的信息
  const renderContext = parentVnode && parentVnode.context
  // 解析获取 slots 的节点，options._renderChildren 是父节点的 $children 数组
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
  vm.$scopedSlots = emptyObject
  // 提供给模版编译后的内部生成 render 使用，用于创建元素
  // 方便 createElement 内部获取到合适的上下文对象
  // 参数顺序：（a：标签名，b：自定义 data，c：子节点，d：normalizationType，alwaysNormalize）
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // 提供给用户写的 render 函数使用
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  const parentData = parentVnode && parentVnode.data

  /* istanbul ignore else */
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}

export function renderMixin (Vue: Class<Component>) {
  // 安装运行时用于 render 的一些便捷方法
  installRenderHelpers(Vue.prototype)

  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this)
  }

  // 生成 vnode
  Vue.prototype._render = function (): VNode {
    const vm: Component = this
    // 获取 options 中的 render 函数
    const { render, _parentVnode } = vm.$options

    if (vm._isMounted) {
      // 如果父节点没更新，则插槽节点将会是上次的节点，这里重新克隆节点保持最新
      for (const key in vm.$slots) {
        const slot = vm.$slots[key]
        if (slot._rendered) {
          vm.$slots[key] = cloneVNodes(slot, true /* deep */)
        }
      }
    }

    // 获取父节点的 scopedSlots，如果有作用域 slot，则可以获取到父节点的对应对象
    vm.$scopedSlots = (_parentVnode && _parentVnode.data.scopedSlots) || emptyObject

    // 存父 vnode
    vm.$vnode = _parentVnode

    let vnode
    try {
      // 调用 render 生成 vnode；render 有两个来源，一个是用户传入的 render，一个是模版编译生成的 render
      // $createElement 的作用就是 render 内部调用时生成 vnode，
      // $createElement 在 new Vue 时 _init 内部调用 initRender 时被定义
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      handleError(e, vm, `render`)
      // return error render result,
      // or previous vnode to prevent render error causing blank component
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        if (vm.$options.renderError) {
          try {
            vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e)
          } catch (e) {
            handleError(e, vm, `renderError`)
            vnode = vm._vnode
          }
        } else {
          vnode = vm._vnode
        }
      } else {
        vnode = vm._vnode
      }
    }

    // 如果没成功生成 vnode，则这里创建一个空的 vnode 避免出错
    if (!(vnode instanceof VNode)) {
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
          'should return a single root node.',
          vm
        )
      }
      vnode = createEmptyVNode()
    }

    // 设置父 vnode
    vnode.parent = _parentVnode
    return vnode
  }
}
