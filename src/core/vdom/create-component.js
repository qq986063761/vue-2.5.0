/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

// 元素patch过程中，vnode将会调用到的一些hook
const componentVNodeHooks = {
  init (
    vnode: VNodeWithData,
    hydrating: boolean,
    parentElm: ?Node,
    refElm: ?Node
  ): ?boolean {
    // 没有实例、或者已经被销毁，则重新初始化
    if (!vnode.componentInstance || vnode.componentInstance._isDestroyed) {
      // 初始化组件实例
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance,
        parentElm,
        refElm
      )

      // 渲染组件
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    } else if (vnode.data.keepAlive) {
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      // 如果是 keep-alive 组件，则重新更新激活组件
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    }
  },

  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    // 获取组件实例，可以是 keep-alive 的激活组件的实例
    const child = vnode.componentInstance = oldVnode.componentInstance
    // 更新子组件
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },

  insert (vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    
    // 对于普通组件
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }

    // 对于 keep-alive 组件
    if (vnode.data.keepAlive) {
      // 如果已经 mounted 过，则调用 queueActivatedComponent
      // 否则调用 activateChildComponent 激活内部包含的组件
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy()
      } else {
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

const hooksToMerge = Object.keys(componentVNodeHooks)

// 创建组件 vnode
export function createComponent (
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | void {
  if (isUndef(Ctor)) {
    return
  }

  // 这个构造器就是 Vue
  const baseCtor = context.$options._base

  // 如果 Ctor 是一个组件的配置对象，如：{props, template}
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor)
  }

  // 如果这里 Ctor 还不是一个构造函数，或者异步组件的工厂函数
  if (typeof Ctor !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // 异步组件创建逻辑
  let asyncFactory
  // 异步组件只定义了一个工厂函数，所以不会有 cid
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor
    // 获取异步组件构造函数
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor, context)
    // 如果解析异步组件时，组件还没生成，或者没有定义 loading 等过渡组件，则先创建占位的异步组件
    if (Ctor === undefined) {
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // 处理组件构造函数的 options，比如像合并父组件构造函数中一些需要继承的配置
  resolveConstructorOptions(Ctor)

  // 如果存在组件 v-model 信息，则处理组件的 model
  if (isDef(data.model)) {
    transformModel(Ctor.options, data)
  }

  // extract props
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // functional component
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // 对于组件，提取组件的自定义 on 事件定义
  const listeners = data.on
  // 然后先更新 nativeOn 到 on 上获取原生事件
  data.on = data.nativeOn

  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // 合并 vnode 的 hook
  mergeHooks(data)

  // return a placeholder vnode
  const name = Ctor.options.name || tag
  
  // 创建组件 vnode，listeners 就是用户自定义的事件
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  return vnode
}

export function createComponentInstanceForVnode (
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state
  parentElm?: ?Node,
  refElm?: ?Node
): Component {
  const vnodeComponentOptions = vnode.componentOptions
  const options: InternalComponentOptions = {
    _isComponent: true,
    parent,
    propsData: vnodeComponentOptions.propsData,
    _componentTag: vnodeComponentOptions.tag,
    _parentVnode: vnode,
    _parentListeners: vnodeComponentOptions.listeners,
    _renderChildren: vnodeComponentOptions.children,
    _parentElm: parentElm || null,
    _refElm: refElm || null
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  
  // 创建组件实例，这时候相当于重新调用 new Vue 创建组件实例
  return new vnodeComponentOptions.Ctor(options)
}

function mergeHooks (data: VNodeData) {
  if (!data.hook) {
    data.hook = {}
  }
  // hooksToMerge 也就是上面 componentVNodeHooks 的 keys 数组
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    // 先获取父vnode的对应hook
    const fromParent = data.hook[key]
    // 再获取当前vnode需要的hook
    const ours = componentVNodeHooks[key]
    // 生成最终的hook函数
    data.hook[key] = fromParent ? mergeHook(ours, fromParent) : ours
  }
}

function mergeHook (one: Function, two: Function): Function {
  return function (a, b, c, d) {
    // 先调用自身vnode的hook
    one(a, b, c, d)
    // 再调用父vnode的同类hook
    two(a, b, c, d)
  }
}

// 将组件 v-model 的信息处理成符合 vue 运行的属性
function transformModel (options, data: any) {
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
  // 扩展 props 的 value 属性，形成组件 v-model 的 props 条件
  ;(data.props || (data.props = {}))[prop] = data.model.value
  // 扩展 input 事件，形成组件 v-model 的 event 条件
  const on = data.on || (data.on = {})
  if (isDef(on[event])) {
    on[event] = [data.model.callback].concat(on[event])
  } else {
    on[event] = data.model.callback
  }
}
