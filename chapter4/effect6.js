// * 定义一个effect栈，解决effect5.js中的嵌套副作用问题

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// effect 栈
const effectStack = [];
// 存储副作用函数的桶
const bucket = new WeakMap();
// 原始数据
const data = {
  foo: true,
  bar: true
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

let temp1, temp2;

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
    effectStack.push(effectFn);
    fn();
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];
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
effect(function effectFn1() {
  console.log('effectFn1 执行');

  effect(function effectFn2() {
    console.log('effectFn2 执行');
    temp2 = obj.bar;
  });

  temp1 = obj.foo;
});

// 1秒后修改响应式数据
setTimeout(() => {
  obj.foo = false;
}, 1000);