// * 自动脱 ref
// * 前提情景：toRefs 将响应式数据的第一层属性值转换成 ref，在模版访问数据时，需要通过 value 属性才能访问值，造成用户的心智负担。
// * 概念分析：为了解决上面问题，需要实现自动脱 ref 能力，即如果读取的属性是一个 ref，则直接将该 ref 对应的 value 属性值返回。
// * 应用场景：在 Vue.js 组件中 setup 方法 return 返回对象时，就会将这个对象传递给 proxyRefs 函数进行处理，所以模板访问 ref 的值无需通过 value 属性来访问。

import { reactive } from "../reactive.js";

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

function proxyRefs(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      // 自动脱 ref 实现，如果读取的值是 ref，则返回它的 value 属性值
      return value.__v_isRef ? value.value : value;
    },
    set(target, key, newValue, receiver) {
      // 通过 target 读取真实值
      const value = target[key];
      // 如果值是 Ref，则设置其对应的 value 属性值
      if (value.__v_isRef){
        value.value = newValue;
        return true;
      }
      return Reflect.set(target, key, newValue, receiver);
    }
  });
}

// 测试1：ref 的 value 属性值方法
// const obj = reactive({ foo: 1, bar: 2 });
// console.log(obj.foo);
// console.log(obj.bar);
// const newObj = { ...toRefs(obj) };
// console.log(newObj.foo.value);
// console.log(newObj.bar.value);

// 测试2：自动脱 ref 实现（读取属性）
// const obj = reactive({ foo: 1, bar: 2 });
// console.log(obj.foo);
// console.log(obj.bar);
// const newObj = proxyRefs({ ...toRefs(obj) });
// console.log(newObj.foo);
// console.log(newObj.bar);

// 测试3：自动脱 ref 实现（设置属性值）
const obj = reactive({ foo: 1, bar: 2 });
const newObj = proxyRefs({ ...toRefs(obj) });
newObj.foo = 3;
console.log(newObj.foo);