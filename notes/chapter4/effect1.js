// *最初级的响应式

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

// !缺点
// 1.没有建立key与副作用的联系：无论读取或设置哪一个属性都会把副作用函数收集到桶里，即使这个属性没有与副作用建立联系
// 2.副作用函数名称硬编码，不可修改：一旦修改副作用函数名称就不能工作