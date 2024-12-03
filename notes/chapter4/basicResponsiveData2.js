// ** 响应式数据的基本实现

// 存储副作用函数的桶
const bucket = new Set();
// 原始数据
const data = { text: 'hello world!' };
// 对原始数据的代理
const obj = new Proxy(data, {
  get(target, key) {
    bucket.add(effect);
    return target[key]
  },
  set(target, key, newVal) {
    target[key] = newVal;
    bucket.forEach(fn => fn());
    return true; // 返回 true 代表设置成功
  }
});

// 副作用函数
function effect() {
  document.body.innerText = obj.text;
}

// 执行副作用函数，触发读取
effect();

// 1秒后修改响应式数据
setTimeout(() => {
  obj.text = 'hello vue3';
}, 1000);