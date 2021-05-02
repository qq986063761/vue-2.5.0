/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  // 注册全局资源 component directive filter
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string, // id 是定义的组件名
      definition: Function | Object
    ): Function | Object | void {
      // 这里的 definition 就是类似 { template: '', data(){return {}}, methods: {} } 这种传入的对象
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        // 检查组件名是否合法
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }
        // 组件会通过 Vue.extend 获取组件构造器
        if (type === 'component' && isPlainObject(definition)) {
          definition.name = definition.name || id
          definition = this.options._base.extend(definition)
        }
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        // 如果是组件的话，会将资源保存到 Vue.options.components 中或者是实例的 options.components 中做全局组件或内部组件
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
