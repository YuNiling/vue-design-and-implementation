// * 响应丢失问题
// * 问题描述：在 Vue.js 组件中，通常将响应式数据暴露在模板中，修改响应式数据，摸板没有重新渲染。
// * 原因分析：一般暴露方式是使用展开运算符(...)，展开运算符得到的新对象是普通对象，不具有响应性，造成响应性丢失。
// * 解决方案：将响应式数据转换成累屎于 ref 结构的数据。

import { effect, reactive } from "../reactive.js";

// 封装一个 ref 函数
function ref(val) {
  // 在 ref 函数内部创建包裹对象
  const wrapper = {
    value: val
  };
  // 使用 Object.defineProperty 在 wrapper 对象上定义一个不可枚举的属性 __v_isRef，并且值为 true
  Object.defineProperty(wrapper, '__v_isRef', {
    value: true
  });
  // 将包裹对象变成响应式数据
  return reactive(wrapper);
}

function toRef(obj, key) {
  const wrapper = {
    get value() {
      return obj[key];
    },
    set value(val) {
      obj[key] = val;
    }
  };

  Object.defineProperty(wrapper, '__v_isRef', {
    value: true
  });

  return wrapper;
}

function toRefs(obj) {
  const ret = {};
  for (const key in obj) {
    ret[key] = toRef(obj, key);
  }

  return ret;
}

// 测试1：使用展开运算符得到的新对象是否具有响应性。
// const obj = reactive({ foo: 1, bar: 2 });
// const newObj = {
//   ...obj
// };
// effect(() => {
//   console.log(newObj.foo); // newObj 是普通对象
// });
// obj.foo = 100; // 不触发响应

// 测试2：在副作用函数内，即使通过普通对象 newObj 来访问属性值，也能够建立响应联系。
// const obj = reactive({ foo: 1, bar: 2 });
// const newObj = {
//   foo: {
//     get value() {
//       return obj.foo;
//     }
//   },
//   bar: {
//     get value() {
//       return obj.bar;
//     }
//   }
// };
// effect(() => {
//   console.log(newObj.foo.value); // 在副作用函数内通过新的对象 newObj 读取 foo 属性值
// });
// obj.foo = 100;

// 测试3：对测试2的方法封装成 toRef 方法进行单个属性转换成 ref 的响应值
// const obj = reactive({ foo: 1, bar: 2 });
// const newObj = {
//   foo: toRef(obj, 'foo'),
//   bar: toRef(obj, 'bar')
// };
// effect(() => {
//   console.log(newObj.foo.value); // 在副作用函数内通过新的对象 newObj 读取 foo 属性值
// });
// obj.foo = 99;

// 测试4：响应式数据 obj 的键非常多的情况下，封装 toRefs 方法进行批量转换
// const obj = reactive({ foo: 1, bar: 2 });
// const newObj = { ...toRefs(obj) };
// effect(() => {
//   console.log(newObj.foo.value); // 在副作用函数内通过新的对象 newObj 读取 foo 属性值
// });
// obj.foo = 98;

// 测试5：toRef 函数创建的 ref 不仅能读取，还能修改修改值
const obj = reactive({ foo: 1, bar: 2 });
const refFoo = toRef(obj, 'foo');
refFoo.value = 97;
console.log(obj);
console.log(refFoo);