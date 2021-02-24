/* @flow */

import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { cached, no, camelize } from 'shared/util'
import { genAssignmentCode } from '../directives/model'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  pluckModuleFunction
} from '../helpers'

export const onRE = /^@|^v-on:/
export const dirRE = /^v-|^@|^:/
export const forAliasRE = /(.*?)\s+(?:in|of)\s+(.*)/ // v-for 表达式正则
export const forIteratorRE = /\((\{[^}]*\}|[^,]*),([^,]*)(?:,([^,]*))?\)/ // v-for 运算符正则，用于去除括号等符号

const argRE = /:(.*)$/
const bindRE = /^:|^v-bind:/
const modifierRE = /\.[^.]+/g

const decodeHTMLCached = cached(he.decode)

// configurable state
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace

type Attr = { name: string; value: string };

// 获取 ast 元素的方法
export function createASTElement (
  tag: string,
  attrs: Array<Attr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,
    tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),
    parent,
    children: []
  }
}

// 将 template 生成 ast 树
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  warn = options.warn || baseWarn

  platformIsPreTag = options.isPreTag || no
  platformMustUseProp = options.mustUseProp || no
  platformGetTagNamespace = options.getTagNamespace || no

  // 获取一些模块，用于后续调用模块中的方法
  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  delimiters = options.delimiters

  const stack = []
  const preserveWhitespace = options.preserveWhitespace !== false
  let root
  let currentParent
  let inVPre = false
  let inPre = false
  let warned = false

  function warnOnce (msg) {
    if (!warned) {
      warned = true
      warn(msg)
    }
  }

  function endPre (element) {
    // check pre state
    if (element.pre) {
      inVPre = false
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
  }

  // 解析 html 模版
  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldKeepComment: options.comments, // 是否保留注释节点

    // 处理开始标签 ast 元素创建逻辑
    start (tag, attrs, unary) {
      // check namespace.
      // inherit parent ns if there is one
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }

      // 创建 ast 元素
      let element: ASTElement = createASTElement(tag, attrs, currentParent)
      if (ns) {
        element.ns = ns
      }

      // 判断是否是被禁止的标签，比如 style、 script 这种禁止在模版中使用的
      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.'
        )
      }

      // 调用 preTransforms 预处理方法，源码在 src/platforms/web/compiler/modules/model.js
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element
      }
      
      // 和 v-pre 指令相关
      if (!inVPre) {
        // 判断元素是否包含 v-pre 指令
        processPre(element)
        if (element.pre) {
          inVPre = true
        }
      }
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }

      if (inVPre) {
        processRawAttrs(element)
      } else if (!element.processed) {
        // 构造一些指令的表达式信息 v-for、v-if 等等
        processFor(element)
        processIf(element)
        processOnce(element)
        // 扩展元素其他内容
        processElement(element, options)
      }
      
      // 检测根节点的合法性
      function checkRootConstraints (el) {
        if (process.env.NODE_ENV !== 'production') {
          // 根节点不能是 slot、template
          if (el.tag === 'slot' || el.tag === 'template') {
            warnOnce(
              `Cannot use <${el.tag}> as component root element because it may ` +
              'contain multiple nodes.'
            )
          }

          // 根节点不能是 v-for
          if (el.attrsMap.hasOwnProperty('v-for')) {
            warnOnce(
              'Cannot use v-for on stateful component root element because ' +
              'it renders multiple elements.'
            )
          }
        }
      }

      // ast 树的管理
      if (!root) {
        // 没有根结点的时候，当前元素就是根结点
        root = element
        // 检测根结点合法性
        checkRootConstraints(root)
      } else if (!stack.length) {
        // allow root elements with v-if, v-else-if and v-else
        if (root.if && (element.elseif || element.else)) {
          checkRootConstraints(element)
          addIfCondition(root, {
            exp: element.elseif,
            block: element
          })
        } else if (process.env.NODE_ENV !== 'production') {
          warnOnce(
            `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`
          )
        }
      }

      // 存在父节点，则管理 ast 树的关系
      if (currentParent && !element.forbidden) {

        if (element.elseif || element.else) {
          processIfConditions(element, currentParent)
        } else if (element.slotScope) {
          // 如果这个 ast 元素是一个作用域 slot，即存在 element.slotScope 对象名
          // 当前元素是一个 template 元素
          currentParent.plain = false
          // 获取 slot name，作用域 slot 是没有 slotTarget 的，所以这里是 default
          const name = element.slotTarget || '"default"'
          // 将当前 ast 元素，赋值到父节点的 scopedSlots 中
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
        } else {
          // 建立父子节点联系
          currentParent.children.push(element)
          element.parent = currentParent
        }
      }

      // 不是自闭合元素
      if (!unary) {
        // 当前元素赋值到 currentParent 中
        currentParent = element
        // 保存开始元素到栈中，方便结束标签时出栈处理逻辑
        // 比如 <ul><li></li></ul> 就是先入栈 ul 的 ast 元素，然后再入栈 li 的 ast 元素
        stack.push(element)
      } else {
        // 如果是自闭合元素，则直接结束
        endPre(element)
      }

      // 调用 post-transforms 模块方法
      for (let i = 0; i < postTransforms.length; i++) {
        postTransforms[i](element, options)
      }
    },

    // 处理结束标签成对的 ast 元素出栈逻辑
    end () {
      // 获取标签栈顶 ast 元素
      const element = stack[stack.length - 1]

      const lastNode = element.children[element.children.length - 1]
      if (lastNode && lastNode.type === 3 && lastNode.text === ' ' && !inPre) {
        element.children.pop()
      }

      // 标签出栈，然后切换到当前父节点（回溯过程）
      stack.length -= 1
      currentParent = stack[stack.length - 1]

      // 关闭标签元素
      endPre(element)
    },

    // 解析文本节点时被调用
    chars (text: string) {
      // 没有父节点，说明根节点存在文本，则报错
      if (!currentParent) {
        if (process.env.NODE_ENV !== 'production') {
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.'
            )
          } else if ((text = text.trim())) {
            warnOnce(
              `text "${text}" outside root element will be ignored.`
            )
          }
        }
        return
      }

      // ie 兼容
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }
      const children = currentParent.children
      
      // 对文本进行一些处理
      text = inPre || text.trim()
        // isTextTag 判断父节点是 script、style，则直接取文本，否则调用 decodeHTMLCached 进行转码
        ? isTextTag(currentParent) ? text : decodeHTMLCached(text)
        // 如果需要保留空格（空格不能直接在开始标签之后），且子节点存在，则返回一个空格
        : preserveWhitespace && children.length ? ' ' : ''
      
      // 如果文本还存在
      if (text) {
        let expression
        // 如果不在 v-pre 环境、且文本不为空，则调用 parseText 解析文本，获取文本内的最终形成的表达式
        if (!inVPre && text !== ' ' && (expression = parseText(text, delimiters))) {
          children.push({
            type: 2,
            expression,
            text
          })
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          children.push({
            type: 3,
            text
          })
        }
      }
    },

    // 添加注释节点
    comment (text: string) {
      currentParent.children.push({
        type: 3,
        text,
        isComment: true
      })
    }
  })

  // 返回根 ast 元素
  return root
}

function processPre (el) {
  // 获取属性，并移除，可能是针对库内部使用的指令
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}

function processRawAttrs (el) {
  const l = el.attrsList.length
  if (l) {
    const attrs = el.attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      attrs[i] = {
        name: el.attrsList[i].name,
        value: JSON.stringify(el.attrsList[i].value)
      }
    }
  } else if (!el.pre) {
    // non root node in pre blocks with no attributes
    el.plain = true
  }
}

export function processElement (element: ASTElement, options: CompilerOptions) {
  processKey(element)

  // 判断是否是一个普通元素，比如文本元素，就没有 attrsList
  element.plain = !element.key && !element.attrsList.length

  processRef(element) // 处理 ref
  processSlot(element) // 处理 slot
  processComponent(element) // 处理组件

  // 遍历 transforms 模块，执行模块方法
  // 源码在：src/platforms/web/compiler/modules/style.js 和 class.js 中分别有一个方法
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }

  // 处理 attrs
  processAttrs(element)
}

function processKey (el) {
  const exp = getBindingAttr(el, 'key')
  if (exp) {
    if (process.env.NODE_ENV !== 'production' && el.tag === 'template') {
      warn(`<template> cannot be keyed. Place the key on real elements instead.`)
    }
    el.key = exp
  }
}

function processRef (el) {
  const ref = getBindingAttr(el, 'ref')
  if (ref) {
    el.ref = ref
    el.refInFor = checkInFor(el)
  }
}

// 解析 v-for 获取表达式
export function processFor (el: ASTElement) {
  let exp
  // 通过属性获取表达式
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    // 通过正则匹配到内容
    const inMatch = exp.match(forAliasRE)
    if (!inMatch) {
      process.env.NODE_ENV !== 'production' && warn(
        `Invalid v-for expression: ${exp}`
      )
      return
    }
    // 获取 v-for 指令中 in、of 后面的内容 如：(item,index) in data 中的 data
    el.for = inMatch[2].trim()

    // 去掉 v-for 中 (item,index) 两边空格
    const alias = inMatch[1].trim()
    // 去掉操作符匹配到相关数据，如 ['(item,index)', 'item', 'index', undefined] 这类
    const iteratorMatch = alias.match(forIteratorRE)
    // 移除运算符之后，获取 item、index、key 等属性，扩展到 el 节点中保存
    if (iteratorMatch) {
      // 获取到 item
      el.alias = iteratorMatch[1].trim() 
      // 获取到 index
      el.iterator1 = iteratorMatch[2].trim()
      // 如果存在第三个操作符，如 for in 中的 key
      if (iteratorMatch[3]) {
        // 获取第三个操作变量
        el.iterator2 = iteratorMatch[3].trim()
      }
    } else {
      el.alias = alias
    }
  }
}

// 解析 v-if 获取表达式
function processIf (el) {
  // 获取 v-if 表达式，然后从 attrsList 中删掉对应指令
  const exp = getAndRemoveAttr(el, 'v-if')
  
  if (exp) {
    // 保存表达式到 if 属性中
    el.if = exp
    // 添加 if 条件到条件数组中，可能有多个条件
    // 一个条件： exp、block 的组合，exp 是条件，el是满足条件后显示的元素
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    }
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) {
      el.elseif = elseif
    }
  }
}

function processIfConditions (el, parent) {
  const prev = findPrevElement(parent.children)
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `v-${el.elseif ? ('else-if="' + el.elseif + '"') : 'else'} ` +
      `used on element <${el.tag}> without corresponding v-if.`
    )
  }
}

function findPrevElement (children: Array<any>): ASTElement | void {
  let i = children.length
  while (i--) {
    if (children[i].type === 1) {
      return children[i]
    } else {
      if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
          `will be ignored.`
        )
      }
      children.pop()
    }
  }
}

// 添加 v-if 指令条件，扩展到 ast 元素中
export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  el.ifConditions.push(condition)
}

function processOnce (el) {
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}

function processSlot (el) {
  // slot 只会出现在子组件中，父节点不会进入这个逻辑
  if (el.tag === 'slot') {
    // 获取子组件的 slot 的 name 属性
    el.slotName = getBindingAttr(el, 'name')
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
        `and can possibly expand into multiple elements. ` +
        `Use the key on a wrapping element instead.`
      )
    }
  } else {
    let slotScope
    // 作用域 slot
    if (el.tag === 'template') {
      // 获取老版本中的作用域 slot 属性值
      slotScope = getAndRemoveAttr(el, 'scope')
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && slotScope) {
        warn(
          `the "scope" attribute for scoped slots have been deprecated and ` +
          `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
          `can also be used on plain elements in addition to <template> to ` +
          `denote scoped slots.`,
          true
        )
      }
      // 老版本的 scope 不存在，则获取新版本的 slot-scope 属性值
      // el.slotScope 也就是用户定义的作用域 slot 的对象名
      el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
    } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
      el.slotScope = slotScope
    }

    // 获取 slot 属性的值
    const slotTarget = getBindingAttr(el, 'slot')
    if (slotTarget) {
      // 追加 slotTarget
      el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget
      // 如果不是作用域 slot，则给 ast 元素添加属性 slot
      if (!el.slotScope) {
        addAttr(el, 'slot', slotTarget)
      }
    }
  }
}

function processComponent (el) {
  let binding
  if ((binding = getBindingAttr(el, 'is'))) {
    el.component = binding
  }
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true
  }
}

// 处理元素 attrs 内容
function processAttrs (el) {
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, isProp
  // 遍历属性列表
  for (i = 0, l = list.length; i < l; i++) {
    // 获取属性名，比如 v-model、@click 等
    name = rawName = list[i].name
    // 获取属性绑定值
    value = list[i].value
    // 如果 name 满足 v-、@、: 开头的指令属性
    if (dirRE.test(name)) {
      // 标记元素是存在动态绑定内容的
      el.hasBindings = true
      // 解析修饰符，如 .native 等等
      modifiers = parseModifiers(name)
      if (modifiers) {
        name = name.replace(modifierRE, '')
      }
      // 满足 v-bind 指令的属性名
      if (bindRE.test(name)) { 
        name = name.replace(bindRE, '')
        value = parseFilters(value)
        isProp = false
        if (modifiers) {
          if (modifiers.prop) {
            isProp = true
            name = camelize(name)
            if (name === 'innerHtml') name = 'innerHTML'
          }
          if (modifiers.camel) {
            name = camelize(name)
          }
          if (modifiers.sync) {
            addHandler(
              el,
              `update:${camelize(name)}`,
              genAssignmentCode(value, `$event`)
            )
          }
        }
        if (isProp || (
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          addProp(el, name, value)
        } else {
          addAttr(el, name, value)
        }
      } else if (onRE.test(name)) {
        // 匹配到 v-on、@ 指令，先去掉指令部分
        name = name.replace(onRE, '')
        // 然后追加 handler 相关回调数据（扩展 ast 元素的 events 中的相关属性）
        addHandler(el, name, value, modifiers, false, warn)
      } else {
        // 匹配其他普通指令，比如用户自定义指令等
        name = name.replace(dirRE, '')
        // parse arg
        const argMatch = name.match(argRE)
        const arg = argMatch && argMatch[1]
        if (arg) {
          name = name.slice(0, -(arg.length + 1))
        }

        // 给 ast 元素添加指令相关属性
        // rawName 是原始指令，如 v-model
        // name 是去掉标识之后的属性名，比如 model
        addDirective(el, name, rawName, value, arg, modifiers)

        // 检测 v-model 合法性，比如不能在 v-for 中直接将数组元素绑定到 v-model 上
        if (process.env.NODE_ENV !== 'production' && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // literal attribute
      if (process.env.NODE_ENV !== 'production') {
        const expression = parseText(value, delimiters)
        if (expression) {
          warn(
            `${name}="${value}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.'
          )
        }
      }
      addAttr(el, name, JSON.stringify(value))
    }
  }
}

function checkInFor (el: ASTElement): boolean {
  let parent = el
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent
  }
  return false
}

function parseModifiers (name: string): Object | void {
  const match = name.match(modifierRE)
  if (match) {
    const ret = {}
    match.forEach(m => { ret[m.slice(1)] = true })
    return ret
  }
}

function makeAttrsMap (attrs: Array<Object>): Object {
  const map = {}
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== 'production' &&
      map[attrs[i].name] && !isIE && !isEdge
    ) {
      warn('duplicate attribute: ' + attrs[i].name)
    }
    map[attrs[i].name] = attrs[i].value
  }
  return map
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag (el): boolean {
  return el.tag === 'script' || el.tag === 'style' 
}

function isForbiddenTag (el): boolean {
  return (
    el.tag === 'style' ||
    (el.tag === 'script' && (
      !el.attrsMap.type ||
      el.attrsMap.type === 'text/javascript'
    ))
  )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
function guardIESVGBug (attrs) {
  const res = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '')
      res.push(attr)
    }
  }
  return res
}

function checkForAliasModel (el, value) {
  let _el = el
  while (_el) {
    // 不能在 v-for 中直接将数组元素绑定到 v-model 上
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
        `You are binding v-model directly to a v-for iteration alias. ` +
        `This will not be able to modify the v-for source array because ` +
        `writing to the alias is like modifying a function local variable. ` +
        `Consider using an array of objects and use v-model on an object property instead.`
      )
    }
    _el = _el.parent
  }
}
