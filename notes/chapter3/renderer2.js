// ** 初识渲染器

const vnode = {
  tag: 'div',
  props: {
    onClick: () => console.log('hello')
  },
  children: 'click me'
};

function renderer(vnode, container) {
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

renderer(vnode, document.body);