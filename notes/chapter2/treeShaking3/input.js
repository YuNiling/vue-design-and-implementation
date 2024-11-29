import { foo, bar } from './utils.js';

const obj = { 
  foo: 'some value' ,
  bar: 'baz'
};

const res1 = foo(obj);
console.log(res1);

const res2 = bar(obj);
/*#__PURE__*/ console.log(res2);

// 命令：npx rollup input.js -f esm -o dist/bundle.js