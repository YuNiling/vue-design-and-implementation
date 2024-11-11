// * 组件事件与 emit 的实现
// * 1.emit 用来发射组件的自定义事件。
// * 2.发射自定义事件的本质就是根据事件名称去 props 数据对象中寻找对应的事件处理函数并执行。

import { ref, reactive, effect, flushQueue, shallowReactive, shallowReadonly } from '../reactive.js';
import { shouldSetAsProps, lis } from '../utils.js';

// 文本节点的 type 标识
const Text = Symbol();
// 注释节点的 type 标识
const Comment = Symbol();
// Fragment 节点的 type 标识
const Fragment = Symbol();

// 调度器
const flushQueueMethod = flushQueue();

// 创建渲染器
function createRenderer(options) {

  // 通过 options 得到操作 DOM 的 API
  const {
    createElement,
    setElementText,
    insert,
    patchProps,
    setText
  } = options;

  /**
   * “打补丁”（或更新或挂载）
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 容器
   * @param {*} anchor 锚点元素
   */
  function patch(n1, n2, container, anchor) {
    // 如果 n1 存在，则对比 n1 和 n2 的类型
    if (n1 && n1.type !== n2.type) {
      // 如果新旧 vnode 的类型不同，则直接将旧 vnode 卸载
      unmount(n1);
      n1 = null;
    }

    // 代码运行到这里，这里 n1 和 n2 所描述的内容相同
    const { type } = n2;
    // 如果 n2.type 的值是字符串类型，则描述的是普通标签元素
    if (typeof type === 'string') {
      if (!n1) {
        mountElement(n2, container, anchor);
      } else {
        patchElement(n1, n2);
      }
    } else if (type === Text) {
      // n2 是文本节点
      if (!n1) {
        // 如果没有旧节点，直接进行挂载
        const el = n2.el = document.createTextNode(n2.children);
        insert(el, container);
      } else { 
        // 如果旧节点存在，只需要使用新的文本节点的文本内容更新旧文本节点内容即可
        const el = n2.el = n1.el;
        if (n2.children !== n1.children) {
          setText(el, n2.children);
        }
      }
    } else if (type === Comment) {
      // n2 是注释节点
      if (!n1) {
        // 如果没有旧节点，直接进行挂载
        const el = n2.el = document.createComment(n2.children);
        insert(el, container);
      } else { 
        // 如果旧节点存在，只需要使用新的文本节点的文本内容更新旧文本节点内容即可
        const el = n2.el = n1.el;
        if (n2.children !== n1.children) {
          setText(el, n2.children);
        }
      }
    } else if (type === Fragment) {
      // n2 是 Fragment
      if (!n1) {
        // 如果旧 vnode 不存在，则只需要将 Fragment 的 children 逐个挂载即可
        n2.children.forEach(c => patch(null, c, container))
      } else {
        // 如果旧 vnode 存在，则只需要更新 Fragment 的 children 即可
        patchChildren(n1, n2, container)
      }
    } else if (typeof type === 'object') {
      // 如果 n2.type 的值的类型是对象，则它描述的是组件
      if (!n1) {
        // 挂载组件
        mountComponent(n2, container, anchor);
      } else {
        // 更新组件
        patchComponent(n1, n2, anchor);
      }
    }
  }

  /**
   * 比较新旧节点，进行打补丁
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   */
  function patchElement(n1, n2) {
    const el = n2.el = n1.el;
    const oldProps = n1.props;
    const newProps = n2.props;

    // 第一步：更新 props
    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProps(el, key, oldProps[key], newProps[key]);
      }
    }
    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProps(el, key, oldProps[key], null);
      }
    }

    // 第二步：更新 children
    patchChildren(n1, n2, el);
  }

  /**
   * 更新节点的 children，进行打补丁
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 当前正在被打补丁的 DOM 元素
   */
  function patchChildren(n1, n2, container) {
    // ** 新旧节点的类型有三种可能：没有子节点、文本节点以及一组子节点
    if (typeof n2.children === 'string') {
      // ** 新节点的类型是文本节点
      if (Array.isArray(n1.children)) {
        // 只有当旧节点为一组子节点时，才需要逐个卸载，其他情况下什么都不需要
        n1.children.forEach((c) => unmount(c));
      }
      // 最后将新的文本节点内容设置给容器元素
      setElementText(container, n2.children);
    } else if (Array.isArray(n2.children)) {
      // ** 新节点是一组子节点
      quickPatchKeyedChildren(n1, n2, container);
    } else {
      // ** 新节点是不存在
      if (Array.isArray(n1.children)) {
        n1.children.forEach(c => unmount(c));
      } else if (typeof n1.children === 'string') {
        setElementText(container, '');
      }
    }
  }

  /**
   * 简单 Diff 算法
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 当前正在被打补丁的 DOM 元素
   */
  function patchSimpleChildren(n1, n2, container) {
    const oldChildren = n1.children;
    const newChildren = n2.children;

    // 用来存储寻找过程中遇到的最大索引值
    let lastIndex = 0;
    for (let i = 0; i < newChildren.length; i++) {
      const newVNode = newChildren[i];
      let j = 0;
      // 在第一层循环中定义变量 find，代表是是否在旧的一组子节点中找到可复用的节点，
      // 初始值为 false，代表没找到
      let find = false;
      for (j; j < oldChildren.length; j++) {
        const oldVNode = oldChildren[j];
        // 如果找到了具有相同 key 值的两个节点，说明可以复用，但仍然需要调用 patch 函数更新
        if (newVNode.key === oldVNode.key) {
          // 一旦找到可复用的节点，则将变量 find 的值设为 true
          find = true;
          patch(oldVNode, newVNode, container);
          if (j < lastIndex) {
            // 如果当前找到的节点在旧 children 中的索引小于最大索引值 lastINdex,
            // 说明该节点对应的真实 DOM 需要移动
            // 先获取 newVNode 的前一个 vnode，即 prevVNode
            const prevVNode = newChildren[i - 1];
            // 如果 prevVNode 不存在，则说明当前 newVNode 是第一个节点，它不需要移动
            if (prevVNode) {
              // 由于我们要将 newVNode 对应的真实 DOM 移动到 prevVNode 所对应真实 DOM 后面，
              // 所以我们需要读取 prevVNode 所对应真实 DOM 的下一个兄弟节点，将其作为锚点
              const anchor = prevVNode.el.nextSibling;
              // 调用 insert 方法将 newVNode 对应的真实 DOM 插入到锚点前面，
              // 也就是 prevVNode 对应真实 DOM 的后面
              insert(newVNode.el, container, anchor);
            }
          } else {
            // 如果当前找到的节点在旧 children 中的索引不小于最大索引值
            // 则更新 lastIndex 的值
            lastIndex = j;
          }
          break;
        }
      }

      // 如果此时 find 为 false，说明当前 newVNode 没有在旧的一组子节点中找到可复用的节点，即 newVNode 是新增节点，需要挂载
      if (!find) {
        // 为了将节点挂载到正确位置，我们需要先获取锚点元素
        // 首先获取当前 newVNode 的前一个 vnode 节点
        const prevVNode = newChildren[i - 1];
        let anchor = null;
        if (prevVNode) {
          // 如果有前一个 vnode 节点，则使用它的下一个兄弟节点作为锚点元素
          anchor = prevVNode.el.nextSibling;
        } else {
          // 如果没有前一个 vnode 节点，说明即将挂载的新节点是第一个子节点
          // 这时我们使用容器元素的 firstChild 作为锚点
          anchor = container.firstChild;
        }
        // 挂载 newVNode
        patch(null, newVNode, container, anchor);
      }

      // 遍历旧的一组子节点
      for (let i = 0; i < oldChildren.length; i++) {
        const oldVNode = oldChildren[i];
        // 拿旧节点 oldVNode 去新的一组子节点中寻找具有相同 key 值的节点
        const has = newChildren.find(
          vnode => vnode.key === oldVNode.key
        );
        if (!has) {
          // 如果没有找到具有相同 key 值的节点，则说明需要删除该节点
          // 调用 unmount 函数将其卸载
          unmount(oldVNode);
        }
      }
    }
  }

  /**
   * 双端 Diff 算法
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 当前正在被打补丁的 DOM 元素
   */
  function patchKeyedChildren(n1, n2, container) {
    const oldChildren = n1.children;
    const newChildren = n2.children;
    // 四个索引值
    let oldStartIdx = 0;
    let oldEndIdx = oldChildren.length - 1;
    let newStartIdx = 0;
    let newEndIdx = newChildren.length - 1;
    // 四个索引指向的 vnode 节点
    let oldStartVNode = oldChildren[oldStartIdx];
    let oldEndVNode = oldChildren[oldEndIdx];
    let newStartVNode = newChildren[newStartIdx];
    let newEndVNode = newChildren[newEndIdx];

    while(oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      // 增加两个判断分支，如果旧头部节点为 undefined，则说明该节点已经被处理过了，直接跳下一个位置
      if (!oldStartVNode) {
        oldStartVNode = oldChildren[++oldStartIdx];
      } else if (oldStartVNode.key === newStartVNode.key) {
        // 由于两者都处于头部，不需要对真实 DOM 进行移动，只需要打补丁即可
        patch(oldStartVNode, newStartVNode, container);
        oldStartVNode = oldChildren[++oldStartIdx];
        newStartVNode = newChildren[++newStartIdx];
      } else if (oldEndVNode.key === newEndVNode.key) {
        // 由于两者都处于尾部，不需要对真实 DOM 进行移动，只需要打补丁即可
        patch(oldEndVNode, newEndVNode, container);
        oldEndVNode = oldChildren[--oldEndIdx];
        newEndVNode = newChildren[--newEndIdx];
      } else if (oldStartVNode.key === newEndVNode.key) {
        // 从原本的头部节点变成尾部节点，需要将真实 DOM 移动到 oldEndVNode 后面
        patch(oldStartVNode, newEndVNode, container);
        // 移动 DOM 操作：oldStartVNode.el 移动到 oldEndVNode.el 节点的后面
        insert(oldStartVNode.el, container, oldEndVNode.el.nextSibling);
        oldStartVNode = oldChildren[++oldStartIdx];
        newEndVNode = newChildren[--newEndIdx];
      } else if (oldEndVNode.key === newStartVNode.key) {
        // 仍然需要调用 patch 函数进行打补丁
        patch(oldEndVNode, newStartVNode, container);
        // 移动 DOM 操作：oldEndVNode.el 移动到 oldStartVNode.el 前面
        insert(oldEndVNode.el, container, oldStartVNode.el);
        // 移动 DOM 完成后，更新索引值，并指向下一个位置
        oldEndVNode = oldChildren[--oldEndIdx];
        newStartVNode = newChildren[++newStartIdx];
      } else {
        // 遍历旧的一组子节点，试图寻找与 newStartVNode 拥有相同 key 值的节点
        // idxInOld 就是新的一组子节点的头部节点在旧的一组子节点中的索引
        const idxInOld = oldChildren.findIndex(
          node => node.key === newStartVNode.key
        );
        // idxInOld 大于 0，说明找到了可复用的节点，并且需要将其对应的真实 DOM 移动到头部
        if (idxInOld > 0) {
          // idxInOld 位置对应的 vnode 就是需要移动的节点
          const vnodeToMove = oldChildren[idxInOld];
          // 不要忘记除移动操作外还应该打补丁
          patch(vnodeToMove, newStartVNode, container);
          // 将 vnodeToMove.el 移动到头部节点 oldStartVNode.el 之前，因此使用后者作为锚点
          insert(vnodeToMove.el, container, oldStartVNode.el);
          // 由于位置 idxInOld 处的节点所对应的真实 DOM 已经移动到了别处，因此将其设置为 undefined
          oldChildren[idxInOld] = undefined;
        } else {
          // 将 newStartVNode 作为新节点挂载到头部，使用当前头部节点 oldStartVNode.el 作为锚点
          patch(null, newStartVNode, container, oldStartVNode.el);
        }
        // 最后更新 newStartIdx 到下一个位置
        newStartVNode = newChildren[++newStartIdx];
      }
    }

    // 循环结束后检查索引值的情况
    if (oldEndIdx < oldStartIdx && newEndIdx <= newStartIdx) {
      // 如果满足条件，则说明有新的节点遗留，需要挂载它们
      for (let i = newStartIdx; i <= newEndIdx; i++) {
        patch(null, newChildren[i], container, oldStartVNode.el);
      }
    } else if (newEndIdx < newStartIdx && oldStartIdx <= oldEndIdx) {
      // 移除操作
      for (let i = oldStartIdx; i <= oldEndIdx; i++) {
        unmount(oldChildren[i]);
      }
    }
  }

  /**
   * 快速 Diff 算法
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 当前正在被打补丁的 DOM 元素
   */
  function quickPatchKeyedChildren(n1, n2, container) {
    const oldChildren = n1.children;
    const newChildren = n2.children;
    // 处理相同的前置节点
    // 索引 j 指向新旧两组子节点的开头
    let j = 0;
    let oldVNode = oldChildren[j];
    let newVNode = newChildren[j];
    // while 循环向后遍历，直到遇到拥有不同 key 值的节点为止
    while (oldVNode.key === newVNode.key) {
      // 调用 patch 函数进行更新
      patch(oldVNode, newVNode, container);
      // 更新索引 j，让其递增
      j++;
      oldVNode = oldChildren[j];
      newVNode = newChildren[j];
    }

    // 更新相同的后置节点
    // 索引 oldEnd 指向旧的一组子节点的最后一个节点
    let oldEnd = oldChildren.length - 1;
    // 索引 newEnd 指向新的一组子节点的最后一个节点
    let newEnd = newChildren.length - 1;

    oldVNode = oldChildren[oldEnd];
    newVNode = newChildren[newEnd];

    // while 循环从后向前遍历，直到遇到拥有不同 key 值的节点为止
    while (oldVNode.key === newVNode.key) {
      // 调用 patch 函数进行更新
      patch(oldVNode, newVNode, container);
      // 递减 oldEnd 和 newEnd
      oldEnd--;
      newEnd--;
      oldVNode = oldChildren[oldEnd];
      newVNode = newChildren[newEnd];
    }

    // 预处理完毕后，如果满足以下条件
    if (oldEnd < j && j <= newEnd) {
      // ** j --> newEnd 之间的节点应作为新节点插入
      // 锚点的索引
      const anchorIndex = newEnd + 1;
      // 锚点元素
      const anchor = anchorIndex < newChildren.length ? newChildren[anchorIndex].el : null;
      // 采用 while 循环，调用 patch 函数逐个挂载新增节点
      while (j <= newEnd) {
        patch(null, newChildren[j++], container, anchor);
      }
    } else if (newEnd < j && j <= oldEnd) {
      // ** j --> newEnd 之间的节点应该被卸载
      while (j <= oldEnd) {
        unmount(oldChildren[j++]);
      }
    } else {
      // ** 处理非理想情况
      // 构造 source 苏组
      // 新的一组子节点中剩余未处理节点的数量
      const count = newEnd - j + 1;
      const source = new Array(count).fill(-1);

      // oldStart 和 newStart 分别为起始索引，即 j
      const oldStart = j;
      const newStart = j;
      // 新增两个变量，moved 和 pos
      let moved = false;
      let pos = 0;

      // 构建索引表
      const keyIndex = {};
      for (let i = newStart; i <= newEnd; i++) {
        keyIndex[newChildren[i].key] = i;
      }

      // 新增 patched 变量，代表更新过的节点数量
      let patched = 0;
      // 遍历旧的一组子节点中剩余未处理的节点
      for (let i = oldStart; i <= oldEnd; i++) {
        oldVNode = oldChildren[i];
        // 如果更新过的节点数量小于等于需要更新的节点数量，则执行更新
        if (patched <= count) {
          // 通过索引表快速找到新的一组子节点中具有相同 key 值的节点为止
          const k = keyIndex[oldVNode.key];
  
          if (typeof k !== 'undefined') {
            newVNode = newChildren[k];
            // 调用 patch 进行更新
            patch(oldVNode, newVNode, container);
            // 每更新一个节点，都将 patched 变量 +1
            patched++;
            // 最后填充 source 数组
            source[k - newStart] = i;
            // 判断节点是否移动
            if (k < pos) {
              moved = true;
            } else {
              pos = k;
            }
          } else {
            // 没找到
            unmount(oldVNode);
          }
        } else {
          // 如果更新过的节点数量大于需要更新的节点，则卸载多余的节点
          unmount(oldVNode);
        }
      }

      if (moved) {
        // 如果 moved 为真，则需要进行 DOM 移动个操作
        // 计算最长递增子序列
        const seq = lis(source);
        // s 指向最长递增子序列的最后一个元素
        let s = seq.length - 1;
        // i 指向新的一组子节点的最后一个元素
        let i = count - 1;
        // for 循环使得 i 递减，向前移动
        for (i; i >= 0; i--) {
          if (source[i] == -1) {
            // ** 节点是全新节点，应该将其挂载
            // 该节点在新 children 中的真实位置索引
            const pos = i + newStart;
            newVNode = newChildren[pos];
            // 该节点的下一个节点的位置索引
            const nextPos = pos + 1;
            // 锚点
            const anchor = nextPos < newChildren.length ? newChildren[nextPos].el : null;
            // 挂载
            patch(null, newVNode, container, anchor);
          } else if (i !== seq[s]) {
            // ** 节点需要移动
            // 该节点在新 children 中的真实位置索引
            const pos = i + newStart;
            newVNode = newChildren[pos];
            // 该节点的下一个节点的位置索引
            const nextPos = pos + 1;
            // 锚点
            const anchor = nextPos < newChildren.length ? newChildren[nextPos].el : null;
            // 移动
            insert(newVNode.el, container, anchor);
          } else {
            // ** 节点不需要移动，只需要让 s 指向下一个位置
            s--;
          }
        }
      }
    }
  }

  /**
   * 检测为子组件传递的 props 是否发生变化
   * @param {Object} prevProps 旧子组件的 props
   * @param {Object} nextProps 新子组件的 props
   */
  function hasPropsChanged(prevProps, nextProps) {
    const nextKeys = Object.keys(nextProps);
    // 如果新旧 props 的数量变了，则说明有变化
    if (nextKeys.length !== Object.keys(prevProps).length) return false;
    for (let i = 0; i < nextKeys.length; i++) {
      const key = nextKeys[i];
      // 有不相等的 props，则说明有变化
      if (nextProps[key] !== prevProps[key]) return true;
    }
    return false;
  }
  
  /**
   * 解析组件 props 和 attrs 数据
   * @param {*} options 组件选项对象中定义到 props 选项，即 MyComponent.props 对象
   * @param {*} propsData 组件传递的 props 数据，即组件的 vnode.props 对象
   */
  function resolveProps(options = {}, propsData = {}) {
    const props = {};
    const attrs = {};

    // 遍历为组件传递的 props 数据
    for (const key in propsData) {
      if (key in options || key.startsWith('on')) {
        // 如果为组件传递的 props 数据中组件自身的 props 选项中有定义，则将其视为合法的 props
        // 以字符串 on 开头的 props，无论是否显式地声明，都将其添加到 props 数据中，而不是添加到 attrs 中
        props[key] = propsData[key];
      } else {
        // 否则将其作为 attrs
        attrs[key] = propsData[key];
      }
    }

    // 最后返回 props 与 attrs 数据
    return [props, attrs];
  }

  /**
   * 更新子组件
   * @param {*} n1 旧子组件 vnode
   * @param {*} n2 新子组件 vnode
   * @param {*} anchor 锚点元素
   */
  function patchComponent(n1, n2, anchor) {
    // 获取组件实例，即 n1.component，同时让新的组件虚拟节点 n2.component 也指向组件实例
    const instance = (n2.component = n1.component);
    // 获取当前的 props 数据
    const { props } = instance;
    // 调用 hasPropsChanged 检测为子组件传递的 props 是否发生变化，如果没有变化，则不需要更新
    if (hasPropsChanged(n1.props, n2.props)) {
      // 调用 resolveProps 重新获取 props 数据
      const [ nextProps ] = resolveProps(n2.type.props, n2.props);
      // 更新 props
      for (const k in nextProps) {
        props[k] = nextProps[k];
      }
      // 删除不存在的 props
      for (const k in props) {
        if (!(k in nextProps)) {
          delete props[k];
        }
      }
    }
  }

  /**
   * 挂载组件
   * @param {*} vnode 
   * @param {*} container 容器
   * @param {*} anchor 锚点元素
   */
  function mountComponent(vnode, container, anchor) {
    // 通过 vnode 获取组件的选项对象，即 vnode.type
    const componentOptions = vnode.type;
    // 从组件选项对象中取得组件的什么周期函数
    let {
      render, 
      data,
      props: propsOption,
      setup,
      beforeCreate, 
      created, 
      beforeMount, 
      mounted, 
      beforeUpdate, 
      updated
    } = componentOptions;

    // 在这里调用 beforeCreate 钩子
    beforeCreate && beforeCreate();

    // 调用 data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
    const state = data ? reactive(data()) : null;
    // 调用 resolveProps 函数解析出最终的 props 数据与 attrs 数据
    const [props, attrs] = resolveProps(propsOption, vnode.props);

    // 定义组件实例，一个组件实例本质上就是一个对象，它包含与组件有关的状态信息
    const instance = {
      // 组件自身的状态数据，即 data
      state,
      // 将解析出的 props 数据包装为 shalloReactive 并定义到组件实例上
      props: shallowReactive(props),
      // 一个布尔值，用来表示组件是否已经被挂载，初始值为 false
      isMounted: false,
      // 组件所渲染的内容，即子树（subTree）
      subTree: null
    };

    /**
     * 发射自定义事件
     * @param {*} event 事件名称
     * @param  {...any} payload 传递给事件处理函数的参数
     */
    function emit(event, ...payload) {
      // 根据约定对事件名称进行处理，例如 change --> onChange
      const eventName = `on${event[0].toUpperCase() + event.slice(1)}`;
      // 根据处理后的事件名称去 props 中寻找对应的事件处理函数
      const handler = instance.props[eventName];
      if (handler) {
        // 调用事件处理函数并传递参数
        handler(...payload);
      } else {
        console.error('事件不存在');
      }
    }

    // setupContext，由于我们还没有讲解 slots，所以暂时只需要 attrs、emit
    const setupContext = { attrs, emit };
    // 调用 setup 函数，将只读版本的 props 作为第一个参数传递，避免用户意外地修改 props 的值，将 setupContext 作为第二个参数传递
    const setupResult = setup(shallowReadonly(instance.props), setupContext);
    // setupState 用户存储由 setup 返回的数据
    let setupState = null;
    // 如果 setup 函数的返回值是函数，则将其作为渲染函数
    if (typeof setupResult === 'function') {
      // 报告冲突
      if (render) console.error('setup 函数返回渲染函数，render 选项将被忽略');
      render = setupResult;
    } else {
      // 如果 setup 的返回值不是函数，则作为数据状态赋值给 setupState
      setupState = setupResult;
    }

    vnode.component = instance;

    // 创建渲染上下文对象，本质上是组件实例的代理
    const renderContext = new Proxy(instance, {
      get (target, key, receiver) {
        // 取得组件自身状态与 props 数据
        const { state, props } = target;
        if (state && key in state) {
          // 先尝试读取自身状态数据
          return state[key];
        } else if (key in props) {
          // 如果组件自身没有该数据，则尝试从 props 中读取
          return props[key];
        } else if (setupState && key in setupState) {
          // 渲染上下文需要增加对 setupState 的支持
          return setupState[key].__v_isRef ? setupState[key].value : setupState[key];
        } else {
          console.error('不存在');
        }
      },
      set (target, key, value, receiver) {
        const { state, props } = target;
        if (state && key in state) {
          state[key] = value;
        } else if (key in props) {
          props[key] = value;
        } else if (setupState && key in setupState) {
          if (setupState[key].__v_isRef) {
            setupState[key].value = value;
          } else {
            setupState[key] = value;
          }
        } else {
          console.error('不存在');
        }
      }
    });

    // 在这里调用 created 钩子，调用时要绑定渲染上下文对象
    created && created.call(renderContext);

    // 将组件的 render 函数调用包装到 effect 内，实现组件的自更新
    effect(() => {
      // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的虚拟 DOM
      // 调用 render 函数时，将其 this 设置为 renderContext，从而 render 函数内部可以通过 this 访问组件自身状态数据
      const subTree = render.call(renderContext);
      // 检查组件是否已经被挂载
      if (!instance.isMounted) {
        // 在这里调用 beforeMount 钩子
        beforeMount && beforeMount.call(renderContext);
        // 初次挂载，调用 patch 函数第一个参数传递 null
        patch(null, subTree, container, anchor);
        // 重点：将组件实例的 isMounted 设置为 true，这样当更新发生时就不会再次进行挂载操作，而是会执行更新
        instance.isMounted = true;
        // 在这里调用 mounted 钩子
        mounted && mounted.call(renderContext);
      } else {
        // 在这里调用 beforeUpdate 钩子
        beforeUpdate && beforeUpdate.call(renderContext);
        // 当 isMounted 为 true 时，说明组件已经被挂载，只需要完成自更新即可，
        // 所以在调用 patch 函数时，第一个参数为组件上一次渲染的子树
        // 意思是，使用新的子树与上一次渲染的子树进行打补丁操作
        patch(instance.subTree, subTree, container, anchor);
        // 这里调用 updated 钩子
        updated && updated.call(renderContext);
      }
      // 更新组件实例的子树
      instance.subTree = subTree;
    }, {
      // 指定该副作用函数的调度器为 flushQueueMethod.flushJob 即可
      scheduler: flushQueueMethod.flushJob
    });
  }

  /**
   * 挂载元素
   * @param {*} vnode 虚拟节点
   * @param {*} container 挂载点
   * @param {*} anchor 锚点元素
   */
  function mountElement(vnode, container, anchor) {
    // 创建 DOM 元素，让 vnode.el 引用真实 DOM 元素
    const el = vnode.el = createElement(vnode.type);

    // 处理子节点，如果子节点是字符串，代表元素具有文本节点
    if (typeof vnode.children === 'string') {
      setElementText(el, vnode.children);
    } else if (Array.isArray(vnode.children)) {
      // 如果 children 是数组，则遍历每一个子节点，并调用 patch 函数挂载它们
      vnode.children.forEach(child => {
        patch(null, child, el);
      });
    }

    // 如果 vnode 存在才处理它
    if (vnode.props) {
      // 遍历 vnode.props
      for (const key in vnode.props) {
        patchProps(el, key, null, vnode.props[key]);
      }
    }

    insert(el, container, anchor);
  }

  /**
   * 渲染方法
   * @param {*} vnode 虚拟节点
   * @param {*} container 挂载点
   */
  function render(vnode, container) {
    if (vnode) {
      // 新 vnode 存在，将其与旧 vnode 一起传递给 patch 函数，进行打补丁
      patch(container._vnode, vnode, container);
    } else {
      if (container._vnode) {
        // 旧 vnode 存在，且新 vnode 不存在，说明是卸载（unmount）操作
        unmount(container._vnode);
      }
    }

    // 把 vnode 存储到 container._vnode 下，即后续渲染中的旧 vnode
    container._vnode = vnode;
  }

  /**
   * 卸载节点：将指定虚拟节点对应的真实 DOM 元素从父元素中移除
   * @param {*} vnode 虚拟节点
   */
  function unmount(vnode) {
    // 在卸载时，如果卸载的 vnode 类型为 Fragment，则需要卸载其 children
    if (vnode.type === Fragment) {
      vnode.children.forEach(c => unmount(c));
      return;
    }
    
    const parent = vnode.el.parentNode;
    if (parent) parent.removeChild(vnode.el);
  }

  return {
    render
  };
}

const renderer = createRenderer({
  // 用于创建元素
  createElement(tag) {
    // console.log(`创建元素 ${tag}`);
    return document.createElement(tag);
  },
  // 用于设置元素的文本节点
  setElementText(el, text) {
    // console.log(`设置 ${el.outerHTML} 的文本内容：${text}`);
    el.textContent = text;
  },
  setText(el, text) {
    el.nodeValue = text;
  },
  // 用于在给定的 parent 下添加指定元素
  insert(el, parent, anchor = null){
    // console.log(el.outerHTML);
    // console.log(`将 ${el.outerHTML} 添加到 ${parent.outerHTML} 下，在 ${anchor} 之前`);
    parent.insertBefore(el, anchor);
  },
  // 将属性设置相关操作封装到 patchProps 函数中，并作为渲染器选项传递
  patchProps(el, key, prevValue, nextValue) {
    if (/^on/.test(key)) {
      // 定义 el._vei 为一个对象，存在事件名称到事件处理函数的映射
      const invokers = el._vei || (el._vei = {});
      let invoker = invokers[key];
      const name = key.slice(2).toLowerCase();
      if (nextValue) {
        if (!invoker) {
          // 如果没有 invoker，则将一个伪造的 invoker 缓存到 el._vei 中
          // vei 是 vue event invoker 的首字母缩写
          invoker = el._vei[key] = (e) => {
            // e.timeStamp 是事件触发时间
            // 如果事件触发时间早于事件绑定时间，则不执行事件处理函数
            if (e.timeStamp < invoker.attached) return;
            // 当伪造的事件处理函数执行时，会执行真正的事件处理函数
            if (Array.isArray(invoker.value)) {
              invoker.value.forEach(fn => fn(e));
            } else {
              invoker.value(e);
            }
          };
          // 将真正的事件处理函数赋值给 invoker.value
          invoker.value = nextValue;
          // 添加 invoker.attached 属性，存储事件绑定时间
          invoker.attached = performance.now();
          // 绑定 invoker 作为事件处理函数
          el.addEventListener(name, invoker);
        } else {
          // 如果 invoker 存在，意味着更新，并且值需要更新 invoker.value 的值即可。
          invoker.value = nextValue;
        }
      } else if (!nextValue && invoker) {
        // 新的事件绑定函数不存在，且之前绑定的 invoker 存在，则移除绑定
        el.removeEventListener(name, invoker);
      }
    } else if (key === 'class') {
      el.className = nextValue || '';
    } else if (shouldSetAsProps(el, key, nextValue)) {
      if (type === 'boolean' && nextValue === '') {
        el[key] = true;
      } else {
        el[key] = nextValue;
      }
    } else {
      el.setAttribute(key, nextValue);
    }
  }
});

// 测试：<MyComponent @change="handler" />
const handler = (...args) => {
  console.log('handler', ...args);
};
const MyComponent = {
  name: 'MyComponent',
  setup(props, { emit }) {
    // 发射 change 事件，并传递给事件处理函数两个参数
    emit('change', 1, 2);

    return () => {
      return { type: 'div', children: 'hello' }
    }
  }
};
const vnode = {
  type: MyComponent,
  props: {
    onChange: handler
  }
};
renderer.render(vnode, document.querySelector('#app'));
