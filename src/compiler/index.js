/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// 调用 createCompilerCreator 方法，获取 createCompiler 函数
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 生成 ast（抽象语法树，也就是一个树形 js 对象结构） 树结构
  const ast = parse(template.trim(), options)
  // 优化 ast 树
  optimize(ast, options)
  // 生成最终的代码对象
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
