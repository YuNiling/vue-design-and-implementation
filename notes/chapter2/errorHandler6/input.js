import utils from "./utils.js";

utils.registerErrorHandler((e) => {
  console.log('统一错误：', e);
});
utils.foo(() => {
  const num1 = 10;
  const num2 = 0;
  const result = num1 / num3;
  console.log('result', result);
});

utils.bar(() => {
  const test = 20;
  test = 30;
});