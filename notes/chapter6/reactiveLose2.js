// ** 响应丢失问题

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

console.log('测试1：使用展开运算符得到的新对象是否具有响应性');
const obj1 = reactive({ foo: 1, bar: 2 });
const newObj1 = {
  ...obj1
};
effect(() => {
  console.log('effect1', newObj1.foo); // newObj 是普通对象
});
console.log('设置 obj1 foo 为 100');
obj1.foo = 100; // 不触发响应

console.log('测试2：在副作用函数内，即使通过普通对象 newObj 来访问属性值，也能够建立响应联系');
const obj2 = reactive({ foo: 1, bar: 2 });
const newObj2 = {
  foo: {
    get value() {
      return obj2.foo;
    }
  },
  bar: {
    get value() {
      return obj2.bar;
    }
  }
};
effect(() => {
  console.log('effect2', newObj2.foo.value); // 在副作用函数内通过新的对象 newObj 读取 foo 属性值
});
console.log('设置 obj2 foo 为 99');
obj2.foo = 99;

console.log('测试3：对测试2的方法封装成 toRef 方法进行单个属性转换成 ref 的响应值');
const obj3 = reactive({ foo: 1, bar: 2 });
const newObj3 = {
  foo: toRef(obj3, 'foo'),
  bar: toRef(obj3, 'bar')
};
effect(() => {
  console.log('effect3', newObj3.foo.value); // 在副作用函数内通过新的对象 newObj 读取 foo 属性值
});
console.log('设置 obj3 foo 为 98');
obj3.foo = 98;

console.log('测试4：响应式数据 obj 的键非常多的情况下，封装 toRefs 方法进行批量转换')
const obj4 = reactive({ foo: 1, bar: 2 });
const newObj4 = { ...toRefs(obj4) };
effect(() => {
  console.log('effect4', newObj4.foo.value); // 在副作用函数内通过新的对象 newObj 读取 foo 属性值
});
console.log('设置 obj4 foo 为 97');
obj4.foo = 97;

console.log('测试5：toRef 函数创建的 ref 不仅能读取，还能修改修改值')
const obj5 = reactive({ foo: 1, bar: 2 });
const refFoo5 = toRef(obj5, 'foo');
console.log('设置 refFoo5 为 96');
refFoo5.value = 96;
console.log('obj5', obj5);
console.log('refFoo5', refFoo5);