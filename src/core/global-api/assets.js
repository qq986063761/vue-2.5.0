/* @flow */

import config from '../config'
import { ASSET_TYPES } from 'shared/constants'
import { warn, isPlainObject } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  // 定义资源注册（components、directives、filters）的方法实现
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production') {
          // 对组件命名进行校验
          if (type === 'component' && config.isReservedTag(id)) {
            warn(
              'Do not use built-in or reserved HTML elements as component ' +
              'id: ' + id
            )
          }
        }
        // 如果组件是对象，则定义组件构造函数，否则对于异步组件，什么都不做直接返回，待动态被调用时会去创建组件
        if (type === 'component' && isPlainObject(definition)) {
          // 定义组件的 name
          definition.name = definition.name || id
          // 利用 Vue.extend 创建构造器
          definition = this.options._base.extend(definition)
        }
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        // 将组件构造器存到全局
        this.options[type + 's'][id] = definition
        
        return definition
      }
    }
  })
}
