// ** 组件的本质

const MyComponent = {
  render() {
    return {
      tag: 'div',
      props: {
        onClick: () => console.log('hello')
      },
      children: 'click me3'
    }
  }
};
const vnode = {
  tag: MyComponent
};

function renderer(vnode, container) {
  if (typeof vnode.tag === 'string') {
    // 说明 vnode 描述是标签元素
    mountElement(vnode, container); 
  } else if (typeof vnode.tag === 'object') {
    // 说明 vnode 描述的是组件
    mountComponent(vnode, container);
  }
}

function mountElement(vnode, container) {
  const el = document.createElement(vnode.tag);
  for (const key in vnode.props) {
    if (/^on/.test(key)) {
      el.addEventListener(
        key.slice(2).toLowerCase(),
        vnode.props[key]
      );
    }
  }

  if (typeof vnode.children === 'string') {
    el.appendChild(document.createTextNode(vnode.children));
  } else if (Array.isArray(vnode.children)) {
    vnode.children.forEach(child => renderer(child, el));
  }
  container.appendChild(el);
}

function mountComponent(vnode, container) {
  const subtree = vnode.tag.render();
  renderer(subtree, container);
}

renderer(vnode, document.body);