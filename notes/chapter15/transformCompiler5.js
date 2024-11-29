// ** 将模版 AST 转换为 Javascript AST

// 自定义状态机的状态
const State = {
  initial: 1,    // 初始状态
  tagOpen: 2,    // 标签开始状态
  tagName: 3,    // 标签名称状态
  text: 4,       // 文本状态
  tagEnd: 5,     // 结束标签状态
  tagEndName: 6, // 结束标签名称状态
};

/**
 * 判断是否是字母
 * @param {String} char 字符
 * @returns 
 */
function isAlpha(char) {
  return char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z';
}

/**
 * 将模板字符串切割为 Token 返回
 * @param {String} str 模板
 * @returns Token 数组
 */
function tokenzie(str) {
  // 生成的 Token 回存储到 tokens 数组中，并作为函数的返回值返回
  const tokens = [];
  // 状态机的当前状态：初始状态
  let currentState = State.initial;
  // 用于缓存字符
  const chars = [];
  // 使用 while 循环开启自动机，只要模板字符串没有被消费尽，自动机就会一直运行
  while(str) {
    // 查看第一个自负，注意，这里只是查看，没有消费该字符
    const char = str[0];
    // switch 语句匹配当前状态
    switch(currentState) {
      // 状态机当前处于：初始状态
      case State.initial:
        // 遇到字符 <
        if (char === '<') {
          // 1. 状态机切换到标签开始状态
          currentState = State.tagOpen;
          // 2. 消费字符 <
          str = str.slice(1);
        } else if (isAlpha(char)) {
          // 1. 遇到字母，切换到文本状态
          currentState = State.text;
          // 2. 将当前字母缓存到 chars 数组
          chars.push(char);
          // 3. 消费当前字符
          str = str.slice(1);
        }
        break;
      // 状态机当前处于：标签开始状态
      case State.tagOpen:
        if (isAlpha(char)) {
          // 1. 遇到字母，切换到标签名称状态
          currentState = State.tagName;
          // 2. 将当前字符缓存到 chars 数组
          chars.push(char);
          // 3. 消费当前字符
          str = str.slice(1);
        } else if (char === '/') {
          // 1. 遇到字符 /，切换到结束标签状态
          currentState = State.tagEnd;
          // 2. 消费字符 /
          str = str.slice(1);
        }
        break;
      // 状态机当前处于：标签名称状态
      case State.tagName:
        if (isAlpha(char)) {
          // 1. 遇到字母，由于当前处于标签名称状态，所以不需要切换状态，但需要将当前字符缓存到 chars 数组
          chars.push(char);
          // 2. 消费当前字符
          str = str.slice(1);
        } else if (char === '>') {
          // 1. 遇到字符 >，切换到初始状态
          currentState = State.initial;
          // 2. 同时创建一个标签 Token，并添加到 tokens 数组中，注意，此时 chars 数组中缓存的字符就是标签的名称
          tokens.push({
            type: 'tag',
            name: chars.join('')
          });
          // 3. chars 数组的内容已经被消费，清空它
          chars.length = 0;
          // 4. 同时消费当前字符 >
          str = str.slice(1);
        }
        break;
      // 状态机当前处于：文本状态
      case State.text:
        if (isAlpha(char)) {
          // 1. 遇到字母，保持状态不变，单应该将当前字符缓存到 chars 数组
          chars.push(char);
          // 2. 消费当前字符
          str = str.slice(1);
        } else if (char === '<') {
          // 1. 遇到字符 <，切换到标签开始状态
          currentState = State.tagOpen;
          // 2. 从 文本状态 --> 标签开始状态，此时应该创建文本 Token，并添加到 tokens 数组，注意，此时 chars 数组中的字符就是文本内容
          tokens.push({
            type: 'text',
            content: chars.join('')
          });
          // 3. chars 数组的内容已经被消费，清空它
          chars.length = 0;
          // 4. 消费当前字符
          str = str.slice(1);
        }
        break;
      // 状态机当前处于：结束标签状态
      case State.tagEnd:
        if (isAlpha(char)) {
          // 1. 遇到字母，切换到结束标签名称状态
          currentState = State.tagEndName;
          // 2. 将当前字符缓存到 chars 数组
          chars.push(char);
          // 3. 消费当前字符
          str = str.slice(1);
        }
        break;
      // 状态机当前处于：结束标签名称状态
      case State.tagEndName:
        if (isAlpha(char)) {
          // 1. 遇到字母，不需要切换状态，但需要将当前字符缓存到 chars 数组
          chars.push(char);
          // 2. 消费当前字符
          str = str.slice(1);
        } else if (char === '>') {
          // 1. 遇到字符 >，切换到初始状态
          currentState = State.initial;
          // 2. 从 结束标签名称状态 --> 初始状态，应该保存结束标签名称 Token，注意，此时 chars 数组中缓存的内容就是标签名称
          tokens.push({
            type: 'tagEnd',
            name: chars.join('')
          });
          // 3. chars 数组的内容已经被消费，清空它
          chars.length = 0;
          // 4. 消费当前字符
          str = str.slice(1);
        }
        break;
    }
  }

  // 最后，返回 tokens
  return tokens;
}

/**
 * 解析：将模板字符串解析为模板 AST
 * @param {String} template 模板字符串
 * @returns 模板 AST
 */
function parse(template) {
  // 创建 Root 根节点
  const root = {
    type: 'Root',
    children: []
  };
  // 首先对模板进行标记，得到 tokens
  const tokens = tokenzie(template);
  // 创建 elementStack 栈，起初只有 Root 根节点
  const elementStack = [root];

  // 开启一个 while 循环扫描 tokens，直到所有 Token 都被扫描完毕为止
  while(tokens.length) {
    // 获取当前栈顶节点作为父节点 parent
    const parent = elementStack[elementStack.length - 1];
    // 当前扫描的 Token
    const token = tokens[0];
    switch(token.type) {
      case 'tag':
        // 如果当前 Token 是开始标签，则创建 Element 类型的 AST 节点
        const elementNode = {
          type: 'Element',
          tag: token.name,
          children: []
        };
        // 将其添加到父级节点的 children 中
        parent.children.push(elementNode);
        // 将当前节点压入栈
        elementStack.push(elementNode);
        break;
      case 'text':
        // 如果当前 Token 是文本，则创建 Text 类型的 AST 节点
        const textNode = {
          type: 'Text',
          content: token.content
        };
        // 将其添加到父节点的 children 中
        parent.children.push(textNode);
        break;
      case 'tagEnd':
        // 遇到结束标签，将栈顶节点弹出
        elementStack.pop();
        break;
    }

    // 消费已经扫描过的 token
    tokens.shift();
  }

  // 最后返回 AST
  return root;
}

/**
 * 创建 StringLiteral 节点
 * @param {String} value 字符串字面量的值
 * @returns StringLiteral 节点
 */
function createStringLiteral(value) {
  return {
    type: 'StringLiteral',
    value
  }
}

/**
 * 创建 Identifier 节点
 * @param {String} name 标志符名称
 * @returns Identifier 节点
 */
function createIdentifier(name) {
  return {
    type: 'Identifier',
    name
  }
}

/**
 * 创建 ArrayExpression 节点
 * @param {Array} elements 数组中的元素
 * @returns ArrayExpression 节点
 */
function createArrayExpression(elements) {
  return {
    type: 'ArrayExpression',
    elements
  }
}

/**
 * 创建 CallExpression 节点
 * @param {String} callee 被调用函数的名字
 * @param {Array} args 被调用函数的形式参数
 * @returns CallExpression 节点
 */
function createCallExpression(callee, args) {
  return {
    type: 'CallExpression',
    callee: createIdentifier(callee),
    arguments: args
  }
}

/**
 * 打印当前 AST 中节点的信息
 * @param {Object} node 当前节点
 * @param {Number} indent 缩进层级（节点层级 * 2）
 */
function dump(node, indent = 0) {
  // 节点的类型
  const type = node.type;
  // 节点的描述，如果是根节点，则没有描述
  // 如果是 Element 类型的节点，则使用 node.tag 作为节点的描述
  // 如果是 Text 类型的节点，则使用 node.content 作为节点的描述
  const desc = node.type === 'Root'
    ? ''
    : node.type === 'Element'
      ? node.tag
      : node.content;

  // 打印节点的类型和描述信息
  console.log(`${'-'.repeat(indent)}${type}: ${desc}`);

  // 递归地打印子节点
  if (node.children) {
    node.children.forEach(n => dump(n, indent + 2));
  }
}

/**
 * 采用深度优先遍历算法对 AST 进行访问
 * @param {Object} ast 
 * @param {Object} context 上下文对象
 */
function traverseNode(ast, context) {
  // 当前节点，ast 本身就是 Root 节点，设置当前转换的节点信息 context.currentNode
  context.currentNode = ast;

  // 退出阶段的回调函数数组
  const exitFns = [];

  // context.nodeTransforms 是一个数组，其中每一个元素都是一个函数
  const transforms = context.nodeTransforms;
  for (let i = 0; i < transforms.length; i++) {
    // 转换函数可以返回另外一个函数，该函数即作为退出阶段的回调函数
    const onExit = transforms[i](context.currentNode, context);
    if (onExit) {
      // 将退出阶段的回调函数添加到 exitFns 函数中
      exitFns.push(onExit);
    }
    // 将当前节点 currentNode 和 context 都传递给 nodeTransforms 中注册的回调函数
    // transforms[i](context.currentNode, context);
    // 由于任何转换函数都可能移除当前节点，因此每个转换函数执行完毕后，都应该检查当前节点是否已经被移除，如果被移除了，直接返回即可
    if (!context.currentNode) return;
  }

  // 如果有子节点，则递归地调用 traverseNode 函数进行遍历
  const children = context.currentNode.children;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      // 递归调用 traverseNode 转换子节点前，将当前节点设置为父节点
      context.parent = context.currentNode;
      // 设置位置索引
      context.childIndex = i;
      // 递归地调用时，将 context 透传
      traverseNode(children[i], context);
    }
  }

  // 在阶段处理的最后阶段执行缓存到 exitFns 中的回调函数，注意，这里我们要反序执行
  let i = exitFns.length;
  while(i--) {
    exitFns[i]();
  }
}

/**
 * 转换文本节点
 * @param {Object} node 当前节点
 * @param {Object} context 上下文对象
 */
function transformText(node, context) {
  // 如果不是文本节点，则什么都不做
  if (node.type !== 'Text') return;
  // 文本节点对应的 Javascript ASR 节点其实就是一个字符串字面量，
  // 因此只需要使用 node.content 创建一个 StringLiteral 类型的节点即可
  // 最后将文本节点对应的 Javascript AST 节点提阿佳到 node.jsNode 即可
  node.jsNode = createStringLiteral(node.content);
}

/**
 * 转换标签节点
 * @param {Object} node 当前节点
 * @param {Object} context 上下文对象
 * @returns
 */
function transformElement(node, context) {
  // 将转换代码编写在退出节点的回答函数中，这样可以保证该标签节点的子节点全部被处理完毕
  return () => {
    // 如果被转换的节点不是元素节点，则什么都不做
    if (node.type !== 'Element') return;

    // 1. 创建 h 函数调用语句，h 函数调用的第一个参数是标签名称，因此我们以 node.tag 来创建一个字符串字面量节点作为第一个参数
    const callExp = createCallExpression('h', [
      createStringLiteral(node.tag)
    ]);
    // 2. 处理 h 函数调用的参数
    node.children.length === 1
      // 如果当前标签节点只有一个子节点，则直接使用子节点的 jsNode 作为参数
      ? callExp.arguments.push(node.children[0].jsNode)
      // 如果当前标签节点有多个子节点，则创建一个 ArrayExpression 节点作为参数
      : callExp.arguments.push(
        // 数组的每个元素都是子节点的 jsNode
        createArrayExpression(node.children.map(c => c.jsNode))
      );
    // 3. 将当前标签节点对应的 Javascript AST 添加到 jsNode 属性下
    node.jsNode = callExp;
  };
}

/**
 * 转换根节点
 * @param {Object} node 当前节点
 * @param {Object} context 上下文对象
 * @returns 
 */
function transformRoot(node, context) {
  // 将逻辑编写在退出阶段的回调函数中，保证子节点全部被处理完毕
  return () => {
    // 如果不是跟节点，则什么都不做
    if (node.type !== 'Root') return;
    // node 是根节点，根节点的第一个子节点就是模板的根节点
    // 当然，这里我们暂时不考虑模板存在多个根节点的情况
    const vnodeJSAST = node.children[0].jsNode;
    // 创建 render 函数的声明语句节点，将 vnodeJSAST 作为 render 函数体的返回语句
    node.jsNode = {
      type: 'FunctionDecl', // 代表该节点是函数声明
      // 函数的名称是一个标志符，标志符本身也是一个节点
      id: {
        id: 'Identifier',
        name: 'render' // name 用来存储标志符的名称，中这里它就是渲染函数的名称 render
      },
      params: [], // 参数，目前渲染函数还不需要参数，所以这里是一个空数组
      // 需然函数的函数体只有一个语句，即 return 语句
      body: [
        {
          type: 'ReturnStatement',
          // 最外层的 h 函数调用
          return: vnodeJSAST
        }
      ]
    };
  };
}

/**
 * 转换：将模版 AST 转换为 Javascript AST
 * @param {Object} templateAST 模版 AST
 * @returns Javascript AST
 */
function transform(templateAST) {
  // 在 transform 函数创建 context 对象
  const context = {
    // 用来存储当前正在转换的节点
    currentNode: null,
    // 用来存储当前节点在父节点的 children 中的位置索引
    childIndex: 0,
    // 用来存储当前转换节点的父节点
    parent: null,
    // 用于替换节点的函数，接收新节点作为参数
    replaceNode(node) {
      // 为了替换节点，我们需要修改 AST，找到当前节点在父节点的 children 中的位置：context.childIndex，然后使用新节点替换即可
      context.parent.children[context.childIndex] = node;
      // 由于当前节点已经被新的节点替换掉了，因此我们需要将 currentNode 更新为新节点
      context.currentNode = node;
    },
    // 用户删除当前节点
    removeNode() {
      if (context.parent) {
        // 调用数组的 splice 方法，根据当前节点的索引删除当前节点
        context.parent.children.splice(context.childIndex, 1);
        context.currentNode = null;
      }
    },
    // 注册 nodeTransforms 数组
    nodeTransforms: [
      transformRoot,
      transformElement, // transformElement 函数用来转换标签节点
      transformText, // transformText 函数用来转换文本节点
    ]
  };

  // 调用 traverseNode 完成转换
  traverseNode(templateAST, context);
  // 打印 AST 信息
  dump(templateAST);
}

// ** 测试
const ast = parse(`<div><p>Vue</p><p>Template</p></div>`);
transform(ast);
console.log(ast.jsNode);