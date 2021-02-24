/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'

let uid = 0

/**
 * 关联 Observer 中的 data 与 wathcer 之间的类，用于在数据更新时，去通知 watcher 更新视图
 */
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    this.subs = []
  }

  addSub (sub: Watcher) {
    // 添加 watcher 对象到收集数组中
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  // 收集依赖
  depend () {
    // Dep.target 是当前活跃中的 watcher 对象
    // Dep.target 会在 watcher 对应的组件 vm 需要更新的时候被设置
    if (Dep.target) {
      // 将自己添加到激活的 watcher 对象的依赖数组中
      Dep.target.addDep(this)
    }
  }

  // 遍历自己的 watcher 列表去更新组件
  notify () {
    const subs = this.subs.slice()
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// the current target watcher being evaluated.
// this is globally unique because there could be only one
// watcher being evaluated at any time.
Dep.target = null
const targetStack = []

export function pushTarget (_target: Watcher) {
  if (Dep.target) targetStack.push(Dep.target)
  Dep.target = _target
}

export function popTarget () {
  Dep.target = targetStack.pop()
}
