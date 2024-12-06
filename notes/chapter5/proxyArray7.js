// ** 代理数组

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// effect 栈
const effectStack = [];
// 存储副作用函数的桶
const bucket = new WeakMap();
const ITERATE_KEY = Symbol();
const TriggerType = {
  SET: 'SET',
  ADD: 'ADD',
  DELETE: 'DELETE'
};
// 定义一个 Map 实例，存储原始对象到代理对象的映射
const reactiveMap = new Map();

// 存储改进的数组方法对象
const arrayInstrumentations = {};
['includes', 'indexOf', 'lastIndexOf'].forEach(method => {
  const originalMethod = Array.prototype[method];
  arrayInstrumentations[method] = function(...args) {
    // this 是代理对象，先在代理对象中查找，将结果存储到 res 中
    let res = originalMethod.apply(this, args);

    if (res === false || res === -1) {
      // res 为 false 说明没找到，通过 this.raw 拿到原始数组，再去其中查找并更新 res 值
      res = originalMethod.apply(this.raw, args);
    }

    return res;
  };
});
// 一个标记变量，代表是否进行追踪，默认值为 true，即允许追踪
let shouldTrack = true;
['push', 'pop', 'shift', 'unshift', 'splice'].forEach(method => {
  // 获取原始方法
  const originalMethod = Array.prototype[method];
  arrayInstrumentations[method] = function(...args) {
    // 在调用原始方法之前，禁止追踪
    shouldTrack = false;
    // 方法的默认行为
    let res = originalMethod.apply(this, args);
    // 在调用原始方法之后，恢复原来的行为，即允许追踪
    shouldTrack = true;
    return res;
  };
});

/**
 * 封装响应式数据
 * @param {*} obj 原始数据
 * @param {Boolean} isShallow 代表是否为浅响应，默认为 false，即深响应；为 true 时，即浅响应
 * @param {Boolean} isReadonly 代表是否只读，默认为 false，即非只读；为 true 时，即只读
 * @returns 
 */
function createReative(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      // 代理对象可以通过 raw 属性访问原始数据
      if (key === 'raw') {
        return target;
      }

      // 如果操作的目标对象时数组，并且 key 存在于 arrayInstrumentations 上，那么返回定义在 arrayInstrumentations 上的值
      if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver);
      }

      // 非只读的时候才需要建立响应联系，如果 key 的类型时 symbol，则不进行追踪
      if(!isReadonly && typeof key !== 'symbol') {
        track(target, key);
      }
      
      const res = Reflect.get(target, key, receiver);

      // 如果是浅响应，则直接返回原始值
      if (isShallow){
        return res;
      }

      if (typeof res === 'object' && res !== null) {
        // 如果数据为只读，则调用 readonly 对峙进行包装
        return isReadonly ? readonly(res) : reactive(res);
      }
      return res;
    },
    set(target, key, newVal, receiver) {
      // 如果是只读的，则打印警告信息并返回
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`);
        return true;
      }

      // 先获取旧值
      const oldVal = target[key];
      // 如果属性不存在，则说明时走添加新的属性，否则是设置已有属性
      const type = Array.isArray(target) 
        // 如果代理目标是数组，则检测被设置的索引值是否小于数组的长度，如果是则是 ”SET“，否则是 “ADD”
        ? Number(key) < target.length ? TriggerType.SET : TriggerType.ADD
        // 如果属性不存在，则说明是在添加新属性，负责是设置已有属性
        : Object.prototype.hasOwnProperty.call(target, key) ? TriggerType.SET : TriggerType.ADD;

      const res = Reflect.set(target, key, newVal, receiver);
      // target === receiver.raw 说明 receiver 就是 target 的代理对象
      if (target === receiver.raw) {
        // 比较新值与旧值，只有当不全等，并且都不是 NaN 的时候才触发响应
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          // newVal：触发响应的新值
          trigger(target, key, type, newVal);
        }
      }

      return res;
    },
    deleteProperty(target, key) {
      // 如果是只读的，则打印警告信息并返回
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`);
        return true;
      }

      // 检查被操作的属性是否是对象自己的属性
      const hadKey = Object.prototype.hasOwnProperty.call(target, key);
      // 使用 Reflect.deleteProperty 完成属性的删除
      const res = Reflect.deleteProperty(target, key);

      if (res && hadKey) {
        // 只有当被删除的属性是对象自己的属性并且成功删除时，才触发更新
        trigger(target, key, TriggerType.DELETE);
      }

      return res;
    },
    has(target, key) {
      track(target, key);
      return Reflect.has(target, key);
    },
    ownKeys(target) {
      // 如果操作目标 target 是数组，则使用 length 属性作为 key 并建立响应联系，否则是 ITERATE_KEY
      track(target, Array.isArray(target) ? 'length' : ITERATE_KEY);
      return Reflect.ownKeys(target);
    }
  });
}

// 深响应
function reactive(obj) {
  // 有限通过原始对象 obj 寻找之前创建的代理对象，如果找到了，直接返回已有的代理对象
  const existionProxy = reactiveMap.get(obj);
  if(existionProxy) return existionProxy;

  // 否则，创建新的代理对象
  const proxy = createReative(obj);
  // 存储到 Map 中，从而避免重复创建
  reactiveMap.set(obj, proxy);

  return proxy;
}

// 浅响应
function shallowReactive(obj) {
  return createReative(obj, true);
}

// 深只读
function readonly(obj) {
  return createReative(obj, false, true);
}

// 浅只读
function shallowReadonly(obj) {
  return createReative(obj, true, true);
}

let temp1, temp2;

function track(target, key) {
  // 当禁止最终时，直接返回（“屏蔽” push 时读取 length 的操作）
  if (!activeEffect || !shouldTrack) return;
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

function trigger(target, key, type, newVal) {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const effectsSet = depsMap.get(key);

  const effectsToRun = new Set();
  effectsSet && effectsSet.forEach((effectFn => {
    if (effectFn !== activeEffect) {
      effectsToRun.add(effectFn);
    }
  }));

  // 只有当操作类型为 ‘ADD’ 或 'DELETE' 时，才触发与 ITERATE_KEY 相关联的副作用函数重新执行
  if (type === TriggerType.ADD || type === TriggerType.DELETE) {
    // 取得与 ITERATE_KEY 相关联的副作用函数
    const iterateEffects = depsMap.get(ITERATE_KEY);
    iterateEffects && iterateEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn);
      }
    });
  }
  // 当操作类型为'ADD'且数据类型为数组时，取出并执行与length属性关联的副作用函数
  if (Array.isArray(target) && type === TriggerType.ADD) {
    // 取出与 length 相关联的副作用函数
    const lengthEffects = depsMap.get('length');
    lengthEffects && lengthEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn);
      }
    });
  }
  // 当操作类型为 "ADD" 并且目标对象是数组时，应该取出并执行哪些与 length 属性相关联的副作用函数
  if (Array.isArray(target) && key === 'length') {
    // 修改了数组的 length 属性
    // 对于索引大于或等于新的 length 值的元素，需要把所有相关联的副作用函数取出并添加到 effectsToRun 中待执行
    depsMap.forEach((effects, key) => {
      if (key >= newVal) {
        effects.forEach(effectFn => {
          if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn);
          }
        });
      }
    });
  }

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
function watch(source, cb, options = {}) {
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

  // cleanup 用来存储用户注册的过期回调
  let cleanup;
  // 定义 onInvalidate 函数
  function onInvalidate(fn) {
    cleanup = fn;
  }

  // 提取 scheduler 调度函数为一个独立的 job 函数
  const job = () => {
    // 当数据变化时，调用回调函数 cb
    newVal = effectFn();
    // 在调用回调函数 cb 之前，先调用过期回调
    if (cleanup) {
      cleanup();
    }
    cb(newVal, oldVal, onInvalidate);
    // 更新旧值，不然下一次会得到错误的旧值
    oldVal = newVal;
  };

  const effectFn = effect(
    () => getter(),
    {
      lazy: true,
      scheduler: () => {
        // 值调度函数中判断 flush 是否为 'post'，如果是，将其放到微任务队列中执行
        if (options.flush === 'post') {
          const p = Promise.resolve();
          p.then(job);
        } else {
          job();
        }
      }
    }
  );

  if (options.immediate) {
    job();
  } else {
    oldVal = effectFn();
  }
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

console.log('测试1：通过索引读取或者设置数组元素的值时，代理对象的 get/set 拦截函数是否执行');
const arr1 = reactive(['foo']);
effect(() => {
  console.log(arr1[0]);
});
arr1[0] = 'bar'; // 能否触发响应

console.log('测试2：通过索引设置元素值时，可能会隐式地修改 length 的属性值。因此在触发响应时，也应该触发与 length 属性相关联的副作用函数重新执行。');
const arr2 = reactive(['foo']);
effect(() => {
  console.log(arr2.length);
});
// arr2[0] = 'bar'; // 设置索引 0 的值，数组的长度不变，不触发响应
arr2[1] = 'bar'; // 设置索引 1 的值，会导致数组的长度变为 2

console.log('测试3：修改数组的 length 属性会隐式地影响数组元素。当修改 length 属性值时，只有那些索引值大于或等于新的 length 属性值的元素才需要触发响应。')
const arr3 = reactive(['foo']);
effect(() => {
  console.log(arr3[0]);
});
// arr3.length = 100; // 将数组的长度修改为 100，对第 0个元素没有影响，不触发响应
arr3.length = 0; // 将数组的长度修改为 0，导致第 0 个元素被删除，触发响应

const arr4 = reactive(['foo']);
effect(() => {
  for (const key in arr4) {
    console.log(key, arr4[key]);
  }
});
console.log('测试4.1：添加新的元素 bar，触发响应');
arr4[1] = 'bar';
console.log('测试4.2：修改数组长度为 1，触发响应');
arr4.length = 1; 

console.log('测试5：for...of 遍历可迭代对象')
const obj = {
  val: 0,
  [Symbol.iterator]() {
    return {
      next() {
        return {
          value: obj.val++,
          done: obj.val > 3 ? true : false
        }
      }
    }
  }
};
for (const value of obj) {
  console.log(value);
}

console.log('测试6：数组内建了 Symbol.iterator 方法的实现')
const arr6 = [1, 2, 3];
const itr6 = arr6[Symbol.iterator](); // 获取并调用数组内建的迭代器方法
console.log(itr6.next());
console.log(itr6.next());
console.log(itr6.next());
console.log(itr6.next());

console.log('测试7：数组采用 for...of 遍历')
const arr7 = [1, 2, 3];
for (const val of arr7) {
  console.log(val);
}

console.log('测试8：数组迭代器的模拟实现')
const arr8 = [1, 2, 3];
arr8[Symbol.iterator] = function() {
  const target = this;
  const len = target.length;
  let index = 0;

  return {
    next() {
      return {
        value: index < len ? target[index] : undefined,
        done: index++ >= len,
        index
      }
    }
  }
};
const itr8 = arr8[Symbol.iterator]();
console.log(itr8.next());
console.log(itr8.next());
console.log(itr8.next());
console.log(itr8.next());

const arr9 = reactive([1, 2, 3]);
effect(() => {
  for (const val of arr9) {
    console.log(val);
  }
});
console.log(`测试9.1：迭代数组时，修改索引 1 的值为 bar，触发响应`);
arr9[1] = 'bar'; 
console.log(`测试9.2：迭代数组时，修改数组长度，触发响应`);
arr9.length = 1;

console.log('测试10：includes 方法，修改索引值为 3，触发响应');
const arr10 = reactive([1, 2]);
effect(() => {
  console.log('arr10.includes(1)', arr10.includes(1));
});
arr10[0] = 3;

console.log('测试11：arr11[0] 得到的是一个代理对象，而在 includes 方法内部也会通过 arr 访问数组元素，从而得到一个代理对象，通过 reativeMap 缓存使得两个代理对象相同');
const obj11 = {};
const arr11 = reactive([obj11]);
console.log(arr11.includes(arr11[0]));

console.log('测试12：includes 内部的 this 指向的是代理对象 arr，并且在获取数组元素时得到的值也是代理对象，拿原始对象 obj 去查找不能找到，这时就需要重写 includes 方法，类似的处理方法有：indexOf、lastIndexOf。')
const obj12 = {};
const arr12 = reactive([obj12]);
console.log('includes', arr12.includes(obj12));
console.log('indexOf', arr12.indexOf(obj12));
console.log('lastIndexOf', arr12.lastIndexOf(obj12));

console.log('push/pop/unshift/shift/splice 方法，原数组 [4, 5]')
const arr13 = reactive([4, 5]);
// // 第一个副作用函数
effect(() => {
  arr13.push(1);
});
console.log('push 1', arr13);
effect(() => {
  arr13.unshift(3);
});
console.log('unshift 3', arr13);
effect(() => {
  arr13.splice(1, 0, 8, 9);
});
console.log('splice 索引1 增加8、9', arr13);
effect(() => {
  arr13.splice(2, 1);
});
console.log('splice 索引2 删除1位', arr13);
effect(() => {
  arr13.pop();
});
console.log('pop', arr13);
effect(() => {
  arr13.shift();
});
console.log('shift', arr13);