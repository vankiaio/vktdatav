var config = {
  name: 'vktdatav', // 名字
  description: 'vkt大屏幕展示', // 社区的描述
  MONGO_URL: "mongodb://vankiaio:vankia123!@221.122.119.226:27017/VKT",
  VKTAPI_URL: "http://221.122.119.226:8888",
  XE_URL: "http://www.xe.com/a/ratesprovider.php?_=",
  SCATTER_API: "https://api.get-scatter.com",
  defaultPrivateKey: "5KPgsKGggSYKVtJqCACAgZxgjbQwzJsqCPuCN71cxTr52UzKMd5", // makeaccouts
  candyPrivateKey: "5Jv8HzeBfFiygsmnsCkQW98tw7mygah3nBVTw636xJedLhYvSCa", // vktokendapps

  // 其他配置项...
};
module.exports = config;