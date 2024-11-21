// ** 解析标签节点

// 定义文本模式，作为一个状态表
const TextModes = {
  DATA: 'DATA',
  RCDATA: 'RCDATA',
  RAWTEXT: 'RAWTEXT',
  CDATA: 'CDATA'
};

/**
 * 解析：将模板字符串解析为模板 AST
 * @param {string} template 模板字符串
 * @returns {object} 模板 AST
 */
function parse(template) {
  // 定义上下文对象
  const context = {
    // source 是模板内容，用于在解析过程中进行消费
    source: template,
    // 解析器当前处于文本模式，初始模式为 DATA
    mode: TextModes.DATA,
    // advanceBy 函数用来消费指定数量的字符，它接收一个数字作为参数
    advanceBy(num) {
      // 根据给定字符树 num，截取为止 num 后的模板内容，并替换当前模板内容
      context.source = context.source.slice(num);
    },
    // 无论是开始标签还是结束标签，都可能存在无用的空白字符，例如 <div    >
    advanceSpaces() {
      // 匹配空白字符：制表符（\t）、回车符（\r）、换行符（\n）、换页符（\f）
      const match = /^[\t\r\n\f ]+/.exec(context.source);
      if (match) {
        // 调用 advanceBy 函数消费空白字符
        context.advanceBy(match[0].length);
      }
    }
  };

  // 调用 parseChildren 函数开始进行解析，它返回解析后得到的子节点
  const nodes = parseChildren(context, []);

  // 解析器返回 Root 根节点
  return {
    type: 'Root',
    children: nodes
  };
}

/**
 * 解析文本返回解析后的子节点
 * @param {object} context 上下文对象
 * @param {Array} ancestors 由父节点构成的栈，用于维护节点间的父子级关系
 * @returns {Array} 解析后的子节点数组
 */
function parseChildren(context, ancestors) {
  // 定义 nodes 数组存储子节点，它将作为最终的返回值
  const nodes = [];
  // 从上下文对象中取得当前状态，包括模式 mode 和模板内容 source
  const { mode, source } = context;

  // 开启 while 循环，只要满足条件就会一直对字符串进行解析
  while(!isEnd(context, ancestors)) {
    let node;
    // 只有 DATA 模式和 RCDATA 模式才支持插值节点的解析
    if (mode === TextModes.DATA || mode === TextModes.RCDATA) {
      // 只有 DATA 模式才支持标签节点的解析
      if (mode === TextModes.DATA && source[0] === '<') {
        if (source[1] === '!') {
          if (source.startsWith('<!--')) {
            // 注释
            node = parseComment(context);
          } else if (source.startsWith('<![CDATA[')) {
            // CDATA
            node = parseCDATA(context, ancestors);
          }
        } else if (source[1] === '/') {
          // 结束标签，状态机遭遇了闭合标签，此时应该抛出错误，因为它缺少与之对应的开始标签
          console.error('无效的结束标签');
          continue;
        } else if (/[a-z]/i.test(source[1])) {
          // 标签
          node = parseElement(context, ancestors);
        }
      } else if (source.startsWith('{{')) {
        // 解析插值
        node = parseInterpolation(context, ancestors);
      }
    }
  
    // node 不存在，说明处于其他模式，即非 DATA 模式且非 RCDATA 模式，这时一切内容都作为文本处理
    if (!node) {
      // 解析文本节点
      node = parseText(context);
    }
  
    // 将节点添加到 nodes 数组中
    nodes.push(node);
  }

  // 当 while 循环停止后，说明子节点解析完毕，返回子节点
  return nodes;
}

/**
 * 判断当前状态机是否停止
 * @param {object} context 上下文对象
 * @param {Array} ancestors 由父节点构成的栈，用于维护节点间的父子级关系
 * @returns {boolean} 是否停止状态机
 */
function isEnd(context, ancestors) {
  // 当模板内容解析完毕后，停止
  if (!context.source) return true;

  // 方案一：
  // // 获取父级标签节点
  // const parent = ancestors[ancestors.length - 1];
  // // 如果遇到结束标签，并且该标签与父级标签节点同名，则停止
  // if (parent && context.source.startsWith(`</${parent.tag}>`)) {
  //   return true;
  // }

  // 方案二：
  // 与父级节点栈内所有节点做比较
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (context.source.startsWith(`</${ancestors[i].tag}>`)) {
      return true;
    }
  }

  return false;
}

/**
 * 解析“标签节点”
 * @param {object} context 上下文对象
 * @param {Array} ancestors 由父节点构成的栈，用于维护节点间的父子级关系
 * @returns {object} 标签 AST 对象
 */
function parseElement(context, ancestors) {
  // 解析开始标签
  const element = parseTag(context);
  if (element.isSelfClosing) return element;

  // 切换到正确的文本模式
  if (element.tag === 'textarea' || element.tag === 'title') {
    // 如果由 parseTag 解析得到的标签是 <textarea> 或 <title>，则切换到 RCDATA 模式
    context.mode = TextModes.RCDATA;
  } else if (/style|xmp|iframe|noembed|noframes|noscript/.test(element.tag)) {
    // 如果由 parseTag 解析得到的标签是：<style>、<xmp>、<iframe>、<noembed>、<noframes>、<noframes>、<noscript>，则切换到 RAWTEXT 模式
    context.mode = TextModes.RAWTEXT;
  } else {
    // 否则切换到 DATA 模式
    context.mode = TextModes.DATA;
  }

  ancestors.push(element);
  // 这里递归调用 parseChildren 函数进行 标签子节点的解析
  element.children = parseChildren(context, ancestors);
  ancestors.pop();

  // 解析结束标签
  if (context.source.startsWith(`</${element.tag}>`)) {
    parseTag(context, 'end')
  } else {
    // 缺少闭合标签
    console.error(`${element.tag} 标签缺少闭合标签`);
  }

  return element;
}

/**
 * 解析“注释节点”
 * @param {object} context 上下文对象
 * @returns
 */
function parseComment(context) {

}

/**
 * 解析“CDATA 节点”
 *  @param {object} context 上下文对象
 * @param {Array} ancestors 由父节点构成的栈，用于维护节点间的父子级关系
 * @returns
 */
function parseCDATA(context, ancestors) {

}

/**
 * 解析“插值节点”
 * @param {object} context 上下文对象
 * @param {Array} ancestors 由父节点构成的栈，用于维护节点间的父子级关系
 * @returns
 */
function parseInterpolation(context, ancestors) {

}

/**
 * 解析“文本节点”
 * @param {object} context 上下文对象
 * @returns
 */
function parseText(context) {

}

/**
 * 解析“开始/结束标签”
 * @param {object} context 上下文对象
 * @param {'start' | 'end'} type 当前处理的是开始标签还是结束标签，默认 'start'
 * @returns {object} 标签节点
 */
function parseTag(context, type = 'start') {
  // 从上下文对象拿到 advanceBy 函数
  const { advanceBy, advanceSpaces } = context;

  // 处理开始标签和结束标签的正则表达式不同
  const match = type === 'start'
    // 匹配开始标签
    ? /^<([a-z][^\t\r\n\f />]*)/i.exec(context.source)
    // 匹配结束标签
    : /^<\/([a-z][^\t\r\n\f />]*)/i.exec(context.source);
  // 匹配成功后，正则表达式的第一个捕获组的值就是标签名称
  const tag = match[1];
  // 消费正则表达式匹配的全部内容，例如 '<div' 这段
  advanceBy(match[0].length);
  // 消费标签中无用的空白字符
  advanceSpaces();
  // 在消费匹配的内容后，如果字符串以 '/>' 开头，则说明这是一个自闭合标签
  const isSelfClosing = context.source.startsWith('/>');
  // 如果是自闭合标签，则消费 '/>'，否则消费 '>'
  advanceBy(isSelfClosing ? 2 : 1);

  // 返回标签节点
  return {
    type: 'Element',
    tag,
    // 标签的属性暂时留空
    props: [],
    // 子节点留空
    children: [],
    // 是否自闭合
    isSelfClosing
  };
}

// ** 测试
console.log(parse('<div>test</div>'));
console.log(parse('<div/>test</div>'));
console.log(parse('<div    >test</div>'));