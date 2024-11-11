/**
 * 判断是否应该作为 DOM Properties 设置
 * @param {*} el 
 * @param {*} key 
 * @param {*} value 
 * @returns 
 */
export function shouldSetAsProps(el, key, value) {
  // 特殊处理
  if (key === 'form' && el.tagName === 'INPUT') return false;
  // 用 in 操作符判断 key 是否存在对应的 DOM Properties
  return key in el;
}

/**
 * 将值序列化为字符串
 * @param {String/Array/Object} value 
 * @returns 
 */
export function normalizeClass(value) {
  if (typeof value === 'string') return value;

  if (Array.isArray(value)) {
    return value.map(normalizeClass).filter(Boolean).join(' ');
  }

  if (typeof value === 'object') {
    return Object.keys(value)
      .filter(key => value[key])
      .join(' ');
  }
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