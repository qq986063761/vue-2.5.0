/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // 2.6 explicit observable API
  // <T>(obj: T): T => {
  Vue.observable = obj => {
    observe(obj)
    return obj
  }

  Vue.options = Object.create(null)
  // 在 Vue.options 下创建 components、directives、filters 对象，存全局组件、指令、筛选器
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue

  // 继承内置组件，keep-alive
  extend(Vue.options.components, builtInComponents)

  initUse(Vue) // 创建 Vue.use 方法
  initMixin(Vue) // 创建 Vue.mixin 方法
  initExtend(Vue) // 创建 Vue.extend 方法
  initAssetRegisters(Vue) // 创建 Vue.component、Vue.directive、Vue.filter 方法
}
