// *改进的响应式
// *树型数据结构 target -> key -> effects
// *   WeakMap          Map          Set
// *｜ 键    值 ｜  ｜ 键    值 ｜   ｜  值  ｜
// * target Map             
// *         |             
// *          ->     key  Set       
// *                       | 
// *                        ->      effects

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// 存储副作用函数的桶
const bucket = new WeakMap();
// 原始数据
const data = { text: 'hello world!' };
// 对原始数据的代理
const obj = new Proxy(data, {
  get(target, key) {
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
    return target[key]
  },
  set(target, key, newVal) {
    target[key] = newVal;
    const depsMap = bucket.get(target);
    if(!depsMap) return;
    const effectsSet = depsMap.get(key);
    if (!effectsSet) return;
    effectsSet.forEach(effect => effect());
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
  // obj.noExist = 'hello vue3';
  obj.text = 'hello vue3';
}, 1000);
