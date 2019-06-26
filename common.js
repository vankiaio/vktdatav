class Ut {
    /**
    * 异步延迟
    * @param {number} time 延迟的时间,单位毫秒
    */
    static sleep(time = 0) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve();
        }, time);
      })
    };
    /**
    * 字符串是否为空
    * @param {string} value 字符串
    */
    static isEmpty(value) {
      return typeof value == 'string' && !value.trim() || typeof value == 'undefined' || value === null;
    }
  }
   
  module.exports = Ut;