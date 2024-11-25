// ** vnode 的 Diff 算法

/**
 * 简单 Diff 算法
 * @param {*} n1 旧 vnode
 * @param {*} n2 新 vnode
 * @param {*} container 当前正在被打补丁的 DOM 元素
 */
export function patchSimpleChildren(n1, n2, container) {
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
export function patchKeyedChildren(n1, n2, container) {
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
export function quickPatchKeyedChildren(n1, n2, container) {
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