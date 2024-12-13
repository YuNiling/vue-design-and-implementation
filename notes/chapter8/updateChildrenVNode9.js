// ** 更新子节点（先看这章节，在看上一章节《事件冒泡与更新时机问题》）

import { shouldSetAsProps } from '../utils.js';

// 创建渲染器
function createRenderer(options) {

  // 通过 options 得到操作 DOM 的 API
  const {
    createElement,
    setElementText,
    insert,
    patchProps
  } = options;

  /**
   * “打补丁”（或更新或挂载）
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 容器
   */
  function patch(n1, n2, container) {
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
        mountElement(n2, container);
      } else {
        patchElement(n1, n2);
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
      if (Array.isArray(n1.children)) {
        // 新旧节点都是一组子节点
        // 将旧的一组子节点全部卸载
        n1.children.forEach(c => unmount(c));
        // 再将新的一组子节点全部挂载到容器上
        n2.children.forEach(c => patch(null, c, container));
      } else {
        // 旧子节点要么是文本节点，要么不存在
        // 但无论哪种情况，我们都只需要将容器清空，然后将新的一组子节点逐个挂载
        setElementText(container, '');
        n2.children.forEach(c => patch(null, c, container));
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
   */
  function mountElement(vnode, container) {
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

    insert(el, container);
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
    return document.createElement(tag);
  },
  // 用于设置元素的文本节点
  setElementText(el, text) {
    el.textContent = text;
  },
  // 用于在给定的 parent 下添加指定元素
  insert(el, parent, anchor = null){
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
            // 当伪造的事件处理函数执行时，会执行真正的事件处理函数
            if (Array.isArray(invoker.value)) {
              invoker.value.forEach(fn => fn(e));
            } else {
              invoker.value(e);
            }
          };
          // 将真正的事件处理函数赋值给 invoker.value
          invoker.value = nextValue;
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
      const type = typeof el[key];
      if (type === 'boolean' && nextValue === '') {
        el[key] = true;
      } else {
        if (!nextValue) {
          el.removeAttribute(key);
        } else {
          el[key] = nextValue;
        }
      }
    } else {
      el.setAttribute(key, nextValue);
    }
  }
});

for (let i = 1; i <= 8; i++) {
  let box = document.createElement('box');
  box.id = `box${i}`
  document.querySelector('#app').appendChild(box);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function testFunc(title, vnode1, vnode2, num = 1) {
  await delay((num - 1) * (1000 + num));
  console.log(title);
  renderer.render(vnode1, document.querySelector('#box' + num));
  console.log(document.getElementById('test' + num));
  await delay(1000);
  renderer.render(vnode2, document.querySelector('#box' + num));
  console.log(document.getElementById('test' + num));
}

testFunc(
  '测试1：更新 props 测试',
  {
    type: 'p',
    props: {
      class: 'foo',
      id: 'test1'
    },
    children: 'text1'
  }, 
  {
    type: 'p',
    props: {
      class: 'bar',
      id: 'test1'
    },
    children: 'text1'
  }
);

testFunc(
  '测试2：更新 children 测试（newVNode 是文本节点，oldVNode 是 null）',
  {
    type: 'div',
    props: {
      id: 'test2'
    },
    children: null
  },
  {
    type: 'div',
    props: {
      id: 'test2'
    },
    children: 'new div text2'
  },
  2
);

testFunc(
  '测试3：更新 children 测试（newVNode 是文本节点，oldVNode 是文本节点）',
  {
    type: 'div',
    props: {
      id: 'test3'
    },
    children: 'div text3'
  },
  {
    type: 'div',
    props: {
      id: 'test3'
    },
    children: 'new div text3'
  },
  3
);
testFunc(
  '测试4：更新 children 测试（newVNode 是文本节点，oldVNode 是一组子节点）',
  {
    type: 'div',
    props: {
      id: 'test4'
    },
    children: 'div text4'
  },
  {
    type: 'div',
    props: {
      id: 'test4'
    },
    children: [
      {
        type: 'p',
        children: 'p text 4'
      }
    ]
  },
  4
);

testFunc(
  '测试5：更新 children 测试（newVNode 是 null，oldVNode 是文本节点）',
  {
    type: 'div',
    props: {
      id: 'test5'
    },
    children: 'div text5'
  },
  {
    type: 'div',
    props: {
      id: 'test5'
    },
    children: null
  },
  5
);

testFunc(
  '测试6：更新 children 测试（newVNode 是 null，oldVNode 是一组节点）',
  {
    type: 'div',
    props: {
      id: 'test6'
    },
    children: [
      {
        type: 'p',
        children: 'p text 6'
      }
    ]
  },
  {
    type: 'div',
    props: {
      id: 'test6'
    },
    children: null
  },
  6
);

testFunc(
  '测试7：更新 children 测试（newVNode 是 一组节点，oldVNode 是文本节点）',
  {
    type: 'div',
    props: {
      id: 'test7'
    },
    children: 'old div text 7'
  },
  {
    type: 'div',
    props: {
      id: 'test7'
    },
    children: [
      {
        type: 'p',
        children: 'new p text 7'
      }
    ]
  },
  7
);

testFunc(
  '测试8：更新 children 测试（newVNode 是 一组节点，oldVNode 是一组节点）',
  {
    type: 'div',
    props: {
      id: 'test8'
    },
    children: [
      {
        type: 'h1',
        children: 'old h1 text 8'
      }
    ]
  },
  {
    type: 'div',
    props: {
      id: 'test8'
    },
    children: [
      {
        type: 'p',
        children: 'new p text 8'
      }
    ]
  },
  8
);