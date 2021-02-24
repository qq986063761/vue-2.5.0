/* @flow */

import { warn } from './debug'
import { observe, observerState } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
};

// 检查 props 的合法性
export function validateProp (
  key: string,
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {
  // 获取属性配置
  const prop = propOptions[key]
  // 判断父组件是否传入了 props 对应属性值
  // propsData 中没有对应配置的 key 值说明不存在
  const absent = !hasOwn(propsData, key)
  // 获取父组件传入的 props 值
  let value = propsData[key]
  // 针对 boolean 类型的 props 值做处理
  if (isType(Boolean, prop.type)) {
    // 如果父组件没有传递对应 props key 的值，且自己没有定义 default props，则默认 false
    if (absent && !hasOwn(prop, 'default')) {
      value = false
    } else if (!isType(String, prop.type) && (value === '' || value === hyphenate(key))) {
      // 如果不是 string 类型，且父组件传递了 '' 或者是值和key的连字符形式相等，则默认给 true
      value = true
    }
  }
  // 如果父组件没有传递 props 值
  if (value === undefined) {
    // 获取子组件内 props 配置的默认值
    value = getPropDefaultValue(vm, prop, key)
    // 这里获取的默认值是一个新值，应该要定义响应式
    // 所以这里获取之前的 observerState.shouldConvert 值，然后设置为 true 后
    // 调用 observe(value) 让内部可以定义数据的响应式
    const prevShouldConvert = observerState.shouldConvert
    observerState.shouldConvert = true
    observe(value)
    // 恢复之前的 observerState.shouldConvert 状态
    observerState.shouldConvert = prevShouldConvert
  }
  // 如果是开发模式，则调用 assertProp 判断 props 的合法性
  if (process.env.NODE_ENV !== 'production') {
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * 获取 props 的 default 默认配置值
 */
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // 如果没有配置默认值，则返回 undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default
  // 如果默认值是对象或者数组，则警告需要通过函数返回值，这里应该是为了避免数据污染，保证数据的独立性
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    )
  }
  // 如果父组件没有传递 props 值，且之前有缓存的 vm._props[key] 值，则直接返回旧值，避免触发更新
  if (vm && vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }

  // 如果默认值定义的值是函数，但是 props 配置类型不是函数，则调用默认值对应函数获取结果，否则直接返回默认值
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * 断言 props 传值的合法性
 */
function assertProp (
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  // 如果是必填，但是父组件没有传递 props key，则警告
  if (prop.required && absent) {
    warn(
      'Missing required prop: "' + name + '"',
      vm
    )
    return
  }
  if (value == null && !prop.required) {
    return
  }
  let type = prop.type
  let valid = !type || type === true
  const expectedTypes = []
  if (type) {
    // 如果 prop.type 不是数组，比如 type: Boolean 这种单类型配置，则转化为数组
    if (!Array.isArray(type)) {
      type = [type]
    }
    // 根据配置的类型，和传递的 value 获取期望类型是否满足的结果对象
    //  && !valid 的判断表示只要其中存在满足条件的类型则跳出 for 循环
    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i])
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }

  // 如果一个都不满足，则警告不满足类型
  if (!valid) {
    warn(
      `Invalid prop: type check failed for prop "${name}".` +
      ` Expected ${expectedTypes.map(capitalize).join(', ')}` +
      `, got ${toRawType(value)}.`,
      vm
    )
    return
  }

  // 如果配置了 props 的 validator 属性，则判断不满足 validator 内逻辑的情况就警告
  const validator = prop.validator
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

// 判断值是否符合期望的类型预期
function assertType (value: any, type: Function): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  const expectedType = getType(type)
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)
  } else {
    valid = value instanceof type
  }
  return {
    valid,
    expectedType
  }
}

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
function getType (fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}

function isType (type, fn) {
  if (!Array.isArray(fn)) {
    return getType(fn) === getType(type)
  }
  for (let i = 0, len = fn.length; i < len; i++) {
    if (getType(fn[i]) === getType(type)) {
      return true
    }
  }
  /* istanbul ignore next */
  return false
}
