/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * 一般定义了响应式的属性，如果更新后会重新把新值也定义为响应式
 * 如果像初始化 props，我们如果不需要在更新值后重新定义响应式，则通过 shouldConvert 设置 false 来阻止值的响应式定义
 */
export const observerState = {
  shouldConvert: true
}

// 观察者，主要用于拦截对象 getter/setter，和收集依赖以及通知 watcher 更新视图
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // 绑定在当前数据所在根 data 中的 vm 实例数量，这里的根 data 指的是一个 Observer 对象绑定的 data

  constructor (value: any) {
    // 监听的 data 数据
    this.value = value
    // 一个 observer 对象相关的依赖收集对象，在响应式的 getter 中会被父对象的 observer 调用
    this.dep = new Dep()
    this.vmCount = 0
    // 加 __ob__ 属性到传入的 data 上，表示当前对象是响应式对象
    def(value, '__ob__', this)

    if (Array.isArray(value)) {
      const augment = hasProto
        ? protoAugment
        : copyAugment
      // 重新代理数组原型方法，这样才能通过数组的方法，监听到数组的变化来通知更新视图
      augment(value, arrayMethods, arrayKeys)
      // 监听数组
      this.observeArray(value)
    } else {
      // 开始监听对象
      this.walk(value)
    }
  }

  /**
   * 对对象的每个属性的 getter/setters 进行响应式拦截
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i], obj[keys[i]])
    }
  }

  /**
   * 监听数组的每一个 item
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment an target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object, keys: any) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment an target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

// 创建观察者对象
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 非对象和 vnode 对象不进行观察
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  // 如果已经存在观察者对象，则返回已存在的对象
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    observerState.shouldConvert &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    // 创建观察者对象
    ob = new Observer(value)
  }
  
  // 如果是实例的根 data 属性，且存在观察者 ob，则 ob 的 vm 实例数量 +1
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * 给一个对象定义一个响应式属性
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 创建和每一个属性相关的依赖收集对象
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  
  // 如果当前属性是不可配置的，则直接 return
  if (property && property.configurable === false) {
    return
  }

  // 获取之前定义的 get、set 函数
  const getter = property && property.get
  const setter = property && property.set

  // 这里 shallow 表示是否不做深监听，也就是继续对当前值进行监听
  // 否则继续调用 observe(val) 对值继续深度监听
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true, // 是否可被枚举（可被遍历访问此属性）
    configurable: true, // 是否可配置当前属性的描述配置
    get: function reactiveGetter () {
      // 获取 get 的返回值
      const value = getter ? getter.call(obj) : val

      // 如果存在全局活跃的 watcher 对象，则说明当前属性值和活跃的 watcher 相关联
      if (Dep.target) {
        // 则收集依赖（ watcher 和 dep 对象互相收集）
        dep.depend()
        // 对子观察者对象的依赖进行依赖收集
        if (childOb) {
          childOb.dep.depend()
          // 如果当前值是数组，则对数据每个 item 进行依赖收集
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      // 获取原来的值
      const value = getter ? getter.call(obj) : val
      // 如果值没有改变，则不用更新
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }

      // 更新值
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      
      // 如果需要深层次监听值，则对新值进行监听
      childOb = !shallow && observe(newVal)

      // 当前属性依赖对象通知 watcher 更新组件
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (hasOwn(target, key)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * 收集依赖不能像对象一样直接进行收集，只能遍历数组对每个数组元素进行依赖收集
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
