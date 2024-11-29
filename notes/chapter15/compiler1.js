// ** 模版 DSL 的编译器

/**
 * 解析：将模板字符串解析为模板 AST
 * @param {String} template 模板字符串
 * @returns 模板 AST
 */
function parse(template) {
  return {
    type: 'Root', // 逻辑根节点
    children: [
      {
        type: 'Element', // 标签节点
        tag: 'div',
        children: [
          {
            type: 'Element', // 标签节点
            tag: 'p',
            children: [
              {
                type: 'TEXT',
                content: 'Vue'
              }
            ]
          },
          {
            type: 'Element', // 标签节点
            tag: 'p',
            children: [
              {
                type: 'TEXT',
                content: 'Template'
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * 转换：将模版 AST 转换为 Javascript AST
 * @param {Object} templateAST 模版 AST
 * @returns Javascript AST
 */
function transform(templateAST) {
  return {
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
        return: {
          type: 'CallExpression',
          // 被调用函数的名称
          callee: { id: 'Identifier', name: 'h' },
          // 被调用函数的形式参数
          arguments: [
            // 第一个参数是字符串子面量 'div'
            { type: 'StringLiteral', value: 'div' },
            // 第二个参数是一个数组
            {
              type: 'ArrayExpression',
              // 数组中的元素
              elements: [
                // 数组的第一个元素是 h 函数的调用
                {
                  type: 'CallExpression',
                  callee: { id: 'Identifier', name: 'h' },
                  arguments: [
                    { type: 'StringLiteral', value: 'p' },
                    { type: 'StringLiteral', value: 'Vue' },
                  ]
                },
                // 数组的第二个元素是 h 函数的调用
                {
                  type: 'CallExpression',
                  callee: { id: 'Identifier', name: 'h' },
                  arguments: [
                    { type: 'StringLiteral', value: 'p' },
                    { type: 'StringLiteral', value: 'Template' },
                  ]
                }
              ]
            }
          ]
        }
      }
    ]
  };
}

/**
 * 生成：根据 Javascript AST 生成渲染函数代码
 * @param {Object} jsAST Javascript AST
 * @returns 渲染函数
 */
function generate(jsAST) {
  return `
    function render(){
      return h('div',[h('p','Vue'),h('p','Template')])
    }
  `;
}

const template = `<div><p>Vue</p><p>Template</p></div>`;
const templateAST = parse(template);
const jsAST = transform(templateAST);
const code = generate(jsAST);
console.log(code);