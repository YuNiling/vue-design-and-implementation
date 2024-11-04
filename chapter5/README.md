# chapter5 非原始值的响应式方案

- [x] 1. 理解 Proxy 和 Reflect
- [x] 2. JavaScript 对象与 Proxy 的工作原理
- [x] 3. 如何代理 Object
- [x] 4. 合理的触发响应
- [x] 5. 浅响应与深响应
- [x] 6. 只读和浅只读
- [ ] 7. 代理数组
  - [ ] 7.1 数组的索引与 length
  - [ ] 7.2 遍历数组
  - [ ] 7.3 数组的查找方法
  - [ ] 7.4 隐式修改数组长度的原型方法
- [ ] 8. 代理 Set 和 Map
  - [ ] 8.1 如何代理 Set 和 Map
  - [ ] 8.2 建立响应联系
  - [ ] 8.3 避免污染原始数据
  - [ ] 8.4 处理 forEach
  - [ ] 8.5 迭代器方法
  - [ ] 8.6 values 和 keys 方法
- [ ] 9. 总结

<br>

##### <center>表 Proxy 对象部署的所有内部方法</center>
| 内部方法                | 处理器函数                | 签名                                            | 描述                       |
|  :---                 | :---                     | :---                                           | :---                      |
| [[GetPrototypeOf]]    | getPrototypeOf           | () -> Object/Null                              | 查明为该对象提供继承属性的对象 |
| [[SetPrototypeOf]]    | setPrototypeOf           | (Object/Null) -> Boolean                       | 将该对象与提供继承属性的另一个对象相关联 |
| [[IsExtensible]]      | isExtensible             | () -> Boolean                                  | 查明是否允许向该对象添加其他属性 |
| [[PreventExtensions]] | preventExtensions        | () -> Boolean                                  | 控制能否向该对象添加新属性 |
| [[GetOwnProperty]]    | getOwnPropertyDescriptor | (propertyKey) -> Undefined/Property Descriptor | 返回该对象自身属性的描述符，其键为 propertyKey，如果不存在这样的属性，则返回 undefined |
| [[DefineOwnProperty]] | defineProperty           | (propertyKey, PropertyDescriptor) -> Boolean   | 创建或更改自己的属性，其键为 propertyKey，以其具有由 PropertyDescriptor 描述的状态 |
| [[HasProperty]]       | has                      | (propertyKey) -> Boolean                       | 返回一个布尔值，指示该对象是否已经拥有键为 propertyKey 的自己的或者继承的属性 |
| [[Get]]               | get                      | (propertyKey, receiver) -> any                 | 从该对象返回键为 propertyKey 的属性的值 |
| [[Set]]               | set                      | (propertyKey, value, receiver) -> Boolean      | 将键值为 propertyKey 的属性的值设置为 value |
| [[Delete]]            | deleteProperty           | (propertyKey) -> Boolean                       | 从该对象中删除属于自身的键为 propertyKey 的属性 |
| [[OwnPropertyKeys]]   | ownKeys                  | () -> List of propertyKey                      | 返回一个 List，其元素都是对象自身的属性键 |
| [[Call]]              | apply                    | (any, a List of any) -> any                    | 将允许的代码与 this 对象关联 |
| [[Construct]]         | construct                | (a List of any, Object) -> object              | 创建一个对象，通过 new 运算符或 super 调用触发 |