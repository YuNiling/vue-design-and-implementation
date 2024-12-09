// ** 引入 ref 的概念
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

console.log('测试1：基础的 ref 封装函数响应性测试');
const refVal1 = ref(1);
effect(() => {
  console.log('effect run ', refVal1.value);
});
console.log('value 从 1 修改成 2');
refVal1.value = 2; // 触发响应

console.log('测试2：如何区分 refVal 是原始值包裹对象，还是非原始值的响应式数据，可以通过不可枚举属性 __v_isRef 是否为 true 判断');
const refVal21 = ref(1);
const refVal22 = reactive({ value: 1 });
console.log('ref', refVal21);
console.log('reactive', refVal22);