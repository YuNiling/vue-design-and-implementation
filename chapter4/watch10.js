// * watch：观测一个响应式数据，当数据发生变化时通知并执行相应的回调函数。
// * 实现的本质是：利用了effect、 options.scheduler选项、 options.lazy选项。

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// effect 栈
const effectStack = [];
// 存储副作用函数的桶
const bucket = new WeakMap();
// 原始数据
const data = {
  foo: 1,
  bar: 2
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
  const effectsToRun = new Set();
  effectsSet.forEach((effectFn => {
    if (effectFn !== activeEffect) {
      effectsToRun.add(effectFn);
    }
  }));
  effectsToRun.forEach(effectFn => {
    // 如果一个副作用函数存在调度器，则调用该调度器，并将副作用函数作为参数传递
    // 负责直接执行副作用函数（之前到默认行为）
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn);
    } else {
      effectFn();
    }
  });
}

// 副作用函数
function effect(fn, options = {}) {
  const effectFn = () => {
    cleanup(effectFn);
    activeEffect = effectFn;
    effectStack.push(effectFn);
    const res = fn();
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];
    return res;
  };
  // 将 options 挂载到 effectFn 上
  effectFn.options = options;
  // activeEffect.deps 用来存储所有与该副作用相关联的依赖集合
  effectFn.deps = [];
  // 只有非 lazy 的时候，才执行
  if (!options.lazy) {
    effectFn();
  }
  // 将副作用函数作为返回值返回
  return effectFn;
}

function cleanup(effectFn) {
  effectFn.deps.forEach((deps) => {
    deps.delete(effectFn);
  });

  // 重置数组
  effectFn.deps = [];
}

// 定义一个任务队列，采用 Set 数据结构目的是自动去重
const jobQueue = new Set();
// 使用 Promise.resolve() 创建一个 promise 实例，我们用它将一个任务添加到微任务队列
const p = Promise.resolve();

// 一个标志代表是否正在刷新队列
let isFlushing = false;
function flushJob() {
  // 如果队列正在刷新，则什么都不做
  if (isFlushing) return;
  // 设置为 true ，代表正在刷新
  isFlushing = true;
  // 在微任务队列中刷新 jobQueue 队列
  p.then(() => {
    jobQueue.forEach(job => job());
  }).finally(() => {
    // 结束后重置 isFlushing
    isFlushing = false;
  });
}

// 执行副作用函数，触发读取
function computed(getter) {
  // value 用来换成上一次计算的值
  let value;
  // dirty 标志，用来标识是否需要重新计算值，为 true 则意味着“脏”，需要计算
  let dirty = true;

  // 把 getter 作为副作用函数，创建一个 lazy 的 effect
  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      dirty = true;
      // 当计算属性依赖的响应式数据变化时，手动调用 trigger 函数触发响应
      trigger(obj, 'value');
    }
  });
  const obj = {
    // 当读取 value 时才执行 effectFn()
    get value() {
      // 只有“脏”时才计算值，并将得到的值缓存到 value 中
      if (dirty) {
        value = effectFn();
        dirty = false;
      }
      // 当读取 vaue 时，手动调用 track 函数进行追踪
      track(obj, 'value');
      return value;
    }
  };

  return obj;
}

// watch 函数接收两个参数，source 是响应式数据/getter函数，cb 是回调函数
function watch(source, cb) {
  // 定义 getter
  let getter;
  // 如果 source 是函数，说明用户传递的是 getter，所以直接把 source 赋值给 getter
  if (typeof source === 'function') {
    getter = source;
  } else {
    // 调用 traverse 递归地读取
    getter = () => traverse(source);
  }

  let oldVal, newVal;
  const effectFn = effect(
    () => getter(),
    {
      lazy: true,
      scheduler() {
        // 当数据变化时，调用回调函数 cb
        newVal = effectFn();
        cb(newVal, oldVal);
        // 更新旧值，不然下一次会得到错误的旧值
        oldVal = newVal;
      }
    }
  );

  oldVal = effectFn();
}

function traverse(value, seen = new Set()) {
  // 如果要读取的数据是原始值，或者已经被读取过了，那么什么也不做
  if (typeof value !== 'object' || value === null || seen.has(value)) return;
  // 将数据添加到 seen 中，代表遍历地读取过了，避免循环引用引起的死循环
  seen.add(value);
  // 暂时不考虑数组等其他结构
  // 假设 value 就是一个对象，使用 for...in 读取对象的每一个值，并递归调用 traverse 进行处理
  for (const k in value) {
    traverse(value[k], seen);
  }

  return value;
}

// watch(obj, () => {
//   console.log('数据变了');
// });

// watch(
//   // getter 函数
//   () => obj.foo, 
//   () => {
//     console.log('obj.foo 的值变了');
//   }
// );

watch(
  () => obj.foo, 
  (newVal, oldVal) => {
    console.log(newVal, oldVal);
  }
);

obj.foo++;
