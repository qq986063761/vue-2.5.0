/* @flow */

import { parseText } from 'compiler/parser/text-parser'
import {
  getAndRemoveAttr,
  getBindingAttr,
  baseWarn
} from 'compiler/helpers'

// 解析扩展节点内容
function transformNode (el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn
  // 获取静态 class 属性
  const staticClass = getAndRemoveAttr(el, 'class')

  if (process.env.NODE_ENV !== 'production' && staticClass) {
    // 纯 class 的值不能有值是表达式的情况
    const expression = parseText(staticClass, options.delimiters)
    if (expression) {
      warn(
        `class="${staticClass}": ` +
        'Interpolation inside attributes has been removed. ' +
        'Use v-bind or the colon shorthand instead. For example, ' +
        'instead of <div class="{{ val }}">, use <div :class="val">.'
      )
    }
  }

  // 追加静态类名到 ast 元素中
  if (staticClass) {
    el.staticClass = JSON.stringify(staticClass)
  }

  // 扩展 ast 元素中 classBinding 值，也就是 :class="val" 中的 val
  const classBinding = getBindingAttr(el, 'class', false /* getStatic */)
  if (classBinding) {
    el.classBinding = classBinding
  }
}

// 生成编译代码中的 data 属性部分的代码
function genData (el: ASTElement): string {
  let data = ''
  if (el.staticClass) {
    data += `staticClass:${el.staticClass},`
  }
  if (el.classBinding) {
    data += `class:${el.classBinding},`
  }
  return data
}

export default {
  staticKeys: ['staticClass'],
  transformNode,
  genData
}
