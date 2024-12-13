// ** 工具类

/**
 * 判断是否应该作为 DOM Properties 设置
 * @param {Element} el 元素
 * @param {string} key 属性名称
 * @param {*} value 属性的值
 * @returns {boolean} 是否能通过 DOM Properties 设置其属性
 */
export function shouldSetAsProps(el, key, value) {
  // 特殊处理
  if (key === 'form' && el.tagName === 'INPUT') return false;
  // 用 in 操作符判断 key 是否存在对应的 DOM Properties
  return key in el;
}

/**
 * 将不同类型的 class 值序列化为字符串
 * @param {string/Array/object} value 不同类型的 class 值
 * @returns {string} 序列化后的字符串
 */
export function normalizeClass(value) {
  let res = '';
  if (typeof value === 'string') {
    res = value;
  } else if (Array.isArray(value)) {
    res = value.map(normalizeClass).join(' ');
  } else if (Object.prototype.toString.call(value) === '[object Object]') {
    res = Object.keys(value).filter((k) => value[k]).join(' ');
  }
  return res.trim();
}

/**
 * 计算最长递增子序列
 * @param {Array} arr 
 */
export function lis(arr) {
  if (arr.length === 0) return [];

  // dp[i] 表示以 arr[i] 结尾的 LIS 长度
  const dp = Array(arr.length).fill(1);
  // 记录 LIS 中每个元素的前一个元素索引
  const prev = Array(arr.length).fill(-1);
  // 最长长度
  let maxLength = 1;
  // 最长序列的最后一个元素索引
  let endIndex = 0;

  for (let i = 1; i < arr.length; i++) {
    for (let j = 0; j < i; j++) {
      if (arr[i] > arr[j] && dp[i] < dp[j] + 1) {
        dp[i] = dp[j] + 1;
        prev[i] = j;
      }
    }
    if (dp[i] > maxLength) {
      maxLength = dp[i];
      endIndex = i;
    }
  }

  // 回溯构建最长递增子序列
  const lisArr = [];
  while (endIndex !== -1) {
    // lisArr.unshift(arr[endIndex]);
    lisArr.unshift(endIndex);
    endIndex = prev[endIndex];
  }

  return lisArr;
}

/**
 * 类型判断
 * @param {*} target 
 * @returns 
 */
export function getType(target) {
  const type = typeof target;
  if (type !== 'object') return type;
  return Object.prototype.toString.call(target).replace(/^\[object (\S+)\]$/, '$1');
}