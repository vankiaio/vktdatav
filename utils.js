const os = require('os');
const path = require('path');

if (typeof localStorage === "undefined" || localStorage === null) {
  let LocalStorage = require('node-localstorage').LocalStorage;
  localStorage = new LocalStorage(path.join(__dirname, './LOCALSTORAGE'));
}

exports.localStorage = function () {
  return localStorage;
};

exports.getIP = function () {
  let ifaces = os.networkInterfaces();
  let IPArr =[]
  for (let dev in ifaces) {
    let alias=0;
    ifaces[dev].forEach(function (details) {
      if (details.family === 'IPv4') {
        IPArr.push(details.address);
        ++alias;
      }
    });
  }
  return IPArr[0]
};

let isOpen = {};
exports.isOpen = function (status) {
  isOpen.status = status
  return isOpen
};
