import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue (options) {
  // 必须要使用 new Vue 实例化，不能把 Vue 当函数调用
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}

initMixin(Vue) // 定义 _init 方法
stateMixin(Vue) // 定义 $set、$delete 等原型方法
eventsMixin(Vue) // 定义 $on、$once、$off、$emit 等事件相关原型方法
lifecycleMixin(Vue) // 定义 _update、$forceUpdate、$destroy 等生命周期相关原型方法
renderMixin(Vue) // 定义 $nextTick、_render 等渲染相关的原型方法

export default Vue
