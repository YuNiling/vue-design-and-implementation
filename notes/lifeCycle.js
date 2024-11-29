// ** 实例、全局变量

// 全局变量，存储当前正在被初始化的组件实例
let currentInstance = null;

/**
 * 设置当前实例
 * @param {*} instance 组件实例
 */
export function setCurrentInstance(instance) {
  currentInstance = instance;
}

/**
 * 获取当前实例
 * @returns 实例 ｜ null
 */
export function getCurrentInstance() {
  return currentInstance;
}

export function onBeforeMount(fn) {
  if (currentInstance) {
    currentInstance.onBeforeMount.push(fn);
  } else {
    console.error('onBeforeMount 函数只能在 setup 中调用')
  }
}

export function onMounted(fn) {
  if (currentInstance) {
    // 将生命周期函数添加到 instance.onMounted 数组中
    currentInstance.onMounted.push(fn);
  } else {
    console.error('onMounted 函数只能在 setup 中调用');
  }
}

export function onBeforeUpdate(fn) {
  if (currentInstance) {
    currentInstance.onBeforeUpdate.push(fn);
  } else {
    console.error('onBeforeUpdate 函数只能在 setup 中调用');
  }
}

export function onUpdated(fn) {
  if (currentInstance) {
    currentInstance.onUpdated.push(fn);
  } else {
    console.error('onUpdated 函数只能在 setup 中调用');
  }
}

export function onBeforeUnmount(fn) {
  if (currentInstance) {
    currentInstance.onBeforeUnmount.push(fn);
  } else {
    console.error('onBeforeUnmount 函数只能在 setup 中调用');
  }
}

export function onUnmounted(fn) {
  if (currentInstance) {
    currentInstance.onUnmounted.push(fn);
  } else {
    console.error('onUnmounted 函数只能在 setup 中调用');
  }
}

export function onDeactivated(fn) {
  if (currentInstance) {
    currentInstance.onDeactivated.push(fn);
  } else {
    console.error('onDeactivated 函数只能在 setup 中调用');
  }
}

export function onActivated(fn) {
  if (currentInstance) {
    currentInstance.onActivated.push(fn);
  } else {
    console.error('onActivated 函数只能在 setup 中调用');
  }
}