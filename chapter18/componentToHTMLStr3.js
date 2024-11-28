// ** 将组件渲染为 HTML 字符串
import { setCurrentInstance } from '../lifeCycle.js';
import { Text, Fragment, KeepAlive } from '../NODE_TYPE.js';
import { shallowReadonly } from '../reactive.js';


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
  const isVoidElement = VOID_TAGS.split(',').includes(tag);

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
      ret += renderVNode(child);
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

/**
 * 将组件类型的虚拟节点渲染为 HTML 字符串
 * @param {Node} vnode 组件类型的虚拟节点
 * @returns {string} HTML 字符串
 */
function renderComponentVNode(vnode) {
  const isFunctional = typeof vnode.type === 'function';
  let componentOptions = vnode.type;
  if (isFunctional) {
    componentOptions = {
      render: vnode.type,
      props: vnode.type.props
    };
  }

  // 获取 setup 组件选项
  let {
    render,
    data,
    setup,
    beforeCreate,
    created,
    props: propsOption
  } = componentOptions;

  beforeCreate && beforeCreate();

  // 无须使用 reactive() 创建 data 的响应式数据
  const state = data ? data() : null;
  const [props, attrs] = resolveProps(propsOption, vnode.props);
  
  const slots = vnode.children || {};

  const instance = {
    state,
    props, // props 无须 shallowReactive
    isMounted: false,
    subTree: null,
    slots,
    mounted: [],
    keepAliveCtx: null
  };

  function emit(event, ...payload) {
    const evenName = `on${event[0].toUpperCase() + event.slice(1)}`;
    const handler = instance.props[evenName];
    if (handler) {
      handler(...payload);
    } else {
      console.error('事件不存在');
    }
  }

  let setupState = null;
  const setupContext = { attrs, emit, slots };
  setCurrentInstance(instance);
  const setupResult = !isFunctional ? setup(shallowReadonly(instance.props), setupContext) : undefined;
  setCurrentInstance(null);
  if (typeof setupResult === 'function') {
    if (render) console.error('setup 函数返回渲染函数，render 选项将被忽略');
    render = setupResult;
  } else {
    setupState = setupContext;
  }

  vnode.component = instance;

  const renderContext = new Proxy(instance, {
    get(target, key, receiver) {
      const { state, props, slots } = target;

      if (key === '$slots') return slots;

      if (state && key in state) {
        return state[key];
      } else if (key in props) {
        return props[key];
      } else if (setupState && key in setupState) {
        return setupState[key];
      } else {
        console.error('不存在');
      }
    },
    set(target, key, value, receiver) {
      const { state, props } = target;
      
      if (state && key in state) {
        state[key] = value;
      } else if (key in props) {
        props[key] = value;
      } else if (setupState && key in setupState) {
        setupState[key] = value;
      } else {
        console.error('不存在');
      }
    }
  });
  
  created && created.call(renderContext);

  // 执行渲染函数得到 subTree，即组件要渲染的内容
  const subTree = isFunctional 
    ? render.call(renderContext, shallowReadonly(instance.props), setupContext) 
    : render.call(renderContext, renderContext);

  // 调用 renderElementVNode 完成渲染，并返回其结果
  return renderVNode(subTree);
}

/**
 * 将虚拟节点渲染为 HTML 字符串
 * @param {*} vnode 虚拟节点
 * @returns {string} HTML 字符串
 */
function renderVNode(vnode) {
  const type = typeof vnode.type;
  if (type === 'string') {
    return renderElementVNode(vnode);
  } else if (type === 'object' || type === 'function') {
    return renderComponentVNode(vnode);
  } else if (vnode.type === Text) {
    return vnode.children;
  } else if (vnode.type === Fragment) {
    return vnode.children.map((child) => {
      return renderVNode(child);
    }).join('');
  }
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

// ** 测试1：基础
const MyComponent = {
  props: {
    title: String
  },
  setup(props) {
    return () => {
      return {
        type: 'div',
        props: {
          onClick: () => {
            emit('testClick', 'click test1', 'click test2');
          }
        },
        children: 'hello: ' + props.title
      };
    };
  }
};
const CompVNode = {
  type: MyComponent,
  props: {
    title: '函数式组件标题',
    name: 'attr name 测试',
    onTestClick: (msg1, msg2) => {
      console.log('testClick', msg1, msg2);
    }
  },
};
const html = renderComponentVNode(CompVNode);
console.log(html);

// ** 测试2：函数式组件
function MyFuncComp(props, { attrs, slots, emit }) {
  console.log('attrs', attrs);
  return {
    type: Fragment,
    children: [
      slots.header(),
      {
        type: 'div',
        props: {
          onClick: () => {
            emit('customClick', 'click test1', 'click test2');
          }
        },
        children: '标题是：' + props.title
      },
      {
        type: 'div',
        children: [
          {
            type: Text,
            children: 'Text 测试文本'
          }
        ]
      },
      slots.footer()
    ]
  };
};
MyFuncComp.props = {
  title: String
};
const CompVNode2 = {
  type: MyFuncComp,
  props: {
    title: '函数式组件标题',
    name: 'attr name 测试',
    onCustomClick: (msg1, msg2) => {
      console.log('customClick', msg1, msg2);
    }
  },
  children: {
    header() {
      return { type: 'h1', children: '我是标题' };
    },
    footer() {
      return { type: 'p', children: '我是注脚' };
    }
  }
};
const html2 = renderComponentVNode(CompVNode2);
console.log(html2);