# src 下的目录
- platforms：提供给不同平台的 vue 版本入口
  - 不带 template 编译器（不支持 template 属性，只支持 render）的 vue 版本入口文件：platforms\web\runtime\index.js
  - 带 template 编译器的 vue 版本入口文件：platforms\web\entry-runtime-with-compiler.js
  - patch 函数入口文件：platforms\web\runtime\patch.js
  - 编译相关入口文件：platforms\web\compiler\index.js
- core：vue 主要流程代码
  - vue 导出主要出口文件：core\index.js
  - vue 全局 api 入口文件：core\global-api\index.js
  - vue 实例 api 入口文件：core\instance\index.js
  - Observer 入口文件：core\observer\index.js
  - Watcher 入口文件：core\observer\watcher.js
  - Dep 入口文件：core\observer\dep.js
  - 组件渲染相关 api 入口文件：core\instance\lifecycle.js
  - patch 函数相关 api 入口文件：core\vdom\patch.js
- shared：公用的配置、工具等

# new Vue 流程
- new Vue() -> init -> $mount -> compile（编译 template 生成 render） -> render（创建 vnode） -> patch（生成 dom 并挂载到文档中）

# 组件 vnode 创建流程
- 父 patch -> 父 createElm -> 父 createChildren -> 子 createElm -> 子 createComponent（其中调用的 i.init hook 是在 App render 时会触发所有的子 $createElement 流程中注册的） -> 子 insert 到父元素 -> 父 insert 到根

# 合并配置的几个场景
- Vue.mixin 注入混合时会调用 mergeOptions 合并
- new Vue 入口 _init 中初始化 vm.$options 时会合并 options
- Vue.extend 中继承 Sub.options 时会调用 mergeOptions 合并继承 options

# 生命周期流程
- beforeCreate：这时候还没有 initState 所以拿不到 data 数据
- created：这时候已经 initState 完成，可以拿到 data 数据了
- beforeMount：在 $mount 中 mountComponent 的时候会调用（先父后子）
- mounted：mountComponent 结束时如果是组件根 vnode 则调用，子组件的 mounted 是在组件 vnode 的 insert hook 中调用（先子后父）
- beforeUpdate：mountComponent 中 new Watcher 中调用
- updated：
- beforeDestroy：调用 vm.$destroy 时调用
- destroyed：调用 vm.$destroy 时调用

# 响应式原理
- Observer：用于定义响应式属性
- Dep：用于关联 Observer、响应式属性 与 Watcher 的关系，响应式属性的 set 中数据变化后会通知 Watcher 更新
- Watcher：用于更新 vnode、视图、以及数据

# nextTick 实现
- 按兼容性确定使用什么方法调用下一个回调函数 Promise --> MutationObserver --> setImmediate --> setTimeout

# 编译
- parse：生成 ast 树（解析模版中的标签、属性、表达式、静态文本等等生成 ast 元素的数据）
- optimize：优化 ast 树（标记静态节点树）
- codegen：生成 render 代码

# 中文输入过程监听事件
- compositionstart、compositionend