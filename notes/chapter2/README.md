# chapter2 框架设计的核心要素

- [x] 1. 提升用户的开发体验
- [x] 2. 框架框架代码的体积
- [x] 3. 框架要做到良好的 Tree-Shaking
- [x] 4. 框架应该输出怎样的构建产物
- [x] 5. 特性开关
- [x] 6. 错误处理
- [x] 7. 良好的 Typescript 类型支持
- [x] 8. 总结

### 一、提升用户的开发体验

在框架设计和开发过程中，提供友好的警告信息至关重要。始终提供友好的告警信息不仅能够帮助用户快速定位问题，节省用户的时间，还能让框架收获良好的口碑，让用户认可框架的专业性。

### 二、框架框架代码的体积

框架的大小也是衡量框架的标准之一。在实现统一功能的情况下，当然是用的代码越少越好，这样体积就会越小，最后浏览器加载资源的时间也就越少。

Vue.js 在输出资源的时候，会输出两个版本，其中一个用于开发环境，如 vue.global.js，另一个用于生产环境，如 vue.global.prod.js。

### 框架要做到良好的 Tree-Shaking

Tree-Shaking 指的就是消除那些永远不会被执行的代码，也就是排除 dead code，现在无论是 rollup.js 还是 webpack，都支持 Tree-Shaking。

想要实现 Tree-Shaking，必须满足一个条件，即模块必须是 ESM（ES Module），因为 Tree-Shaking 依赖 ESM 的静态结构。

Tree-Shaking 中的第二个关键点：副作用。如果一个函数调用会产生副作用，那么就不能将其移除。副作用就是，当调用函数的时候会对外部产生影响，例如修改了全局变量。

注释代码 `/*#__PURE__*/`，其作用就是告诉 rollup.js，这段代码不会产生副作用。

通常产生副作用的代码都是模块内函数的顶级调用。

```js
foo() // 顶级调用

function bar() {
  foo() // 函数内调用
}
```

在 Vue.js 3 的源码中，基本都是在一些顶级调用函数上使用 `#__PURE__` 注释。该注释也不是只有 rollup.js 才能识别，webpack 以及压缩工具（如 terser ）都能识别它。

### 框架应该输出怎样的构建产物

不同环境上的产物：

- 开发环境：vue.global.js（包含告警信息）
- 生产环境：global.prod.js（不包含告警信息）

不同使用场景的产物：

- 直接在 HTML 页面中使用 `<script>` 标签引入框架并使用：vue.global.js（IIFE，立即调用的函数表达式）
- 直接在 HTML 页面中使用 `<script type="module">` 标签引入框架并使用：vue.esm-browser.js（ESM 格式的资源）
- 用于提供给打包工具的 ESM 格式的资源时：vue.esm-bundler.js（ESM 格式的资源）

带有 -bundler 资源的 ESM 资源：是给 rollup.js 或 webpack 等打包工具使用的。
带有 -browser 资源的 ESM 资源：是给 `<script type="module">` 使用的。

它们的区别如下：

- 当构建用于  `<script type="module">` 的 ESM 资源时，如果是开发环境，`__DEV__` 会设置为 true； 如果是生产环境，`__DEV__` 会设置为 false，从而被 Tree-Shaking 移除； 
- 当构建用于提供给打包工具的 ESM 格式的资源时，不能直接把 `__DEV__` 设置为 true 或 false，而要使用（`process.env.NODE_ENV !== 'production'`）替换 `__DEV__` 常量。

### 特性开关

一个特性对应一个开关，通过开关的形式来决定是否需要某些代码，这样在打包的时候，用于实现关闭功能的代码将会被 Tree-Shaking 机制排除，从而减小资源的体积。

### 错误处理

框架错误处理机制的好坏直接决定了用户应用程序的健壮性，还决定了用户开发时处理错误的心智负担。框架需要为用户提供统一的错误处理接口，这样用户可以通过注册自定义的错误处理函数来处理全部的框架异常。

### 良好的 Typescript 类型支持

Typescript 是由微软开源的编程语言，简称 TS，它是 Javascript 的超集，能够为 Javascript 提供类型支持。

使用 TS 编写代码与对 TS 类型支持友好是两件事。