/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'

// 标签中的属性正则
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// could use https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName
// but for Vue templates we can enforce a simple charset
const ncname = '[a-zA-Z_][\\w\\-\\.]*'
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
const startTagOpen = new RegExp(`^<${qnameCapture}`) // 开始标签的开头部分（不包含属性）正则
const startTagClose = /^\s*(\/?)>/  // 开始标签的关闭部分正则
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`) // 结束标签正则
const doctype = /^<!DOCTYPE [^>]+>/i
const comment = /^<!--/ // 注释节点查询正则
const conditionalComment = /^<!\[/

let IS_REGEX_CAPTURING_BROKEN = false
'x'.replace(/x(.)?/g, function (m, g) {
  IS_REGEX_CAPTURING_BROKEN = g === ''
})

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n'
}
const encodedAttr = /&(?:lt|gt|quot|amp);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#10);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

// 解析 html 模版
export function parseHTML (html, options) {
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  // 当前所在模版字符串位置索引
  let index = 0
  let last, lastTag

  // 循环处理 html 字符串，直到处理完所有内容
  while (html) {
    // 记录开始的 html 模版
    last = html
    // 未找到结束标签，或者确保不是 script,style,textarea 这类文本节点，则开始查询
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // 获取 < 开始的位置，匹配是否以标签开头
      let textEnd = html.indexOf('<')
      // 如果匹配位置是 0 则说明是以标签开头的剩余模版内容
      // 如果大于 0，则说明在 < 之前还有一段文本内容，比如 {{item}}:{{index}}<div 中 div 前的内容
      if (textEnd === 0) {
        // 如果是注释节点 comment 在头部定义了，是表示注释节点的正则
        if (comment.test(html)) {
          // 注释节点结束位置
          const commentEnd = html.indexOf('-->')
          
          // 如果需要保留注释节点，则调用参数中的 comment 方法创建注释节点
          if (commentEnd >= 0) {
            if (options.shouldKeepComment) {
              options.comment(html.substring(4, commentEnd))
            }
            // 将 html 更新为注释节点结束位置之后的字符串
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // 对于条件注释，例如 <! [if !IE]> 这种注释，就直接推进更新 html 模版跳过这种注释
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // 如果是 Doctype 节点，则直接跳过当前节点，推进更新 html 字符串
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // 匹配结束标签，比如 </li>
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          // 推进索引到结束标签之后的位置
          advance(endTagMatch[0].length)
          // 解析结束标签
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // 匹配开始标签，获取开始标签的匹配数据
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          // 处理开始标签匹配数据
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(lastTag, html)) {
            advance(1)
          }
          continue
        }
      }
      
      // 当 textEnd 大于 0 的时候，说明从剩余模版开头到这个位置之间存在一段文本
      let text, rest, next
      if (textEnd >= 0) {
        // 截取 textEnd 位置之后的内容
        // 比如 {{item}}:<{{index}}<div 中会截取到冒号之后的 < 和之后的内容，但是这个 < 可能也是纯显示文本
        rest = html.slice(textEnd)
        // 如果截取文本中存在 <，但是不属于下面任何一种节点类型的尖括号
        // 则循环查找真实标签之前的完整文本内容
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // 上述条件都不满足说明不是真正的标签中的 <
          // 则调用 indexOf 从后面的位置开始找下一个 < 位置
          next = rest.indexOf('<', 1)
          // 如果后面没有 < 了，则说明当前这段文本匹配完毕
          if (next < 0) break
          // 记录文本正确的下一个结束位置
          textEnd += next
          // 继续截取这次索引之后的文本重复检查，直到把这段文本的真实内容完整获取完成
          rest = html.slice(textEnd)
        }
        // 获取最终完整的文本内容
        text = html.substring(0, textEnd)
        // 推进索引到当前文本结束位置，也就是下一轮文本处理的开始位置
        advance(textEnd)
      }
      
      // 如果文本内容中没有 < 这种字符串之后
      // 说明当前这段标签之间的文本获取完毕，例如 <li>{{item}}:{{index}} 这段中的 {{item}}:{{index}} 部分，但不包含后面的剩余模版内容
      if (textEnd < 0) {
        text = html
        html = ''
      }
      
      // 调用外部传入的 charts 方法对剩余的文本内容进行处理
      if (options.chars && text) {
        options.chars(text)
      }
    } else {
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!--([\s\S]*?)-->/g, '$1')
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`)
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  // 将当前索引定位位置向前推进 n 个字符，调整 html 内容
  function advance (n) {
    index += n
    html = html.substring(n)
  }

  // 解析开始标签
  function parseStartTag () {
    // 通过开始标签正则匹配到开始标签结果
    const start = html.match(startTagOpen)
    // 如果匹配到满足条件的开始标签，如 <ul 通过正则匹配成 ['<ul', 'ul']
    if (start) {
      const match = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      // 继续推进 html 模版，比如匹配到 <div class="..."，就跳到 <div 之后的位置从  class="..." 开始（包含开头的空格）
      advance(start[0].length)
      let end, attr

      // 循环匹配标签中的属性内容（不是开始标签的结束位置 > 字符位置，且是属性标签），这里 attr 会是像：[' :class="bindCls"', ':class', '=', 'bindCls']
      while (!(end = html.match(startTagClose)) && (attr = html.match(attribute))) {
        // 每次匹配完属性则推进到下一个属性位置
        advance(attr[0].length)
        // 保存当前属性的匹配数据
        match.attrs.push(attr)
      }
      
      // 匹配到 > 位置（开始标签结束），也有可能是 />
      if (end) {
        // 匹配到一元自闭合标签，end[1] 将会是 / 字符
        match.unarySlash = end[1]
        // 继续推进，跳过 /> 位置
        advance(end[0].length)
        // 保存开始标签结束位置
        match.end = index
        // 返回匹配结果
        return match
      }
    }
  }

  // 处理开始标签数据
  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) {
      // 如果是 p 标签结尾，内部还包含了其他块级元素
      // 比如 <p><div></div></p>，则 w3c 规则中 会变成 <p></p><div></div><p></p>
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      
      // 如果是可以不用写结束标签就能形成元素的标签
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    // 是否是自闭合的一元标签
    const unary = isUnaryTag(tagName) || !!unarySlash

    // 开始分析 attrs 中的属性列表，重新构造 attrs 属性对象
    const l = match.attrs.length
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      // 获取属性值，途中会做一些兼容性处理
      const args = match.attrs[i]
      // hackish work around FF bug https://bugzilla.mozilla.org/show_bug.cgi?id=369778
      if (IS_REGEX_CAPTURING_BROKEN && args[0].indexOf('""') === -1) {
        if (args[3] === '') { delete args[3] }
        if (args[4] === '') { delete args[4] }
        if (args[5] === '') { delete args[5] }
      }
      const value = args[3] || args[4] || args[5] || ''
      // 重新构造 attrs 的数据结构
      attrs[i] = {
        name: args[1],
        value: decodeAttr(
          value,
          options.shouldDecodeNewlines
        )
      }
    }

    // 如果不是一元标签，则将标签数据加到 stack 中，为后续结束标签形成一对
    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs })
      // 标记当前记录的最后一个标签
      lastTag = tagName
    }
    
    // 调用参数方法 start hook 构造 ast 元素 
    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // 获取到结束标签的标签名
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
    }

    // 匹配和结束标签名相同成对的 stack 中的开始标签
    if (tagName) {
      for (pos = stack.length - 1; pos >= 0; pos--) {
        // 如果匹配到当前结束标签，和 stack 中的开始标签相同，则记录 pos 为当前位置
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // 当没有结束标签时，则本次模版编译已经完毕
      pos = 0
    }

    // 如果 pos 存在，则处理结束标签成对的开始标签的出栈处理
    if (pos >= 0) {
      // Close all the open elements, up the stack
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`
          )
        }
        // 调用外部传参的 end hook 处理标签出栈逻辑
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      // 对于 p 标签结束，则手动调用 start end 创建结束的 p 元素
      // 这里对应 p 标签内部还包含块级元素的场景
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
