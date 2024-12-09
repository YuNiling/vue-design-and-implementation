// ** 自动脱 ref

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

console.log('测试1：获取 ref 的 value 属性值方法');
const obj1 = reactive({ foo: 1, bar: 2 });
const newObj1 = { ...toRefs(obj1) };
console.log(obj1.foo, newObj1.foo.value);
console.log(obj1.bar, newObj1.bar.value);

console.log('测试2：自动脱 ref 实现（读取属性）');
const obj2 = reactive({ foo: 1, bar: 2 });
const newObj2 = proxyRefs({ ...toRefs(obj2) });
console.log(obj2.foo, newObj2.foo);
console.log(obj2.bar, newObj2.bar);

console.log('测试3：自动脱 ref 实现（设置属性值）');
const obj3 = reactive({ foo: 1, bar: 2 });
const newObj3 = proxyRefs({ ...toRefs(obj3) });
newObj3.foo = 3;
console.log('设置 newObj3.foo 为 3');
console.log('newObj3.foo', newObj3.foo);