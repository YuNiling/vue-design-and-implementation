// * reactive 公共方法封装

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// effect 栈
const effectStack = [];
// 存储副作用函数的桶
const bucket = new WeakMap();
export const ITERATE_KEY = Symbol(); 
export const MAP_KEY_ITERATE_KEY = Symbol();
export const TriggerType = {
  SET: 'SET',
  ADD: 'ADD',
  DELETE: 'DELETE'
};
// 定义一个 Map 实例，存储原始对象到代理对象的映射
const reactiveMap = new Map();

// 存储改进的 Array 方法对象
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

// 存储改进的 Set/Map/WeakMap/WeakSet 方法对象
const mutableInstrumentations = {
  add(key) {
    // this 仍然指向的是代理对象，通过 raw 属性获取原始数据对象
    const target = this.raw;
    // 先判断是否已存在
    const hadKey = target.has(key);
    // 只有在值不存在的情况下，才需要触发响应
    if (!hadKey){
      // 通过原始数据对象执行 add 方法删除具体的值，注意，这里不需要 .bind 了，因为是直接通过 target 调用并执行的
      const res = target.add(key);

      // 调用 trigger 函数触发响应，并制定操作类型为 ADD
      trigger(target, key, TriggerType.ADD);
      return res;
    }

    return target;
  },
  delete(key) {
    const target = this.raw;
    const hadKey = target.has(key);
    const res = target.delete(key);
    // 当要删除的元素确实存在时，才触发响应
    if (hadKey){
      trigger(target, key, TriggerType.DELETE);
    }

    return res;
  },
  get(key) {
    const target = this.raw;
    const hadKey = target.has(key);
    track(target, key);
    if (hadKey) {
      // 如果得到的结果 res 仍然是可代理的数据，则返回使用 reactive 包装后的响应式数据
      const res = target.get(key);
      return typeof res === 'object' ? reactive(res) : res;
    }
  },
  set(key, value) {
    const target = this.raw;
    const hadKey = target.has(key);
    const oldVal = target.get(key);

    // 获取原始数据，由于 value 本身可能已经上原始数据，所以此时 value.raw 不存在，则直接使用 value
    const rawValue = value.raw || value;
    target.set(key, rawValue);

    if (!hadKey) {
      // 如果不存在，则说明是 ADD 操作
      trigger(target, key, TriggerType.ADD);
    } else if (oldVal !== value || (oldVal === oldVal && value === value)) {
      // 如果存在，并且值变了，则是 SET 操作
      trigger(target, key, TriggerType.SET);
    }
  },
  forEach(callback, thisArg) {
    // wrap 函数用来把可代理的值转换为响应式数据
    const wrap = (val) => typeof val === 'object' ? reactive(val) : val;
    const target = this.raw;
    // 遍历操作与键值对的数量有关，因此任何会修改 Map 对象键值对数量的操作都应该触发副作用函数，例如 add 和 delete 方法，所以这时该让副作用函数与 ITERATE_KEY 建立响应联系
    track(target, ITERATE_KEY);
    // 通过 target 调用原始 forEach 方法进行遍历
    target.forEach((value, key) => {
      // 手动调用 callback，用 wrap 函数包裹 value 和 key 后再传给 callback，这样就实现了深响应
      callback.call(thisArg, wrap(value), wrap(key), this);
    });
  },
  // entries 与 [Symbol.iterator] 等价，m[Symbol.iterator] === m.entries
  [Symbol.iterator]: iterationMethod,
  entries: iterationMethod,
  values: valuesIterationMethod,
  keys: keysIterationMethod
};

/**
 * 封装响应式数据
 * @param {*} obj 原始数据
 * @param {Boolean} isShallow 代表是否为浅响应，默认为 false，即深响应；为 true 时，即浅响应
 * @param {Boolean} isReadonly 代表是否只读，默认为 false，即非只读；为 true 时，即只读
 * @returns 
 */
export function createReative(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      // 代理对象可以通过 raw 属性访问原始数据
      if (key === 'raw') {
        return target;
      }

      // Set/Map/WeakMap/WeakSet 类型逻辑处理
      if (['Set', 'Map', 'WeakMap', 'WeakSet'].includes(getType(target))) {
        // size 属性访问
        if (key === 'size') {
          // 如果读取的是 size 属性，通过指定第三个参数 receiver 的原始对象 target 从而修复问题
          track(target, ITERATE_KEY);
          return Reflect.get(target, key, target);
        }

        // 返回定义在 mutableInstrumentations 对象下的方法
        return mutableInstrumentations[key];
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

/**
 * 深响应
 * @param {*} obj 
 * @returns 
 */
export function reactive(obj) {
  // 有限通过原始对象 obj 寻找之前创建的代理对象，如果找到了，直接返回已有的代理对象
  const existionProxy = reactiveMap.get(obj);
  if(existionProxy) return existionProxy;

  // 否则，创建新的代理对象
  const proxy = createReative(obj);
  // 存储到 Map 中，从而避免重复创建
  reactiveMap.set(obj, proxy);

  return proxy;
}

/**
 * 浅响应
 * @param {*} obj 
 * @returns 
 */
export function shallowReactive(obj) {
  return createReative(obj, true);
}

/**
 * 深只读
 * @param {*} obj 
 * @returns 
 */
export function readonly(obj) {
  return createReative(obj, false, true);
}

/**
 * 浅只读
 * @param {*} obj 
 * @returns 
 */
export function shallowReadonly(obj) {
  return createReative(obj, true, true);
}

export function track(target, key) {
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

export function trigger(target, key, type, newVal) {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const effectsSet = depsMap.get(key);

  const effectsToRun = new Set();
  effectsSet && effectsSet.forEach((effectFn => {
    if (effectFn !== activeEffect) {
      effectsToRun.add(effectFn);
    }
  }));

  // 只有当操作类型为 ‘ADD’ 或 'DELETE' 或 Map 数据类型的 ‘SET’ 时，才触发与 ITERATE_KEY 相关联的副作用函数重新执行
  if (
    type === TriggerType.ADD || 
    type === TriggerType.DELETE ||
    (type === TriggerType.SET && getType(target) === 'Map')
  ) {
    // 取得与 ITERATE_KEY 相关联的副作用函数
    const iterateEffects = depsMap.get(ITERATE_KEY);

    // 将与 ITERATE_KEY 相关联的副作用函数也添加到 effectsToRun
    iterateEffects && iterateEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn);
      }
    });
  }
  // 操作类型为 ADD 或 DELETE 并且都是 Map 类型的数据
  if (
    (type === TriggerType.ADD || type === TriggerType.DELETE) &&
    getType(target) === 'Map'
  ) {
    const iterateMapEffects = depsMap.get(MAP_KEY_ITERATE_KEY);

    iterateMapEffects && iterateMapEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn);
      }
    });
  }
  // * 当操作类型为'ADD'且数据类型为数组时，取出并执行与length属性关联的副作用函数
  if (Array.isArray(target) && type === TriggerType.ADD) {
    // 取出与 length 相关联的副作用函数
    const lengthEffects = depsMap.get('length');

    // 将这些副作用函数添加到 effectsToRun 中，待执行
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
export function effect(fn, options = {}) {
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

/**
 * 调度器：当副作用函数需要重新执行时，不会立即执行，而是将它缓存到一个微任务队列，等执行栈清空后，再将它从微任务队列中取出并执行
 */
export function flushQueue() {
  // 定义一个任务队列，采用 Set 数据结构目的是自动去重
  const jobQueue = new Set();
  // 使用 Promise.resolve() 创建一个 promise 实例，我们用它将一个任务添加到微任务队列
  const p = Promise.resolve();
  
  // 一个标志代表是否正在刷新队列
  let isFlushing = false;
  function flushJob(job) {
    // 将 job 添加到任务队列 jobQueue 中
    jobQueue.add(job);
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
      jobQueue.length = 0;
    });
  }

  return {
    flushJob
  }
}

// 执行副作用函数，触发读取
export function computed(getter) {
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
export function watch(source, cb, options = {}) {
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

/**
 * 类型判断
 * @param {*} target 
 * @returns 
 */
export function getType(target) {
  const type = typeof target;
  if (type !== 'object') return type;
  return Object.prototype.toString.call(target).replace(/^\[object (\S+)\]$/, '$1');
}

// 抽离为独立的函数，方便复用
function iterationMethod() {
  const target = this.raw;
  const itr = target[Symbol.iterator]();
  const wrap = (val) => typeof val === 'object' && val !== null ? reactive(val) : val;

  // 迭代操作与集合中元素的数量有关，只要结合的 size 发生变化，就该触发迭代操作重新执行
  track(target, ITERATE_KEY);

  // 返回自定义的迭代器
  return {
    next() {
      // 调用原始迭代器的 next 方法获取 value 和 done
      const { value, done } = itr.next();
      return {
        // 如果 value 不是 undefined，则对其进行包裹
        value: value ? [wrap(value[0]), wrap(value[1])] : value,
        done
      };
    },
    // 实现可迭代协议，不然 entries 方法返回的不是一个可迭代对象（该对象有 next 方法，但不具有 Symbol.iterator 方法）
    [Symbol.iterator]() {
      return this;
    }
  };
}

function valuesIterationMethod() {
  const target = this.raw;
  // 通过 target.values 获取原始迭代器方法
  const itr = target.values();
  const wrap = (val) => typeof val === 'object' ? reactive(val) : val;
  track(target, ITERATE_KEY);

  return {
    next() {
      const { value, done } = itr.next();
      return {
        value: wrap(value),
        done
      }
    },
    [Symbol.iterator]() {
      return this;
    }
  }
}

function keysIterationMethod() {
  const target = this.raw;
  // 通过 target.keys 获取原始迭代器方法
  const itr = target.keys();
  const wrap = (val) => typeof val === 'object' ? reactive(val) : val;

  track(target, MAP_KEY_ITERATE_KEY);

  return {
    next() {
      const { value, done } = itr.next();
      return {
        value: wrap(value),
        done
      }
    },
    [Symbol.iterator]() {
      return this;
    }
  }
}

export function ref(val) {
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

export function toRef(obj, key) {
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

export function toRefs(obj) {
  const ret = {};
  for (const key in obj) {
    ret[key] = toRef(obj, key);
  }

  return ret;
}

export function proxyRefs(target) {
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