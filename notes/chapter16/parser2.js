// ** 递归下降算法构造模板 AST

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
 * @returns 模板 AST
 */
function parse(template) {
  // 定义上下文对象
  const context = {
    // source 是模板内容，用于在解析过程中进行消费
    source: template,
    // 解析器当前处于文本模式，初始模式为 DATA
    mode: TextModes.DATA
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
 * @returns 解析后的子节点数组
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
          // 结束标签，这里需要抛出错误
        } else if (/[a-z]/i.test(source[1])) {
          // 标签
          console.log('11111');
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
 * 
 * @param {object} context 上下文对象
 * @param {object} ancestors 由父节点构成的栈，用于维护节点间的父子级关系
 */
function isEnd(context, ancestors) {

}

/**
 * 解析“标签节点”
 * @param {object} context 上下文对象
 * @param {object} ancestors 由父节点构成的栈，用于维护节点间的父子级关系
 * @returns 标签 AST 对象
 */
function parseElement(context, ancestors) {
  // 解析开始标签
  const element = parseTag();
  // 这里递归调用 parseChildren 函数进行 标签子节点的解析
  element.children = parseChildren();
  //解析结束标签
  parseEndTag();

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
 * 解析“开始标签”
 */
function parseTag() {

}

/**
 * 解析“结束标签”
 */
function parseEndTag() {

}

// ** 测试
const template = `<div>
  <p>Text1</p>
  <p>Text2</p>
</div>`;
const ast = parse(template);
console.log('ast', ast);