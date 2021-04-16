/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  // 初始化 vue options
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // 每个 vue 实例的唯一 id
    vm._uid = uid++
    
    let startTag, endTag
    /* 当设置了 Vue.config.performance 为 true 时，对当前流程进行一个性能的标记，用于 Vue.js devtools 中的性能监控 */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // 定义标识，表示当前实例已经是 vue 实例
    vm._isVue = true
    
    // 如果是组件实例，则初始化组件 options
    if (options && options._isComponent) {
      initInternalComponent(vm, options)
    } else {
      // 否则合并 options 到实例的 $options 上
      vm.$options = mergeOptions(
        // 解析 vue 实例构造器内的 options 和 传入的 options 合并返回新的 options
        // 目的是从构造器中获取需要的 options 配置属性
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }
    
    // 设置代理，避免开发过程中对实例中的属性的违规定义或操作
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }

    // 暴露实例自己到 _self 上
    vm._self = vm
    // 初始化当前实例的一些生命周期相关属性，如：vm.$parent、vm.$root、vm.$children、vm._isMounted 等
    initLifecycle(vm) 
    // 初始化事件相关配置，如 vm._events 的定义、自定义 render 中配置的 on 事件对象的更新
    initEvents(vm) 
    // 初始化渲染相关配置，如 vm.$slots、vm.$scopedSlots、vm._c、vm.$createElement 等和渲染需要相关的属性、方法
    initRender(vm) 
    // 生命周期 hook，此时生命周期、事件、渲染相关的配置已经初始化完成
    callHook(vm, 'beforeCreate') 
    // 在初始化 data、props 之前，初始化 inject 配置信息，因为下面初始化 data、props 时可能需要 inject 中提供的数据
    initInjections(vm) 
    // 初始化 data、props、methods、computed、watch 等配置
    initState(vm) 
    // 在初始化 data、props 之后，初始化 provide 配置信息
    initProvide(vm) 
    // 生命周期 hook，此时响应式配置已经完成，等待 mount 中生成 vnode（虚拟dom）和渲染 dom
    callHook(vm, 'created') 

    /* 对逻辑结束时再进行一次性能的标记，通过 measure 测量当前逻辑从开始到结束的时间消耗长短来判断性能问题 */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // 如果 options 中定义了 el 属性，则直接调用 mount 挂载当前 vue 实例生成 dom 替换掉 el 属性对应 dom 元素
    if (vm.$options.el) {
      // $mount 方法主体定义在 src/platforms/web/runtime/index.js 文件中
      // $mount 的带编译版本的变体在 src/platforms/web/entry-runtime-with-compiler.js 文件中
      vm.$mount(vm.$options.el)
    }
  }
}

function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // 获取 vue 根构造函数的 options
  const opts = vm.$options = Object.create(vm.constructor.options)
  // 追加组件 options 相关的属性
  opts.parent = options.parent
  opts.propsData = options.propsData
  opts._parentVnode = options._parentVnode
  opts._parentListeners = options._parentListeners
  opts._renderChildren = options._renderChildren
  opts._componentTag = options._componentTag
  opts._parentElm = options._parentElm
  opts._refElm = options._refElm
  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

// 解析 vue 构造器中的 options 属性，最终返回一个 options
export function resolveConstructorOptions (Ctor: Class<Component>) {
  // Ctor 可能是 Vue 或者 VueComponent
  // Vue.options 内存在全局 components、directives、filters、_base（Vue构造器自身）属性
  // VueComponent.options 内存在组件构造器自身的属性，如 _Ctor（组件自身构造器）、template 等属性
  let options = Ctor.options
  // 如果存在父实例构造器，通常初始化子组件时，就会存在父组件构造器
  if (Ctor.super) {
    // 继承父实例构造器的 options 配置
    const superOptions = resolveConstructorOptions(Ctor.super)
    // 获取之前缓存的父实例的构造器 options
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // 当前新的 superOptions 如果不是之前缓存的 cachedSuperOptions，则重新更新 Ctor.superOptions
      Ctor.superOptions = superOptions
      // 检查是否构造器中是否存在变动或者附加属性，
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // 如果存在改变属性，则继承变动后的属性到 Ctor.extendOptions 中 
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      // 合并 superOptions 和 Ctor.extendOptions 到 options 中
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      // 如果 options 中存在 name，则追加一个组件 components 配置
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }

  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const extended = Ctor.extendOptions
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = dedupe(latest[key], extended[key], sealed[key])
    }
  }
  return modified
}

function dedupe (latest, extended, sealed) {
  // compare latest and sealed to ensure lifecycle hooks won't be duplicated
  // between merges
  if (Array.isArray(latest)) {
    const res = []
    sealed = Array.isArray(sealed) ? sealed : [sealed]
    extended = Array.isArray(extended) ? extended : [extended]
    for (let i = 0; i < latest.length; i++) {
      // push original options and not sealed options to exclude duplicated options
      if (extended.indexOf(latest[i]) >= 0 || sealed.indexOf(latest[i]) < 0) {
        res.push(latest[i])
      }
    }
    return res
  } else {
    return latest
  }
}
