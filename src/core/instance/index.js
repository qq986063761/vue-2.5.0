import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// vue 构造函数，参数 options 就是我们传入的包含 el、template、data、methods 等属性的配置对象
function Vue (options) {
  // 禁止不使用 new，就调用 Vue 函数
  // 所以如果我们碰到这种提示，就知道具体是我们代码的什么原因导致的
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // _init 方法在下面 initMixin 函数中定义
  this._init(options)
}

initMixin(Vue) // 定义 _init 方法，此方法用于 vue 初始化
stateMixin(Vue) // 定义 $set、$delete 等原型方法
eventsMixin(Vue) // 定义 $on、$once、$off、$emit 等事件相关原型方法
lifecycleMixin(Vue) // 定义 _update、$forceUpdate、$destroy 等生命周期相关原型方法
renderMixin(Vue) // 定义 $nextTick、_render 等渲染相关的原型方法

export default Vue
