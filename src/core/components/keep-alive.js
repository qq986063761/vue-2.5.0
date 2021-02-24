/* @flow */

import { isRegExp, remove } from 'shared/util'
import { getFirstComponentChild } from 'core/vdom/helpers/index'

type VNodeCache = { [key: string]: ?VNode };

function getComponentName (opts: ?VNodeComponentOptions): ?string {
  return opts && (opts.Ctor.options.name || opts.tag)
}

function matches (pattern: string | RegExp | Array<string>, name: string): boolean {
  if (Array.isArray(pattern)) {
    return pattern.indexOf(name) > -1
  } else if (typeof pattern === 'string') {
    return pattern.split(',').indexOf(name) > -1
  } else if (isRegExp(pattern)) {
    return pattern.test(name)
  }
  /* istanbul ignore next */
  return false
}

// 清除不符合规范的缓存节点
function pruneCache (keepAliveInstance: any, filter: Function) {
  const { cache, keys, _vnode } = keepAliveInstance
  // 遍历当前缓存对象
  for (const key in cache) {
    const cachedNode: ?VNode = cache[key]
    if (cachedNode) {
      const name: ?string = getComponentName(cachedNode.componentOptions)
      // 如果不满足 filter 方法返回的条件，则清除当前这个 key 对应的缓存
      if (name && !filter(name)) {
        pruneCacheEntry(cache, key, keys, _vnode)
      }
    }
  }
}

// 清理缓存
function pruneCacheEntry (
  cache: VNodeCache,
  key: string,
  keys: Array<string>,
  current?: VNode
) {
  const cached = cache[key]
  // 如果当前渲染的节点就是要删除的节点，则不会进入下面的 $destroy 逻辑
  if (cached && cached !== current) {
    // 销毁组件实例
    cached.componentInstance.$destroy()
  }

  // 清除缓存
  cache[key] = null
  remove(keys, key)
}

const patternTypes: Array<Function> = [String, RegExp, Array]

export default {
  name: 'keep-alive',
  abstract: true, // 抽象组件标记

  props: {
    include: patternTypes,
    exclude: patternTypes,
    max: [String, Number]
  },

  created () {
    this.cache = Object.create(null)
    this.keys = []
  },

  destroyed () {
    for (const key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },

  watch: {
    include (val: string | RegExp | Array<string>) {
      pruneCache(this, name => matches(val, name))
    },
    exclude (val: string | RegExp | Array<string>) {
      pruneCache(this, name => !matches(val, name))
    }
  },

  render () {
    // 获取默认 slots 中的第一个组件节点
    const vnode: VNode = getFirstComponentChild(this.$slots.default)
    const componentOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions
    // 如果是组件节点
    if (componentOptions) {
      // 检测组件名的合法性
      const name: ?string = getComponentName(componentOptions)
      // 如果满足匹配到的 include 或 exclude 的组件名，则直接返回节点
      // 这里返回的是不会被缓存的组件
      if (name && (
        (this.include && !matches(this.include, name)) ||
        (this.exclude && matches(this.exclude, name))
      )) {
        return vnode
      }

      const { cache, keys } = this
      const key: ?string = vnode.key == null
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        ? componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '')
        : vnode.key
      
      // 如果存在缓存节点，则直接更新 componentInstance 为缓存的组件实例
      if (cache[key]) {
        vnode.componentInstance = cache[key].componentInstance
        // 移除 key，然后 push 到最后，最后的节点表示最常访问的节点
        remove(keys, key)
        keys.push(key)
      } else {
        // 第一次渲染会缓存 vnode
        cache[key] = vnode
        keys.push(key)
        // 如果定义了 max 最大缓存组件数量，且当前缓存 keys 长度大于它，就清理缓存
        if (this.max && keys.length > parseInt(this.max)) {
          // keys[0] 是第一个节点，每次清理掉最前的不常用的节点缓存
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
      }
      
      // 将 keep-alive 包裹下的子组件 vnode 的 keepAlive 标记
      vnode.data.keepAlive = true
    }
    
    return vnode
  }
}
