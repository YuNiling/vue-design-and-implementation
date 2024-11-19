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
            tag: 'h1',
            props: {
              type: 'ATTRIBUTE',
              name: 'class',
              value: {
                type: 'TEXT',
                content: 'foo'
              }
            },
            children: [
              {
                type: 'TEXT',
                content: 'Vue Template'
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
    type: 'Program', // 程序主体	
    body: [
      {
        type: 'ExpressionStatement', // 表达式语句，通常是调用一个函数
        expression: {
          type: 'CallExpression', // 调用表达式，通常指调用一个函数，对应<div>
          callee: { // （被调用者）
            type: 'Identifier', // 标识符，标识，例如声明变量时 var identi = 5 中的 identi
            name: 'h' // 在 Vue 中h函数用于创建虚拟 DOM 节点
          },
          arguments: [  // 函数调用的参数列表，包含三个元素
            { // 是一个Identifier类型的节点，名称为div，表示要创建的元素标签名是<div>
              type: 'Identifier',
              name: "div"
            },
            {}, // 是一个空对象，用于表示元素可能的属性，这里<div>没有额外的属性设置所以为空
            [  // 是一个数组，用于存放子节点对应的抽象语法树节点，这里包含了对应<h1>元素的节点
              {
                type: 'CallExpression',
                callee: {
                  type: 'Identifier',
                  name: 'h'
                },
                arguments: [
                  {
                    type: 'Identifier',
                    name: 'h1'
                  },
                  {
                    type: 'ObjectExpression',
                    properties: [
                      {
                        type: 'Property',
                        key: {
                          type: 'Identifier',
                          name: "class"
                        },
                        value: {
                          type: 'Literal', // 字面量
                          value: "foo"
                        }
                      }
                    ]
                  },
                  [
                    {
                      type: "Literal",
                      value: "Vue Template"
                    }
                  ]
                ]
              }
            ]
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
  return () => {
    return h(
      'div', 
      {}, 
      [
        h(
          'h1',
          { class: 'foo' },
          'Vue Template'
        )
      ]
    );
  };
}

const template = `
  <div>
    <h1 class="foo">Vue Template</h1>
  </div>
`;
const templateAST = parse(template);
const jsAST = transform(templateAST);
const code = generate(jsAST);
console.log(code);