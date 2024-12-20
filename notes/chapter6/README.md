# chapter6 原始值的响应式方案

- [x] 引入 ref 的概念
- [x] 响应丢失问题
- [x] 自动脱 ref
- [x] 总结
  
> ⚠️ 注意：原始值指的是 Boolean、Number、String、BigInt、Symbol、undefined 和 null 等类型的值。

### 一、引入 ref 的概念

为了实现对原始值的拦截，把原始值包裹起来，但这样做会导致两个问题：
1. 用户为了创建一个响应式的原始值，不得不顺带创建一个包裹对象；
2. 包裹对象由用户定义，意味着不规范。用户可以随便命名，例如：wrapper.value 或 wrapper.val 都是可以的。

为了解决上述两个问题：
1. 封装一个函数，将包裹对象的创建工作都封装到该函数中。
2. 给 ref 增加一个不可枚举也不可写的属性 `__v_isRef`，来表示一个数据是否为 ref。

### 二、响应丢失问题

+ **问题描述**：在 Vue.js 组件中，通常将响应式数据暴露在模板中，修改响应式数据，摸板没有重新渲染。
+ **原因分析**：一般暴露方式是使用展开运算符(...)，展开运算符得到的新对象是普通对象，不具有响应性，造成响应性丢失。
+ **解决方案**：将响应式数据转换成类似于 ref 结构的数据。

### 三、自动脱 ref

+ **前提情景**：toRefs 将响应式数据的第一层属性值转换成 ref，在模板访问数据时，需要通过 value 属性才能访问值，造成用户的心智负担。
+ **概念分析**：为了解决上面问题，需要实现自动脱 ref 能力，即如果读取的属性是一个 ref，则直接将该 ref 对应的 value 属性值返回。对应地，设置属性的值也应该有自动为 ref 设置值的能力。
+ **应用场景**：在 Vue.js 组件中 setup 方法 return 返回对象时，就会将这个对象传递给 proxyRefs 函数进行处理，所以模板访问 ref 的值无需通过 value 属性来访问。
