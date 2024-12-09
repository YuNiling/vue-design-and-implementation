// ** 自定义渲染器

// 创建渲染器
function createRenderer(options) {

  // 通过 options 得到操作 DOM 的 API
  const {
    createElement,
    setElementText,
    insert
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
const vnode = {
  type: 'h1',
  children: 'hello'
};
const renderer1 = createRenderer({
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
  }
});
renderer1.render(vnode, document.querySelector('#app'));

const renderer2 = createRenderer({
  // 用于创建元素
  createElement(tag) {
    console.log(`创建元素 ${tag}`);
    return { tag };
  },
  // 用于设置元素的文本节点
  setElementText(el, text) {
    console.log(`设置 ${JSON.stringify(el)} 的文本内容：${text}`);
    el.text = text;
  },
  // 用于在给定的 parent 下添加指定元素
  insert(el, parent, anchor = null){
    console.log(`将 ${JSON.stringify(el)} 添加到 ${JSON.stringify(parent)} 下`);
    parent.children = el;
  }
});
renderer2.render(vnode, { type: 'root' });
