/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

// 一个监听类，收集依赖项，监听内容发生变化就会触发回调，也用于 $watch、指令 等
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
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    // 如果是用于更新视图渲染的和生成 vnode 相关的 watcher，就和实例 _watcher 关联，并添加到实例 _watchers 数组中
    // 渲染 watcher 是在 mount 流程中创建的
    if (isRenderWatcher) {
      vm._watcher = this
    }
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // 针对计算属性等需要懒加载值的类型
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // 解析传入的更新函数赋给 getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // 有可能传入的不是函数，在 watch 配置中有可能是字符串，比如 'obj.getName' 这种，就通过路径解析出函数用于获取最终值
      this.getter = parsePath(expOrFn)
      // 如果没获取到 getter 函数，就提醒
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }

    // 初始化 watcher 后，先初始化获取一次 value
    // 如果是计算属性 this.lazy 为 true，则不会先调用 get，会在用到计算属性的地方被调用
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * 计算属性的 getter，和 data 属性的 getter 中重新收集依赖
   */
  get () {
    // 先把当前 watcher 添加到全局 watcher 数组中，并标记一下当前活跃的 watcher
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 这里如果是计算属性的话，getter 就是计算属性配置的 get 函数
      // 计算属性的 get 函数中如果有其他 data、props 中的属性，又会触发他们的 get 重新获取计算属性的依赖
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }
      // 依赖收集完成后，释放当前 watcher 恢复上一个 watcher
      popTarget()
      // 然后清理一下当前 watcher 和 所有 dep 的依赖关系
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    const id = dep.id
    // 第一次添加依赖的时候只会添加到 newDepIds newDeps 中
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () {
    // 这里第一次清除的时候 this.deps 是空的，因为每次 addDep 的时候只会添加到 newDepIds newDeps 中
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      // 这里遍历之前的每一个 dep，和当前最新的 newDepIds 进行比对，如果最新的依赖中已经没有之前的某一个依赖了，
      // 就从 dep 中移除掉当前 watcher，避免不必要的 update，比如 <div v-if="true">{{ msg }}</div><div v-else>{{ msg1 }}</div>
      // 这种场景 v-if 其实某种条件下是不用更新的，这时候之前可能要显示的时候保存了更新它的 watcher，后面不需要的时候其实需要移除 
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 清除完成后保留一下 newDepIds newDeps 到 depIds deps 中
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
   * 用户界面上的数据改变后会触发渲染 watcher 的更新
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      // 获取新值
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // 设置新值
        const oldValue = this.value
        this.value = value
        // 如果这里是用户 watcher 的话
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
   * 这里是给计算属性这种懒加载值的属性来获取值的方法
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
