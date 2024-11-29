// ** 运行时和编译时

const obj = {
  tag: 'div',
  children: [
    {
      tag: 'span',
      children: 'hello world'
    }
  ]
};

function Render(obj, root) {
  const el = document.createElement(obj.tag);
  if (Array.isArray(obj.children)) {
    obj.children.forEach((child) => Render(child, el));
  } else if (typeof obj.children === 'string') {
    const text = document.createTextNode(obj.children);
    el.appendChild(text);
  }
  root.appendChild(el);
}

Render(obj, document.body);