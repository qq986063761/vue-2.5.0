/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// 一些平台模块和基本模块
// platformModules 中包含 attrs, klass, events, domProps, style, transition 相关 hook
// baseModules 中包含 ref, directives 相关的 hook
const modules = platformModules.concat(baseModules)

// 创建最终的 patch 函数
export const patch: Function = createPatchFunction({ nodeOps, modules })
