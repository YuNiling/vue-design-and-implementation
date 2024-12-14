// ** 正确地设置元素属性

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
   * “打补丁”（或更新）
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   * @param {*} container 容器
   */
  function patch(n1, n2, container) {
    // 如果 n1 不存在，意味着挂载，则调用 mountElement 函数完成挂载
    if (!n1) {
      mountElement(n2, container);
    } else {
      // n1 存在，意味着打补丁
    }
  }

  /**
   * 挂载原始
   * @param {*} vnode 虚拟节点
   * @param {*} container 挂载点
   */
  function mountElement(vnode, container) {
    // 创建 DOM 元素
    const el = createElement(vnode.type);

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

    console.log('el', el);
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
        // 只需要将 container 内的 DOM 清空即可
        container.innerHTML = '';
      }
    }

    // 把 vnode 存储到 container._vnode 下，即后续渲染中的旧 vnode
    container._vnode = vnode;
  }

  return {
    render
  };
}

// 测试：响应数据值变更，会导致副作用函数重新执行，渲染函数重新调用

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
    if (shouldSetAsProps(el, key, nextValue)) {
      const type = typeof el[key];
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

for (let i = 1; i <= 4; i++) {
  let box = document.createElement('div');
  box.id = `box${i}`;
  document.querySelector('#app').appendChild(box);
}

console.log('测试1：disabled: false');
renderer.render({
  type: 'button',
  props: {
    disabled: false
  }
}, document.querySelector('#box1'));

console.log('测试2：disabled: true');
renderer.render({
  type: 'button',
  props: {
    disabled: true
  }
}, document.querySelector('#box2'));

console.log('测试3：disabled: ""');
renderer.render({
  type: 'button',
  props: {
    disabled: ''
  }
}, document.querySelector('#box3'));

console.log('测试4：<input form="xxx" />');
renderer.render({
  type: 'input',
  props: {
    form: 'xxx'
  }
}, document.querySelector('#box4'));