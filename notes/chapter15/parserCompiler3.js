// ** 构造 AST

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

// ** 测试
const ast = parse(`<div><p>Vue</p><p>Template</p></div>`);
console.log(ast);