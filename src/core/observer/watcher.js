/* @flow */

import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError
} from '../util/index'

import type { ISet } from '../util/index'

let uid = 0

// watcher 的作用是收集依赖，调用更新函数更新视图
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: ISet;
  newDepIds: ISet;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: Object
  ) {
    // 将 vm 实例挂在当前 watcher 上
    this.vm = vm
    // vm 实例添加当前 watcher 对象
    vm._watchers.push(this)

    // watch 的一些配置项
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }

    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // 计算属性这个标识会是 true
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    
    // 获取 getter 函数，可能是 $mount 中的 updateComponent、或计算属性中的 get
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // 传入的不是函数就解析成函数
      this.getter = parsePath(expOrFn)

      if (!this.getter) {
        this.getter = function () {}
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }

    // 如果是懒加载数据（像计算属性），则返回 undefined
    // 否则调用 get 获取值，计算属性在被访问时也会自动调用 get 获取值
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * 执行 getter，或重新收集依赖
   */
  get () {
    // 将 watcher 赋值到 Dep.target，表示当前 watcher 在激活中
    // watcher 可能是渲染 watcher、计算属性 watcher、 watch 属性的 watcher
    pushTarget(this)

    let value
    const vm = this.vm
    try {
      // 当 watcher 是数据属性的 watcher 时，调用 getter 获取 value
      // 当 watcher 是渲染组件用的 watcher 时（mount中创建），getter 是 updateComponent，没有返回值
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // 如果 watch 属性配置了 deep，则深度遍历
      if (this.deep) {
        traverse(value)
      }

      // 释放当前 Dep.target 指向的 watcher，恢复上一个 Dep.target
      popTarget()

      // 清除无关联依赖列表
      this.cleanupDeps()
    }
    return value
  }

  /**
   * 添加依赖到 watcher 中
   */
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * 清理没用的 dep
   */
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    // 如果是计算属性这类值触发的更新，则重新设置 dirty 为 true
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      // watch 属性的 watcher 可能会执行 run，也可能会 else 到下面的逻辑
      this.run()
    } else {
      // 渲染 watcher 会被推入到更新队列中待下一轮更新，包含关联的 data 属性和计算属性
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    // 当前 watcher 在活跃中，则调用 get 获取新值
    if (this.active) {
      const value = this.get()

      // 如果渲染 watcher 的 value 和新获取到的 value 不同才会更新，如果相同则不更新
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        // 调用 this.cb 更新视图
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
const seenObjects = new Set()
function traverse (val: any) {
  seenObjects.clear()
  _traverse(val, seenObjects)
}

function _traverse (val: any, seen: ISet) {
  let i, keys
  const isA = Array.isArray(val)
  if ((!isA && !isObject(val)) || !Object.isExtensible(val)) {
    return
  }
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
