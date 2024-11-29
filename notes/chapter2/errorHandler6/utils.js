let handlerError = null;

export default {
  foo(fn) {
    callWithErrorHandling(fn);
  },
  bar(fn) {
    callWithErrorHandling(fn);
  },
  // 用户可以调用该函数注册统一的错误处理函数
  registerErrorHandler(fn) {
    handlerError = fn;
  }
}

function callWithErrorHandling(fn) {
  try {
    fn && fn();
  } catch(e) {
    // 将捕获到的错误传递给用户的错误处理函数
    handlerError(e);
  }
}