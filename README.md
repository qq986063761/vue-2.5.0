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
- 父元素 patch -> createElm -> createChildren -> 进入子组件 createElm -> createComponent -> 

# 响应式原理
- 在初始化 Vue 属性时，initState 方法中开始定义响应式，initState 在文件：src\core\instance\state.js 中
- 在 Observer 中对数据进行监听，利用 dep 与 watcher 建立联系，数据更新后通知 watcher 更新 watcher 对应的组件和视图
- Watcher 在 mount 时被创建，主要用于和组件 vnode 建立联系，用于被 dep 通知更新时，能更新指定 vnode 对应的组件视图

# nextTick 的实现逻辑
- 源码位置：src/core/instance/render.js
- 按兼容性确定使用什么方法调用下一个回调函数 setImmediate --> MessageChannel --> Promise --> setTimeout

# 编译
- parse：生成 ast 树（解析模版中的标签、属性、表达式、静态文本等等生成 ast 元素的数据）
- optimize：优化 ast 树（标记静态节点树）
- codegen：生成 render 代码

# 中文输入过程监听事件
- compositionstart、compositionend