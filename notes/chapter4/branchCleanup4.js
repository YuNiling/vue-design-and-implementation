// ** 分支切换与 cleanup
// 优点：分支切换会导致副作用函数冗余问题。

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// 存储副作用函数的桶
const bucket = new WeakMap();
// 原始数据
const data = {
  ok: true,
  text: 'hello world!'
};
// 对原始数据的代理
const obj = new Proxy(data, {
  get(target, key) {
    track(target, key);
    return target[key]
  },
  set(target, key, newVal) {
    target[key] = newVal;
    trigger(target, key);
    return true;
  }
});

function track(target, key) {
  if (!activeEffect) return;
  let depsMap = bucket.get(target);
  if (!depsMap) {
    depsMap = new Map();
    bucket.set(target, depsMap);
  }
  let effectsSet = depsMap.get(key);
  if (!effectsSet) {
    effectsSet = new Set();
    depsMap.set(key, effectsSet);
  }
  effectsSet.add(activeEffect);
  activeEffect.deps.push(effectsSet);
}

function trigger(target, key) {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const effectsSet = depsMap.get(key);
  if (!effectsSet) return;
  const effectsToRun = new Set(effectsSet);
  effectsToRun.forEach(effectFn => effectFn())
}

// 副作用函数
function effect(fn) {
  const effectFn = () => {
    cleanup(effectFn);
    activeEffect = effectFn;
    fn();
  };
  // activeEffect.deps 用来存储所有与该副作用相关联的依赖集合
  effectFn.deps = [];
  effectFn();
}

function cleanup(effectFn) {
  effectFn.deps.forEach((deps) => {
    deps.delete(effectFn);
  });

  // 重置数组
  effectFn.deps = [];
}

// 执行副作用函数，触发读取
effect(() => {
  console.log('effect run');
  document.body.innerText = obj.ok ? obj.text : 'not';
});

// 1秒后修改响应式数据
setTimeout(() => {
  obj.ok = false;
  obj.text = 'hello vue3';
}, 1000);
