// ** 缓存内联事件处理函数
// 1. 问题：每次重新渲染函数（即 render 函数重新执行时），会创建一个全新的 props 对象，props 对象中的属性值也会是全新函数，会触发组件更新，造成额外的性能开销。
// 2. 解决：加入缓存，props 对象中属性值从缓存中取，就不会触发组件更新。
import { ref, reactive, effect, flushQueue, shallowReactive, shallowReadonly, shallowRef } from '../reactive.js';
import { shouldSetAsProps, lis } from '../utils.js';
import { Text, Comment, Fragment, Static, KeepAlive, Teleport, Transition } from '../NODE_TYPE.js';
import { setCurrentInstance } from '../lifeCycle.js';
import { quickPatchKeyedChildren } from '../vnodeDiff.js';

// 补丁标志的映射
const PatchFlags = {
  TEXT: 1,   // 代表节点有动态的 textContent
  CLASS: 2,  // 代表元素有动态的 class 绑定
  STYLE: 3   // 代表元素有动态的 style 绑定
};

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
   * 插入静态内容
   * @param {string} content 静态节点内容
   * @param {Node} anchor 锚点
   * @param {Node} container 容器
   * @returns {(Node | Node)[]} 容器中静态节点的firstNode、lastNode
   */
  function insertStaticContent(content, anchor, container) {
    const templateContainer = createElement('template');
    templateContainer.innerHTML = content;
    const before = anchor ? anchor.previousSibling : container.lastChild;
    insert(templateContainer.content, container);
    const firstNode = before ? before.nextSibling : container.firstChild;
    const lastNode = anchor ? anchor.previousSibling : container.lastChild;
    return [firstNode, lastNode];
  }

  /**
   * 移除容器中静态节点
   * @param {Node} el 容器中静态节点的 firstNode 
   * @param {Node} anchor 容器中静态节点的 lastNode
   * @param {Node} container 容器
   */
  function removeStaticElement(el, anchor, container) {
    let nextNode;
    while (el && el !== anchor) {
      nextNode = el.nextSibling;
      container.removeChild(el);
      el = nextNode;
    }
    container.removeChild(el);
  }

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
    } else if (type === Static) {
      // *** n2 是静态节点
      if (!n1) {
        // 如果没有旧节点，直接进行挂载
        [n2.el, n2.anchor] = insertStaticContent(n2.children, anchor, container);
      }  else {
        let el = n2.el = n1.el;
        const anchor = n2.anchor = n1.anchor;
        if (n2.children !== n1.children) {
          removeStaticElement(el, anchor, container);
          [n2.el, n2.anchor] = insertStaticContent(n2.children, anchor, container);
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
    if (n2.patchFlag) {
      // 靶向更新
      if (n2.patchFlag === PatchFlags.TEXT) {
         
      } else if (n2.patchFlag === PatchFlags.CLASS) {

      } else if (n2.patchFlag === PatchFlags.STYLE) {

      }
    } else {
      // 全量更新
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
    }

    // 第二步：更新 children
    if (n2.dynamicChildren) {
      // 调用 patchBlockChildren 函数，这样只会更新动态节点
      patchBlockChildren(n1, n2);
    } else {
      patchChildren(n1, n2, el);
    }
  }

  /**
   * 更新动态子节点
   * @param {object} n1 旧 vnode
   * @param {object} n2 新 vnode
   */
  function patchBlockChildren(n1, n2) {
    // 只更新动态节点即可
    for (let i = 0; i < n2.dynamicChildren.length; i++) {
      patchElement(n1.dynamicChildren[i], n2.dynamicChildren[i]);
    }
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
      // quickPatchKeyedChildren(n1, n2, container);
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
    effect(() => {
      // console.log(vnode.type.name, instance.props.title, render);
      // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的虚拟 DOM
      // 调用 render 函数时，将其 this 设置为 renderContext，从而 render 函数内部可以通过 this 访问组件自身状态数据
      const subTree = isFunctional ? render.call(renderContext, shallowReadonly(instance.props), setupContext) : render.call(renderContext, renderContext);
      // 检查组件是否已经被挂载
      if (!instance.isMounted) {
        // 在这里调用 beforeMount 钩子
        beforeMount && beforeMount.call(renderContext);
        instance.onBeforeMount && instance.onBeforeMount.forEach(hook => hook.call(renderContext));
        // 初次挂载，调用 patch 函数第一个参数传递 null
        patch(null, subTree, container, anchor);
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

// 动态节点栈
const dynamicChildrenStack = [];
// 当前动态节点集合
let currentDynamicChildren = null;

/**
 * 创建一个新的动态节点结合，并将该集合压入栈中
 */
function openBlock() {
  dynamicChildrenStack.push(currentDynamicChildren = []);
}

/**
 * 将通过 openBlock 创建的动态节点从栈中弹出
 */
function closeBlock() {
  dynamicChildrenStack.pop();
  currentDynamicChildren = dynamicChildrenStack[dynamicChildrenStack.length - 1] || [];
}

/**
 * 创建虚拟 DOM 节点
 * @param {string} tag 节点的名称
 * @param {object} props 节点的属性
 * @param {Array<object>} children 节点的子节点数组
 * @param {number|undefined} flags 节点的补丁标志
 * @returns {object} 虚拟 DOM 节点
 */
function createVNode(tag, props, children, flags) {
  const key = props && props.key;
  props && delete props.key;

  const vnode = {
    type: tag,
    tag,
    props,
    children,
    key,
    patchFlag: flags
  };

  if (typeof flags !== 'undefined' && currentDynamicChildren) {
    // 动态节点，将其添加到当前动态节点集合中
    currentDynamicChildren.push(vnode);
  }

  return vnode;
}

/**
 * 创建 Block 节点
 * @param {string} tag 节点的名称
 * @param {object} props 节点的属性
 * @param {Array<object>} children 节点的子节点数组
 * @returns {object} Block 节点
 */
function createBlock(tag, props, children) {
  // block 本质上也是一个 vnode
  const block = createVNode(tag, props, children);
  // 将当前动态节点结合作为 block.dynamicChildren
  block.dynamicChildren = currentDynamicChildren;
  
  // 关闭 block
  closeBlock();

  if (currentDynamicChildren) {
    currentDynamicChildren.push(block);
  }

  return block;
}

/**
 * 创建静态虚拟节点
 * @param {string} content 静态节点序列化字符串
 * @returns {object} 静态虚拟节点
 */
function createStaticVNode(content) {
  return createVNode(Static, null, content);
}

// ** 测试：
const Comp = {
  name: 'Comp',
  props: ['onChange'],
  setup(props) {
    console.log('Comp render');
    return () => 
      createVNode('button', { 
        onClick: props.onChange // 按钮点击时触发 `onChange`
      }, 'Click Me');
  },
};

const cache = [];
const parentComp = {
  name: 'parentComp',
  props: {
    title: String
  },
  setup() {
    console.log('parentComp render');
    const state = reactive({
      a: 1,
      b: 2,
    });

    return () => {
      return createVNode(Comp, {
        // onChange: () => {
        //   const c = state.a + state.b;
        //   return c;
        // }
        onChange: cache[0] || (cache[0] = () => {
          const c = state.a + state.b;
          return c;
        })
      })
    };
  },
};
const testComp = {
  name: 'testComp',
  setup() {
    const title = ref('测试标题');
    return () => {
      return {
        type: Fragment,
        children: [
          {
            type: 'button',
            props: {
              onClick: () => {
                title.value = parseInt(Math.random() * 10 + 1) + '-标题';
              }
            },
            children: '切换title'
          },
          {
            type: parentComp,
            props: {
              title: title.value
            },
          }
        ]
      };
    };
  }
};
const vnode = {
  type: testComp
};
renderer.render(vnode, document.querySelector('#app'));