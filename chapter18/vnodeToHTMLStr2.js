// ** 将虚拟 DOM 渲染为 HTML 字符串

// 自闭合标签（void element）
const VOID_TAGS = 'area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr';

/**
 * 将虚拟 DOM 渲染为 HTML 字符串
 * @param {Node} vnode 虚拟 DOM
 * @returns {string} HTML 字符串
 */
function renderElementVNode(vnode) {
  // 取出标签名称 tag 和标签属性 props，以及标签的子节点
  const {
    type: tag,
    props,
    children
  } = vnode;
  // 判断是否是 void Element
  const isVoidElement = VOID_TAGS.includes(tag);

  // 开始标签的头部
  let ret = `<${tag}`;

  // 处理标签属性
  if (props) {
    ret += renderAttrs(props);
  }
  // 开始标签的闭合，如果是 void Element，则自闭合
  ret += isVoidElement ? `/>` : `>`;

  // 如果是 void Element，则直接返回结果，无须处理 children，因为 void element 没有 children
  if (isVoidElement) return ret;

  // 处理子节点
  // 如果子节点的类型是字符串，则是文本内容，之间平均
  if (typeof children === 'string') {
    ret += children;
  } else if (Array.isArray(children)) {
    // 如果子节点的类型是数组，则递归地调用 renderElementVNode 完成渲染
    children.forEach((child) => {
      ret += renderElementVNode(child);
    });
  }

  // 结束标签
  ret += `</${tag}>`;

  // 返回拼接好的 HTML 字符串
  return ret;
}

// 应该忽略的属性
const shouldIgnoreProps = ['key', 'ref'];
/**
 * 渲染属性（忽略组件运行时逻辑的相关属性，例如 key、ref；忽略事件处理函数）
 * @param {object} props vnode 节点的属性对象
 * @returns {string} 渲染后拼接的属性字符串
 */
function renderAttrs(props) {
  let ret = '';

  for (const key in props) {
    if (
      // 检测属性名称，如果是事件或应该被忽略的属性，则忽略它
      shouldIgnoreProps.includes(key) ||
      /^on[^a-z]/.test(key)
    ) {
      continue;
    }
    const value = props[key];
    ret += renderDynamicAtrr(key, value);
  }

  return ret;
}

// 用来判断属性是否是 boolean attribute
const BOOLEAN_ATTRIBUTE ='itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly,async,autofocus,autoplay,controls,default,defer,disabled,hidden,loop,open,required,reversed,scoped,seamless,checked,muted,multiple,selected';
const isBooleanAttr = (key) => BOOLEAN_ATTRIBUTE.split(',').includes(key);

// 用来判断属性名称是否合法且安全
const isSSRSafeAttrName = (key) => /[^>/="'\u0009\u000a\u000c\u0020]/.test(key);
/**
 * 渲染动态 attr
 * @param {string} key 属性的键
 * @param {*} value 属性的值
 * @returns {string} 拼接好的 attr 字符串
 */
function renderDynamicAtrr(key, value) {
  if (isBooleanAttr(key)) {
    // 对于 boolean attribute，如果值为 false，则什么都不需要渲染，否则只需要渲染 key 即可
    return value === false ? `` : ` ${key}`;
  } else if (isSSRSafeAttrName(key)) {
    // 对于其他安全的属性，执行完整的渲染，
    // 注意：对于属性值，我们需要对它执行 HTML 转义操作
    return value === '' ? ` ${key}` : ` ${key}="${escapeHtml(value)}"`;
  } else {
    // 跳过不安全的属性，并打印告警信息
    console.warn(`[@vue/server-renderer] Skipped rendering unsafe attribute name: ${key}`);
  }

  return ``;
}

const escapeRE = /["'&<>]/;
/**
 * 对 html 字符串进行转义（即将特殊字符转换为对应的 HTML 实体）
 * @param {string} string 需要转义的字符串
 * @returns {string} 转义好的字符串
 */
function escapeHtml(string) {
  const str = '' + string;
  const match = escapeRE.exec(str);

  if (!match) return str;

  let html = '';
  let escaped;
  let index;
  let lastIndex = 0;
  for (index = match.index; index < str.length; index++) {
    switch(str.charCodeAt(index)) {
      case 34: // "
        escaped = '&quot;'
        break;
      case 38: // &
        escaped = '&amp;'
        break;
      case 39: // '
        escaped = '&#39;'
        break;
      case 60: // <
        escaped = '&lt;'
        break;
      case 62: // >
        escaped = '&gt;'
        break;
      default:
        continue;
    }

    if (lastIndex !== index) {
      html += str.substring(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escaped;
  }

  return lastIndex !== index ? html + str.substring(lastIndex, index) : html;
}

// ** 测试1：基础
const ElementVNode1 = {
  type: 'div',
  props: {
    id: 'foo'
  },
  children: [
    { type: 'p', children: 'hello' }
  ]
};
console.log('1*', renderElementVNode(ElementVNode1));

// ** 测试2：自闭合
const ElementVNode2 = {
  type: 'input',
  props: {
    type: 'checked'
  }
};
console.log('2*', renderElementVNode(ElementVNode2));

// ** 测试3：HTML 属性 boolean 类型
const ElementVNode3 = {
  type: 'input',
  props: {
    type: 'checked',
    checked: true
  }
};
console.log('3*', renderElementVNode(ElementVNode3));

// ** 测试4：HTML 属性转义
const ElementVNode4 = {
  type: 'a',
  props: {
    href: 'a<b&c=test'
  }
};
console.log('4*', renderElementVNode(ElementVNode4));