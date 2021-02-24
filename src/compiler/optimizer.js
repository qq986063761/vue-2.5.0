/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

// 
const genStaticKeysCached = cached(genStaticKeys)

// 找出所有纯静态节点树，对于纯静态树是不用更新的，就可以更新时跳过这类节点达到优化
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  isPlatformReservedTag = options.isReservedTag || no
  // 标记所有的静态、非静态节点
  markStatic(root)
  // 标记静态的根节点
  markStaticRoots(root, false)
}

// 一些静态的 key
function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs' +
    (keys ? ',' + keys : '')
  )
}

function markStatic (node: ASTNode) {
  // 判断节点是否是静态的
  node.static = isStatic(node)
  // 如果是普通的 ast 元素
  if (node.type === 1) {
    // 如果满足下面的条件，则直接结束
    if (
      !isPlatformReservedTag(node.tag) && // 如果不是平台保留标签，说明是组件
      node.tag !== 'slot' && // 不是 slot
      node.attrsMap['inline-template'] == null // 
    ) {
      return
    }

    // 遍历子节点，递归标记静态状态 markStatic
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      // 如果存在子节点不是静态的，则节点自己也不是静态的
      if (!child.static) {
        node.static = false
      }
    }

    // 如果存在条件判断
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        // 如果条件元素不是静态的，则节点自身也不是静态的
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

function markStaticRoots (node: ASTNode, isInFor: boolean) {
  // 如果是普通 ast 元素
  if (node.type === 1) {
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    
    // 如果当前节点是静态的，且存在子节点，且不是仅有一个纯文本的子节点
    // 则标记为静态根节点
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }

    // 递归子节点判断子节点是否是静态根节点
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }

    // 对条件节点判断是否是静态根
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

// 判断是否是静态的
function isStatic (node: ASTNode): boolean {
  // 表达式类型是动态的
  if (node.type === 2) {
    return false
  }
  // 纯文本是静态的
  if (node.type === 3) {
    return true
  }

  return !!(node.pre || (
    !node.hasBindings && // 不是动态 bind 数据
    !node.if && !node.for && // 不能是 v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // 不能是 vue 内置标签
    isPlatformReservedTag(node.tag) && // 可以是平台保留标签
    !isDirectChildOfTemplateFor(node) && // 不能是 v-for 指令下的子节点
    Object.keys(node).every(isStaticKey) // 满足一些静态的节点 key
  ))
}

function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
