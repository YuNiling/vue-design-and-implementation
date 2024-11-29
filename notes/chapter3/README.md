# chapter3 Vue.js3的设计思路

- 虚拟DOM：用来描述真实DOM的普通Javascript对象
- 渲染器：把虚拟DOM对象渲染为真实DOM元素
- 组件：一组虚拟DOM元素的封装
- 模板的工作原理：模版内容通过编译器编译成渲染函数，渲染函数返回的虚拟DOM通过渲染器渲染为真实DOM