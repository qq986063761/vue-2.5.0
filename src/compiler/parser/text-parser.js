/* @flow */

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

const defaultTagRE = /\{\{((?:.|\n)+?)\}\}/g
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

// 解析文本，文本中可能存在表达式
export function parseText (
  text: string,
  delimiters?: [string, string]
): string | void {
  // 构造正则，如果传入了分隔符（delimiters），则调用 buildRegex 方法构造正则表达式，否则用默认正则表达式 defaultTagRE
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
  if (!tagRE.test(text)) {
    return
  }
  const tokens = []
  let lastIndex = tagRE.lastIndex = 0
  let match, index

  // 用正则匹配文本内容，比如 {{item}}:{{index}} 分隔符是 : 
  // 则第一个 match 数据就是 ['{{item}}', 'item']
  while ((match = tagRE.exec(text))) {
    // 索引从 0 开始
    index = match.index
    // 对文本中非表达式的部分进行处理
    // 比如 {{item}}:{{index}} 中间的冒号不是表达式，这样上面匹配到的分隔符之外的下一个部分是 {{index}}，index 就会是 1 了，大于 lastIndex
    // 就说面前面还有一段非表达式的纯文本部分
    if (index > lastIndex) {
      // 截取这段纯文本部分 push 到 tokens 中保存
      tokens.push(JSON.stringify(text.slice(lastIndex, index)))
    }
    // 调用 parseFilters 解析 filters，获取最终的表达式，一般情况没有 filters 就直接是表达式
    // 比如：{{item}} 中 exp 解析出来就是 item
    const exp = parseFilters(match[1].trim())
    // 添加表达式到 tokens 中
    tokens.push(`_s(${exp})`)
    // 推进索引到文本中匹配到的下一个段落
    // 比如 {{item}}:{{index}} 中匹配到 {{item}} 和 中间的冒号，然后下一个位置就从 {{index}} 开始继续循环匹配表达式
    lastIndex = index + match[0].length
  }

  // 如果 lastIndex 还小于文本长度，则说明后面还有部分文本，则截取后 push 到 tokens 中保存
  if (lastIndex < text.length) {
    tokens.push(JSON.stringify(text.slice(lastIndex)))
  }

  // 返回 tokens 中的完整表达式字符串
  // 比如 {{item}}:{{index}} 解析到这里返回就是 _s(item)+':'+_s(index)
  return tokens.join('+')
}
