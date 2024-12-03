// ** 设计一个完善的响应系统
// 优点：改进 effect 硬编码的问题 
// 缺点：没有建立 key 与副作用的联系：无论读取或设置哪一个属性都会把副作用函数收集到桶里，即使这个属性没有与副作用建立联系

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// 存储副作用函数的桶
const bucket = new Set();
// 原始数据
const data = { text: 'hello world!' };
// 对原始数据的代理
const obj = new Proxy(data, {
  get(target, key) {
    activeEffect && bucket.add(activeEffect);
    return target[key]
  },
  set(target, key, newVal) {
    target[key] = newVal;
    bucket.forEach(fn => fn());
    return true; // 返回 true 代表设置成功
  }
});

// 副作用函数
function effect(fn) {
  activeEffect = fn;
  fn();
}

// 执行副作用函数，触发读取
effect(() => {
  console.log('effect run');
  document.body.innerText = obj.text;
});

// 1秒后修改响应式数据
setTimeout(() => {
  obj.noExist = 'hello vue3';
}, 1000);