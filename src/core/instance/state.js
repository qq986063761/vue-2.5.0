/* @flow */

import config from '../config'
import Dep from '../observer/dep'
import Watcher from '../observer/watcher'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  observerState,
  defineReactive
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

// 代理对象的 key get set
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 初始化状态，主要是对 props、methods、data、computed、watch 属性的一个初始化
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  // 初始化 props，对 props 合法性进行检查、以及将 props 上的 key 代理到实例上直接可被访问
  if (opts.props) initProps(vm, opts.props)
  // 初始化 methods
  if (opts.methods) initMethods(vm, opts.methods)

  // 如果定义了 data 属性则初始化 data
  if (opts.data) {
    initData(vm)
  } else {
    // 如果没有定义 data 属性，则初始化 vm._data 空对象
    observe(vm._data = {}, true /* asRootData */)
  }

  // 初始化 computed
  if (opts.computed) initComputed(vm, opts.computed)
  // 初始化 watch
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

/**
 * 初始化 props
 * @param {object} propsOptions 实例自身 props 配置
 */
function initProps (vm: Component, propsOptions: Object) {
  // 获取父组件中传递给子组件的 props 数据
  const propsData = vm.$options.propsData || {}
  // 定义 vm._props 用于保存父组件传递的 props 数据
  const props = vm._props = {}
  // 定义 keys 数组用于缓存 props 的 key
  const keys = vm.$options._propKeys = []
  // 没有 $parent 说明已经没有父组件了，自己就是根实例
  const isRoot = !vm.$parent
  // root instance props should be converted
  observerState.shouldConvert = isRoot

  // 遍历自身 props 配置的 key
  for (const key in propsOptions) {
    // 追加 key 到缓存变量中
    keys.push(key)
    // 校验 key 的合法性
    const value = validateProp(key, propsOptions, propsData, vm)
    // 开发模式下，对不规范的 props 传值进行警告
    if (process.env.NODE_ENV !== 'production') {
      // 转换 key 为连字符形式
      const hyphenatedKey = hyphenate(key)
      // 如果是内部保留属性，则警告不能使用这类 key
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }

      // 定义响应式监听 props 值变化，避免子组件内部直接修改 props 值
      defineReactive(props, key, value, () => {
        if (vm.$parent && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      // 定义 key value 到 props 上
      defineReactive(props, key, value)
    }

    // 将 vm._props 上的属性，代理到实例上
    // 实现直接从实例上访问 key 就相当于访问 vm._props[key]
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }

  // 恢复 shouldConvert 为 true，让其他响应式数据更新后能重新定义新数据的响应式
  observerState.shouldConvert = true
}

function initData (vm: Component) {
  let data = vm.$options.data
  // 获取 data，挂到 vm._data 上
  // 这里 data 在我们平时用脚手架开发中其实都是定义的函数，所以也存在 function 类型
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  // 不是对象则报错警告
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  
  // 下面的流程就是对 data 的属性做一个代理
  // 让直接访问 this.prop 的时候，相当于访问 this._data.prop
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      // 如果 methods 中存在 data 同名属性则报错
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    // 如果 props 中存在 data 同名属性则报错
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 如果不是保留属性，则将 data 的 key 挂到私有变量 _data 上
      proxy(vm, `_data`, key)
    }
  }
  // 对 data 进行监听
  observe(data, true /* asRootData */)
}

function getData (data: Function, vm: Component): any {
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  }
}

// 通用的计算属性配置项
const computedWatcherOptions = { lazy: true }

function initComputed (vm: Component, computed: Object) {
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  // 拿到用户定义的计算属性配置
  for (const key in computed) {
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // 创建计算属性的 watcher 对象，传入用户写的计算属性 getter，用于待需要的时候调用更新数据
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // vm实例中没有的计算属性key，对其定义到实例上，方便访问
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      // 如果已经存在相同属性，则报错警告
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()
  // 如果用户定义计算属性值是函数，则设置计算属性的 get
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : userDef
    sharedPropertyDefinition.set = noop
  } else {
    // 否则用户定义了计算属性 get、set，则直接用用户定义的 get、set
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : userDef.get
      : noop
    sharedPropertyDefinition.set = userDef.set
      ? userDef.set
      : noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      // 调用计算属性的 watcher.evaluate 获取数据，dirty 在第一次获取值时是 true，会调用一次
      if (watcher.dirty) {
        watcher.evaluate()
      }
      // 收集当前相关的渲染 watcher，用于计算属性更新时，通知相关视图
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      // 做一些methods的警告处理
      if (methods[key] == null) {
        warn(
          `Method "${key}" has an undefined value in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    // 将methods中的方法挂到vm实例上，方便直接访问
    vm[key] = methods[key] == null ? noop : bind(methods[key], vm)
  }
}

function initWatch (vm: Component, watch: Object) {
  // 为每个 watch 的 key 创建 watcher 对象用于监听
  for (const key in watch) {
    const handler = watch[key]
    // 因为定义的 watch 值可以是数组
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher (
  vm: Component,
  keyOrFn: string | Function,
  handler: any,
  options?: Object
) {
  // 如果 handler 配置是一个对象，则说明存在复杂的 watch 配置（比如deep等其他配置项），则获取真正的handler函数（触发回调）
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  // 如果是字符串，则直接使用用户定义的方法作为触发回调
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  // 调用$watch方法进行监听
  return vm.$watch(keyOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function (newData: Object) {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    // 如果 watch 值是对象，则说明存在复杂配置，则递归调用createWatcher进行处理
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    // 标记为用户定义的 watch 数据
    options = options || {}
    options.user = true

    // 创建 watcher
    const watcher = new Watcher(vm, expOrFn, cb, options)
    
    // 如果定义了 immediate 属性，则立即调用一次回调函数
    if (options.immediate) {
      cb.call(vm, watcher.value)
    }

    // 返回取消监听的方法
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
