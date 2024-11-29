// ** 客户端激活的原理
import { setCurrentInstance } from '../lifeCycle.js';
import { Text, Fragment, KeepAlive } from '../NODE_TYPE.js';
import { shallowReadonly, flushQueue, ref, shallowReactive, effect } from '../reactive.js';

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
  
  // 调度器
  const flushQueueMethod = flushQueue();

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
    // *** 如果 n2.type 的值是字符串类型，则描述的是普通标签元素
    if (typeof type === 'string') {
      if (!n1) {
        mountElement(n2, container, anchor);
      } else {
        patchElement(n1, n2);
      }
    } else if (type === Text) {
      // *** n2 是文本节点
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
      // *** n2 是注释节点
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
      // *** n2 是 Fragment
      if (!n1) {
        // 如果旧 vnode 不存在，则只需要将 Fragment 的 children 逐个挂载即可
        n2.children.forEach(c => patch(null, c, container))
      } else {
        // 如果旧 vnode 存在，则只需要更新 Fragment 的 children 即可
        patchChildren(n1, n2, container)
      }
    } else if (typeof type === 'object' && type.__isTeleport) {
      // *** n2 是 Teleport
      // 组件选项中如果存在 __isTeleport 标识，则它是 Teleport 组件，
      // 调用 Teleport 组件选项中的 process 函数将控制权交接出去
      // 传递给 process 函数的第五个参数是渲染器的一些内部方法
      type.process(n1, n2, container, anchor, {
        patch,
        patchChildren,
        unmount,
        move(vnode, container, anchor) {
          insert(
            vnode.component 
              ? vnode.component.subTree.el // 移动一个组件
              : vnode.el, // 移动普通元素
            container, 
            anchor);
        }
      });
    } else if (typeof type === 'object' || typeof type === 'function') {
      // *** type 是对象 --> 有状态组件
      // *** type 是函数 --> 函数式组件
      if (!n1) {
        // 挂载组件
        if (n2.keptAlive) {
          // 如果该组件已经被 KeepAlive，则不会重新挂载它，而是会调用 _activate 来激活它
          n2.keepAliveInstance._activate(n2, container, anchor);
          n2.component.onActivated && n2.component.onActivated.forEach(hook => hook.call(n2.component.renderContext));
        } else {
          mountComponent(n2, container, anchor);
        }
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
      n1.children.forEach((c) => unmount(c));
      n2.children.forEach((c) => patch(null, c, container));
      // patchSimpleChildren(n1, n2, container);
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
    while (oldVNode && newVNode && oldVNode.key === newVNode.key) {
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
    while (oldVNode && newVNode && oldVNode.key === newVNode.key) {
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
    // 检查是否是函数式组件
    const isFunctional = typeof vnode.type === 'function';

    // 通过 vnode 获取组件的选项对象，即 vnode.type
    let componentOptions = vnode.type;

    if (isFunctional) {
      componentOptions = {
        render: vnode.type,
        props: vnode.type.props
      };
    }

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
      updated,
      activated,
      deactivated,
      beforeUnmount,
      unmounted
    } = componentOptions;

    // 在这里调用 beforeCreate 钩子
    beforeCreate && beforeCreate();

    // 调用 data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
    const state = data ? reactive(data()) : null;
    // 调用 resolveProps 函数解析出最终的 props 数据与 attrs 数据
    const [props, attrs] = resolveProps(propsOption, vnode.props);

    // 之间使用编译好的 vnode.children 对象作为 slots 对象即可
    const slots = vnode.children || {};

    // 定义组件实例，一个组件实例本质上就是一个对象，它包含与组件有关的状态信息
    const instance = {
      // 组件自身的状态数据，即 data
      state,
      // 将解析出的 props 数据包装为 shalloReactive 并定义到组件实例上
      props: shallowReactive(props),
      // 一个布尔值，用来表示组件是否已经被挂载，初始值为 false
      isMounted: false,
      // 组件所渲染的内容，即子树（subTree）
      subTree: null,
      // 将插槽添加到组件实例上
      slots,
      // 在组件实例中添加生命周期相关数组，存储注册的生命周期钩子函数
      onBeforeMount: [],
      onMounted: [],
      onBeforeUpdate: [],
      onUpdated: [],
      onBeforeUnmount: [],
      onUnmounted: [],
      onDeactivated: [],
      onActivated: [],
      // 只有 KeepAlive 组件的实例下会有 KeepAliveCtx 属性
      keepAliveCtx: null,
      unmount: unmount,
      activated,
      deactivated,
      beforeUnmount,
      unmounted
    };

    // 检查当前要挂载的组件是否是 KeepAlive 组件
    const isKeepAlive = vnode.type.__isKeepAlive;
    if (isKeepAlive) {
      // 在 KeepAlive 组件实例上添加 keepAliveCtx 对象
      instance.keepAliveCtx = {
        // move 函数用来移动一段 vnode
        move(vnode, container, anchor){
          // 本质上是将组件渲染的内容移动到指定容器中，即隐藏容器中
          insert(vnode.component.subTree.el, container, anchor);
        },
        createElement
      };
    }

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

    const setupContext = { attrs, emit, slots };

    // 在调用 setup 函数之前，设置当前组件实例
    setCurrentInstance(instance);
    // 调用 setup 函数，将只读版本的 props 作为第一个参数传递，避免用户意外地修改 props 的值，将 setupContext 作为第二个参数传递
    const setupResult = !isFunctional ? setup(shallowReadonly(instance.props), setupContext) : undefined;
    // 在 setup 函数执行完毕之后，重置当前组件实例
    setCurrentInstance(null);
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
        const { state, props, slots } = target;
        if (key === '$slots') {
          // 用户可以通过 this.$slots 来访问插槽内容了
          return slots;
        } else if (state && key in state) {
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
        return true;
      }
    });

    // 在这里调用 created 钩子，调用时要绑定渲染上下文对象
    created && created.call(renderContext);

    // 将组件的 render 函数调用包装到 effect 内，实现组件的自更新
    instance.update = effect(() => {
      // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的虚拟 DOM
      // 调用 render 函数时，将其 this 设置为 renderContext，从而 render 函数内部可以通过 this 访问组件自身状态数据
      const subTree = isFunctional ? render.call(renderContext, shallowReadonly(instance.props), setupContext) : render.call(renderContext, renderContext);
      // 检查组件是否已经被挂载
      if (!instance.isMounted) {
        // 在这里调用 beforeMount 钩子
        beforeMount && beforeMount.call(renderContext);
        instance.onBeforeMount && instance.onBeforeMount.forEach(hook => hook.call(renderContext));
        // 如果 vnode.el 存在，则意味着要执行激活
        if (vnode.el) {
          // 直接调用 hydrateNode 完成激活
          hydrateNode(vnode.el, subTree);
        } else {
          // 初次挂载，调用 patch 函数第一个参数传递 null
          patch(null, subTree, container, anchor);
        }
        // 重点：将组件实例的 isMounted 设置为 true，这样当更新发生时就不会再次进行挂载操作，而是会执行更新
        instance.isMounted = true;
        // 在这里调用 mounted 钩子，遍历 instance.onMounted 数组并逐个执行
        mounted && mounted.call(renderContext);
        instance.onMounted && instance.onMounted.forEach(hook => hook.call(renderContext));
        // 首次挂载，激活 onActivated
        if (vnode.shouldKeepAlive) {
          activated && activated.call(renderContext);
          instance.onActivated && instance.onActivated.forEach(hook => hook.call(renderContext));
        }
      } else {
        // 在这里调用 onBeforeUpdate 钩子
        beforeUpdate && beforeUpdate.call(renderContext);
        instance.onBeforeUpdate && instance.onBeforeUpdate.forEach(hook => hook.call(renderContext));
        // 当 isMounted 为 true 时，说明组件已经被挂载，只需要完成自更新即可，
        // 所以在调用 patch 函数时，第一个参数为组件上一次渲染的子树
        // 意思是，使用新的子树与上一次渲染的子树进行打补丁操作
        patch(instance.subTree, subTree, container, anchor);
        // 这里调用 onUpdated 钩子
        updated && updated.call(renderContext);
        instance.onUpdated && instance.onUpdated.forEach(hook => hook.call(renderContext));
      }
      // 更新组件实例的子树
      instance.subTree = subTree;
      instance.renderContext = renderContext;
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

    // 判断一个 VNode 是否需要过渡
    const needTransition = vnode.transition;
    if (needTransition) {
      // 调用 transition.beforeEnter 钩子，并将 DOM 元素作为参数传递
      vnode.transition.beforeEnter(el);
    }

    insert(el, container, anchor);

    if (needTransition) {
      vnode.transition.enter(el);
    }
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
    // 判断 VNode 是否需要过渡处理
    const needTransition = vnode.transition;

    if (vnode.type === Text) {
      setText(vnode.el, '');
      return;
    }

    // 在卸载时，如果卸载的 vnode 类型为 Fragment，则需要卸载其 children
    if (vnode.type === Fragment) {
      vnode.children.forEach(c => unmount(c));
      return;
    } else if (typeof vnode.type === 'object') {
      // vnode.shouldKeepAlive 是一个布尔值，用来标识该组件是否应该被 KeepAlive
      if (vnode.shouldKeepAlive) {
        const instance = vnode.keepAliveInstance;
        instance.onBeforeUnmount && instance.onBeforeUnmount.forEach(hook => hook.call(instance.renderContext));
        // 对于需要被 KeepAlive 的组件，我们不应该真的卸载它，而应该调用该组件的父组件，
        // 即 KeepAlive 组件的 _deActivate 函数使其失活
        instance._deActivate(vnode);
        vnode.component.onDeactivated && vnode.component.onDeactivated.forEach(hook => hook.call(vnode.component.renderContext));
        instance.onUnmounted && instance.onUnmounted.forEach(hook => hook.call(instance.renderContext));
      } else if (vnode.type.__isTeleport) {
        vnode.children.forEach(c => unmount(c));
      } else {
        const instance = vnode.component;
        instance.onBeforeUnmount && instance.onBeforeUnmount.forEach(hook => hook.call(instance.renderContext));
        // 对于组件卸载，本质上时要卸载组件所渲染的内容，即 subTree
        unmount(vnode.component.subTree);
        instance.onUnmounted && instance.onUnmounted.forEach(hook => hook.call(instance.renderContext));
      }
      return;
    }

    const parent = vnode.el.parentNode;
    if (parent) {
      // 将卸载动作封装到 performRemove 函数中
      const performRemove = () => parent.removeChild(vnode.el);
      if (needTransition) {
        // 如果需要过渡处理，则调用 transition.leave 钩子，同时将 DOM 元素和 performRemove 函数作为参数传递
        vnode.transition.leave(vnode.el, performRemove);
      } else {
        // 如果不需要过渡处理，则直接执行卸载操作
        performRemove();
      }
    }
  }

  /**
   * 客户端激活
   * @param {*} vnode 虚拟 DOM 元素
   * @param {*} container 容器
   */
  function hydrate(vnode, container) {
    // 从容器元素的第一个子节点开始
    hydrateNode(container.firstChild, vnode);
  }

  /**
   * 激活节点
   * @param {Node} node 真实 DOM 元素
   * @param {Node} vnode 虚拟 DOM 元素
   * @returns {Node} 当前节点的下一个兄弟节点
   */
  function hydrateNode(node, vnode) {
    const { type } = vnode;
    // 1. 让 vnode.el 引用真实 DOM
    vnode.el = node;
  
    // 2. 检查虚拟 DOM 的类型，如果是组件，则调用 mountComponent 函数完成激活
    if (typeof type === 'object') {
      mountComponent(vnode, container, null);
    } else if (typeof type === 'string') {
      // 3. 检查真实 DOM 的类型与虚拟 DOM 的类型是否匹配
      if (node.nodeType !== 1) {
        console.error('mismatch');
        console.error('服务端渲染的真实 DOM 节点是：', node);
        console.error('客户端渲染的虚拟 DOM 节点是：', vnode);
      } else {
        // 4. 如果是普通元素，则调用 hydrateElement 完成激活
        hydrateElement(node, vnode);
      }
    }

    // 5. 重要：hydrateNode 函数需要返回当前节点的下一个兄弟节点，以便继续进行后续的激活操作
    return node.nextSibling;
  }

  /**
   * 激活普通元素类型的节点
   * @param {Node} el 真实 DOM 元素
   * @param {Node} vnode 虚拟 DOM 元素
   */
  function hydrateElement(el, vnode) {
    // 1. 为 DOM 元素添加事件
    if (vnode.props) {
      for (const key in vnode.props) {
        // 只有事件类型的 props 需要处理
        if (/^on/.test(key)) {
          patchProps(el, key, null, vnode.props[key]);
        }
      }
    }
    // 递归地激活子节点
    if (Array.isArray(vnode.children)) {
      // 从第一个子节点开始
      let nextNode = el.firstChild;
      const len = vnode.children.length;
      for (let i = 0; i < len; i++) {
        // 激活子节点，注意，每当激活一个子节点， hydrateNode 函数都会返回当前子节点的下一个兄弟节点，于是可以进行后续激活了
        nextNode = hydrateNode(nextNode, vnode.children[i]);
      }
    }
  }

  return {
    render,
    hydrate
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
  setText(el, text) {
    el.nodeValue = text;
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

// ** 测试1：基础
const MyComponent = {
  name: 'App',
  setup() {
    const str = ref('foo');

    return () => {
      return {
        type: 'div',
        children: [
          {
            type: 'h1',
            children: str.value,
            props: {
              onClick: () => {
                str.value = 'bar';
              }
            }
          },
          {
            type: 'h1',
            children: 'baz'
          }
        ]
      };
    };
  }
};
const CompVNode = {
  type: MyComponent
};
// html 代表由服务端渲染的字符串
const html = renderComponentVNode(CompVNode);
console.log(html);
// 假设客户端已经拿到了由服务端渲染的字符串
// 获取挂载点
const container = document.querySelector('#app');
// 设置挂载点的 innerHTML，模拟由服务端渲染的内容
container.innerHTML = html;

// 接着调用 hydrate 函数完成激活
renderer.hydrate(CompVNode, container);