## 声明式地描述 UI

Vue.js 3 是一个声明式的 UI 框架，意味着用户在使用 Vue.js 3 开发页面时是声明式地描述 UI 的。比如：

1. 使用与 HTML 标签一致的方式来描述 DOM 元素，例如描述一个 div 都是使用 `<div></div>`；
2. 使用与 HTML 标签一致的方式来描述属性，例如 `<div id="root"></div>`；
3. 使用 `:` 或 `v-bind` 来描述动态绑定的属性，例如 `<div :class="cls"></div>`；
4. 使用 `@` 或 `v-on` 来描述事件，例如 `<div @click="handler"></div>`；
5. 使用与 HTML 标签一致的方式来描述层级结构，例如`<div><span></span></div>`。

除了上面这种使用模板来描述 UI 之外，我们还可以用 JavaScript 对象的形式来描述：

```js
const title = {
  // 标签名称
  tag: 'h1',
  // 标签属性
  props: {
    onClick: () => handler
  },
  // 子节点
  children: [
    { tag: 'span' }
  ]
}
```

它对应的 Vue.js 模板就是：

```html
<h1 @click="handler"><span></span></h1>
```

使用 JavaScript 对象的形式来描述 UI 会更加灵活。而使用 JavaScript 对象的形式来描述 UI 的方式，就是所谓的虚拟 DOM。

正是因为虚拟 DOM 的灵活性，Vue.js 3 除了支持使用模板描述 UI 外，还支持使用虚拟 DOM 的形式。