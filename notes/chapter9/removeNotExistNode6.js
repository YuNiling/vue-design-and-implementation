// ** 移除不存在的元素

import { Text, Comment, Fragment } from '../NODE_TYPE.js';
import rendererOption from '../rendererOption.js';

// 创建渲染器
function createRenderer(options) {

  // 通过 options 得到操作 DOM 的 API
  const {
    createElement,
    setElementText,
    insert,
    patchProps,
    setText,
    createText,
    createComment
  } = options;

  /**
   * “打补丁”（或更新或挂载）
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 容器
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
        const el = n2.el = createText(n2.children);
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
        const el = n2.el = createComment(n2.children);
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
      const oldChildren = n1.children;
      const newChildren = n2.children;

      // 用来存储寻找过程中遇到的最大索引值
      let lastIndex = 0;
      for (let i = 0; i < newChildren.length; i++) {
        const newVNode = newChildren[i];
        // 在第一层循环中定义变量 find，代表是是否在旧的一组子节点中找到可复用的节点，
        // 初始值为 false，代表没找到
        let find = false;
        for (let j = 0; j < oldChildren.length; j++) {
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
                console.log(`新节点 ${newVNode.children} 移动到节点 ${prevVNode.children} 之后`);
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
            console.log(`新节点 ${newVNode.children} 挂载到节点 ${prevVNode.children} 只后`);
            anchor = prevVNode.el.nextSibling;
          } else {
            console.log(`新节点 ${newVNode.children} 挂载到 container 容器第一个子节点位置`);
            // 如果没有前一个 vnode 节点，说明即将挂载的新节点是第一个子节点
            // 这时我们使用容器元素的 firstChild 作为锚点
            anchor = container.firstChild;
          }
          // 挂载 newVNode
          patch(null, newVNode, container, anchor);
        }
      }

      // 遍历旧的一组子节点，删除废弃的旧节点
      for (let i = 0; i < oldChildren.length; i++) {
        const oldVNode = oldChildren[i];
        // 拿旧节点 oldVNode 去新的一组子节点中寻找具有相同 key 值的节点
        const has = newChildren.find(
          vnode => vnode.key === oldVNode.key
        );
        if (!has) {
          // 如果没有找到具有相同 key 值的节点，则说明需要删除该节点
          // 调用 unmount 函数将其卸载
          console.log(`卸载旧节点 ${oldVNode.children}`);
          unmount(oldVNode);
        }
      }
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

const renderer = createRenderer(rendererOption);

// 测试
const vnode1 = {
  type: 'div',
  children: [
    { type: 'p', children: '1', key: 1 },
    { type: 'p', children: '2', key: 2 },
    { type: 'p', children: '3', key: 3  }
  ]
};
const vnode2 = {
  type: 'div',
  children: [
    { type: 'p', children: '3', key: 3 },
    { type: 'p', children: '1', key: 1 }
  ]
};
renderer.render(vnode1, document.querySelector('#app'));
setTimeout(() => {
  renderer.render(vnode2, document.querySelector('#app'));
}, 1000);
