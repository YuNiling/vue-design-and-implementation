// ** 节点的 type 标识

import { ref, shallowRef } from "./reactive.js";
import { getCurrentInstance, onUnmounted } from "./lifeCycle.js";

//-- 文本节点的 type 标识
export const Text = Symbol();

//-- 注释节点的 type 标识
export const Comment = Symbol();

//-- Fragment 节点的 type 标识
export const Fragment = Symbol();

//-- KeepAlive 节点 type 标识
// 创建一个缓存对象
// key: vnode.type
// value: vnode
const cache = new Map();
export const KeepAlive = {
  // KeepAlive 组件独有的属性，用作标识
  __isKeepAlive: true,
  // 定义 include 和 exclude
  props: {
    include: RegExp,
    exclude: RegExp,
    max: Number
  },
  setup(props, { slots }) {
    // 当前 KeepAlive 组件的实例
    const instance = getCurrentInstance();
    // 对于 KeepAlive 组件来说，它的实例上存在特殊的 keepAliveCtx 对象，该对象由渲染器注入
    // 该对象会暴露渲染器的一些内容方法，其中 move 函数用来将一段 DOM 移动到另一个容器中
    const { move, createElement } = instance.keepAliveCtx;

    // 创建隐藏容器
    const storageContainer = createElement('div');

    // KeepAlive 组件的实例上会被添加两个内部函数，分别是 _deActivate 和 _activate
    // 这两个函数会在渲染器中被调用
    instance._deActivate = (vnode) => {
      move(vnode, storageContainer);
    };
    instance._activate = (vnode, container, anchor) => {
      move(vnode, container, anchor);
    };

    return () => {
      // KeepAlive 的默认插槽就是要被 KeepAlive 的组件
      let rawVNode = slots.default();
      // 如果不是组件，直接渲染即可，因为非组件的虚拟节点无法被 KeepAlive
      if (typeof rawVNode.type !== 'object') {
        return rawVNode;
      }
      // 获取“内部组件”的 name
      const name = rawVNode.type.name;
      // 对 name 进行匹配
      if (name && 
        (
          (props.include && !props.include.test(name)) ||
          (props.exclude && props.exclude.test(name))
        )
      ) {
        // 如果 name 无法被 include 匹配，或者被 exclude 匹配
        // 则直接渲染“内部组件”，不对其进行后续缓存操作
        return rawVNode;
      }

      // 在挂载时先获取缓存的组件 vnode
      const cachedVNode = cache.get(rawVNode.type);
      if (cachedVNode) {
        // 如果有缓存的内容，则说明不应该执行挂载，而应该执行激活
        // 继承组件实例
        rawVNode.component = cachedVNode.component;
        // 在 vnode 上添加 keptAlive 属性，标记为 true，避免渲染器重新挂载它
        rawVNode.keptAlive = true;
        cache.delete(rawVNode.type);
      }
      cache.set(rawVNode.type, rawVNode);
      if (props.max && cache.size > props.max) {
        const firstKey = cache.keys().next().value;
        const cached = cache.get(firstKey);
        if (cached) {
          cached.component.unmount(cached);
          cache.delete(firstKey);
        }
      }

      // 在组件 vnode 上添加 shouldKeepAlive 属性，并标记为 true，避免渲染器真的将组件卸载
      rawVNode.shouldKeepAlive = true;
      // 将 KeepAlive 组件的实例也添加到 vnode 上，以便在渲染器中访问
      rawVNode.keepAliveInstance = instance;

      // 渲染组件
      return rawVNode;
    };
  }
};

//-- Teleport 节点 type 标识
export const Teleport = {
  __isTeleport: true,
  // 在这里处理渲染逻辑
  process(n1, n2, container, anchor, internals) {
    // 通过 internals 参数获取渲染器的内部方法
    const { patch, patchChildren, move } = internals;
    // 如果旧 VNode n1 不存在，则是全新的挂载，否则执行更新
    if (!n1) {
      // 挂载
      // 获取容器，即挂载点
      const target = typeof n2.props.to === 'string'
        ? document.querySelector(n2.props.to)
        : n2.props.to;
      // 将 n2.children 需然道指定挂载点即可
      n2.children.forEach(c => patch(null, c, target, anchor));
    } else {
      // 更新
      patchChildren(n1, n2, container);
      // 如果新旧 to 参数的值不同，则需要对内容进行移动
      if (n2.props.to !== n1.props.to) {
        // 获取新的容器
        const newTarget = typeof n2.props.to === 'string'
          ? document.querySelector(n2.props.to)
          : n2.props.to;
        // 移动到新的容器
        n2.children.forEach(c => move(c, newTarget));
      }
    }
  }
};

/**
 * 定义异步组件
 * @param {*} loader 异步组件加载器
 */
export function defineAsyncComponent(options) {
  if (typeof options === 'function') {
    options = {
      loader: options
    };
  }

  const { loader } = options;

  // 一个遍历，用来存储异步加载的组件
  let InnerComp = null;
  // 异步组件是否加载成功
  const loaded = ref(false);
  // 定义 error，当错误发生时，用来存储错误对象
  const error = shallowRef(null);
  // 一个标志，代表是否正在加载，默认为 false
  const loading = ref(false);

  // 记录重试次数
  const retries = ref(0);
  // 是否取消 loader() 请求，默认 false，即不取消请求
  let isCancled = false;
  // 判断请求是否完成，无论请求成功还是失败
  let isLoaded = false;
  // 封装 load 函数用来加载异步组件
  function load() {
    loading.value = true;
    error.value = null;
    isCancled = false;
    isLoaded = false;

    return new Promise((resolve, reject) => {
      return loader()
        .then((c) => {
          resolve(c);
        })
        // 捕获加载器的错误
        .catch((err) => {
          // // 如果用户指定了 onError 回调，则将控制权交给用户
          if (options.onError) {
            // 重试
            const retry = () => {
              retries.value++;
              resolve(load());
            };
            // 失败
            const fail = () => reject(err);
            // 作为 onError 回调函数的参数，让用户来决定下一步怎么做
            options.onError(retry, fail, retries.value);
          } else {
            reject(err);
          }
        });
    });
  }

  // 返回一个包装组件
  return {
    name: 'AsyncComponentWrapper',
    setup() {
      let timeoutTimer = null;
      let loadingTimer = null;

      // 如果配置项中存在 delay，则开启一个定时器计时，当延迟到时后将 loading.value 设置为 true
      if (options.delay) {
        loadingTimer = setTimeout(() => {
          loading.value = true;
        }, options.delay);
      } else {
        // 如果配置项中没有 delay，则直接标记为加载中
        loading.value = true;
      }

      // 执行加载器函数，返回一个 Promise 实例
      // 加载成功后，将加载成功的组件赋值给 InnerComp，并将 loaded 标记为 true，代表加载成功
      load()
        .then(c => {
          isLoaded = true;
          if (isCancled) return;
          clearTimeout(timeoutTimer);
          InnerComp = c;
          loaded.value = true;
        })
        .catch((err) => {
          isLoaded = true;
          if (isCancled) return;
          clearTimeout(timeoutTimer);
          error.value = err;
        })
        .finally(() => {
          isLoaded = true;
          loading.value = false;
          // 加载完成后，无论成功与否都要清除延迟计时器
          clearTimeout(loadingTimer);
        });

      if (options.timeout) {
        // 如果指定了超时时长，则开启一个计时器计时
        timeoutTimer = setTimeout(() => {
          if (!isLoaded) return;
          const err = new Error(`Async component timed out after ${options.timeout}ms.`);
          error.value = err;
          isCancled = true;
        }, options.timeout);
      }

      // 包装组件被卸载时清除定时器
      onUnmounted(() => clearTimeout(timeoutTimer));

      // 占位内容
      const placeholder = { type: Text, children: '占位符' };

      return () => {
        // 如果异步组件加载成功，则渲染该组件，否则渲染一个占位内容
        if (loaded.value) {
          return { type: InnerComp };
        } else if (error.value && options.errorComponent) {
          return { 
            type: options.errorComponent,
            props: {
              error: error.value
            }
          };
        } else if (loading.value && options.loadingComponent) {
          return { type: options.loadingComponent };
        } else {
          return placeholder;
        }
      };
    }
  }
}