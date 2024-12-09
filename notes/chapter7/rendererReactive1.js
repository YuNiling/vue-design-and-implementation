// ** 渲染器与响应系统的结合

import { effect, ref } from '../reactive.js';

function renderer(domString, container) {
  container.innerHTML = domString;
}

// 测试：响应数据值变更，会导致副作用函数重新执行，渲染函数重新调用
const count = ref(1);
effect(() => {
  renderer(`<h1>${count.value}</h1>`, document.getElementById('app'));
});


setTimeout(() => {
  count.value++;
}, 2000);