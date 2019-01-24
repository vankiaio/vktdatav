'use strict';
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
//const mockjs = require('express-mockjs');
const opn = require('opn');
const utils = require('./utils');
const r2 = require('r2');
// import ccxt
const ccxt = require('ccxt');
// import GeoIP-lite
const geoip = require('geoip-lite');
const superagent = require('superagent');
const translate = require('google-translate-api');
// 载入配置文件
const config = require('./config');
const fs = require('fs');
require('colors');
const {
  Api,
  JsonRpc,
  RpcError,
  JsSignatureProvider,
} = require('eosjs');
const ecc = require("eosjs-ecc");
const fetch = require('node-fetch'); // node only; not needed in browsers
const {
  TextDecoder,
  TextEncoder
} = require('text-encoding'); // node, IE11 and IE Edge Browsers
const MongoClient = require('mongodb').MongoClient;
const MONGO_URL = config.MONGO_URL;
const VKTAPI_URL = config.VKTAPI_URL;
const XE_URL = config.XE_URL;
const SCATTER_API = config.SCATTER_API;

// 服务器端口
let NODE_PORT = 3030;

// 获取窗口打开标识
let isOpenWin = utils.localStorage().getItem('ISOPENWIN');

let vktdatav = {};
let vktdatav_producers_num = {};
let vktdatav_producers_list = [];
let vktdatav_accounts_num = {};
let vktdatav_accounts_info = {};
let vktdatav_blocks_num = {};
let vktdatav_transaction_num = {};
let vktdatav_maxtps = {};
let vktdatav_maxtps_onehour = {};
let vktdatav_nowtps = {};
let vktdatav_tpslist = {};
let vktdatav_blocks_list = [];
let vktdatav_vktprice_list = [];
let vktdatav_vkttracker_info = [];
let vktdatav_allprices = {};
let vktdatav_currencies = ["USD", "EUR", "CNY", "GBP", "JPY", "CAD", "CHF", "AUD", "KRW"];
let vktdatav_producer_now = {};
let vktdatav_producer_location = {};
let vktdatav_mproducer_location = {};
let vktdatav_bproducer_location = {};
let vktdatav_cnyusd_price = {};
let vktdatav_flyline = {};

let IsLoadingRPCBASE = false;
let IsLoadingRPCPRODUCER = false;
let IsLoadingRPCBlockList = false;
let accountid = "";

let m_maxtps = 0;
let m_maxtps_onehour = 0;

// 创建express
const app = express();

// 路由scatter prices数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/vktapi/v1/currencies', async (req, res) => {

  console.log('/vktapi/v1/currencies', req);
  res.json(vktdatav_currencies);
});

// 路由scatter prices数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/vktapi/v1/prices', async (req, res) => {

  console.log('/vktapi/v1/prices', req.query.v2);
  if (req.query.v2 === "true") {
    res.json(vktdatav_allprices);
  } else {
    res.json(JSON.from('{}'));
  }
});

// 路由scatter create_vkt account
// /vktapi/v1/create_vkt { transaction_id: '111',
//   signature: 'SIG_K1_KkFyxEKt9XerYAzrKmKPKJscesnE9LX3a9vfhbeLHts1u9qU69Wbnk1CEW4B9Jh7MsLvQ2mJcesDvbSf1ss6H9GzK5CgJo',
//   keys: 
//    { active: 'VKT8d2MU37BHznkchJA3gNiFJmPFfM6T2WXocuJzDmQsj8tH2Nhqp',
//      owner: 'VKT64Qv4GnUN4TU3fKqHvfhxGLpnjnMCujwAMNZHLuWn1mYbAbFjk' },
//   account_name: 'tokyoliyi111' }

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.post('/vktapi/v1/create_vkt', async (req, res) => {

  console.log('/vktapi/v1/create_vkt', req.body);
  if (req.body.signature != undefined && req.body.keys.active != undefined) {
    let sig = req.body.signature;
    let pubkey = req.body.keys.active;
    console.log('Public Key:\t', pubkey) // VKTkey...
    let checkHash = ecc.verify(sig, pubkey, pubkey);
    console.log('/vktapi/v1/create_vkt - checkHash=', checkHash);
    
  } else {
    res.json(JSON.from('{}'));
  }
});


// 路由scatter 多语言数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/vktapi/v1/languages', async (req, res) => {

  let file;
  let Isfound = false;
  let lang = JSON.parse('{}');
  if (req.query.names != undefined) {
    console.log('/vktapi/v1/languages?names=', req.query.names);
    file = path.join(__dirname, './data/lang/1.json');
    lang = JSON.parse(fs.readFileSync(file));
    res.json(lang);
    return;
  }
  if (req.query.name != undefined) {
    console.log('/vktapi/v1/languages?name=', req.query.name);
    file = path.join(__dirname, './data/lang/1.json');
    let alllang = JSON.parse(fs.readFileSync(file));

    for (let i in alllang) {
      if (alllang[i] === req.query.name) {
        Isfound = true;
        break;
      }
    }
    if (Isfound) {
      file = path.join(__dirname, './data/lang/' + req.query.name + '.json');
      lang = JSON.parse(fs.readFileSync(file));
      res.json(lang);
    } else {
      res.json(lang);
    }
  } else {
    res.json(lang);
  }

});

// 路由scatter 账户信息数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/vktapi/v1/account/vkt/:account_id', async (req, res) => {

  app.param('account_id', function (req, res, next, account_id) {
    accountid = account_id;
    console.log('/vktapi/v1/account/vkt/:account_id', accountid);
    next();
  });

  // 获取账号qingzhudatac的信息
  const accountInfo = await rpc.get_account(accountid);
  console.log(accountInfo);


  //获取账号qingzhudatac的资产,查询资产的时候要加上资产的合约名字eosio.token
  const balances = await rpc.get_currency_balance('eosio.token', accountid);
  console.log(balances);

  vktdatav_accounts_info.account_name = accountInfo.account_name;
  vktdatav_accounts_info.balances = JSON.parse('[]');

  for (let i in balances) {
    let balarr = balances[i].split(" ");
    vktdatav_accounts_info.balances.push({
      contract: "eosio.token",
      amount: balarr[0],
      currency: balarr[1],
      decimals: balarr[0].split(".")[1].length,
    });
  }


  // const accountInfo2 = await rpc.get_account('qingzhudatac');
  // console.log(accountInfo2);


  //获取账号操作历史
  // const actionHistory = await rpc.history_get_actions('qingzhudatac');
  // console.log(actionHistory);

  //table_row

  // const tableRow = await rpc.get_table_rows({ "scope": "currency", "code": "currency", "table":"stat","json":true})
  // console.log(tableRow);

  res.json(vktdatav_accounts_info);
});

// 路由vkt all info 数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/vktapi', async (req, res) => {

  console.log('/vktapi', req.query);
  switch (req.query.showtype) {
    case "all":
    case undefined:
      res.json(vktdatav);
      break;
    case "producers_num":
      res.json(vktdatav_producers_num);
      break;
    case "accounts_num":
      res.json(vktdatav_accounts_num);
      break;
    case "blocks_num":
      res.json(vktdatav_blocks_num);
      break;
    case "transaction_num":
      res.json(vktdatav_transaction_num);
      break;
    case "vktdatav_tpslist":
      res.json(vktdatav_tpslist);
      break;
    case "vktdatav_nowtps":
      res.json(vktdatav_nowtps);
      break;
    case "vktdatav_maxtps":
      res.json(vktdatav_maxtps);
      break;
    case "vktdatav_maxtps_onehour":
      res.json(vktdatav_maxtps_onehour);
      break;
    case "producers_list":
      if (!IsLoadingRPCPRODUCER && vktdatav_producers_list.length >= 7) {
        res.json(vktdatav_producers_list);
      }
      break;
    case "blocks_list":
      if (!IsLoadingRPCBlockList) {
        res.json(vktdatav_blocks_list);
      }
      break;
    case "vktprice_list":
      res.json(vktdatav_vktprice_list);
      break;
    case "vkttracker_info":
      res.json(vktdatav_vkttracker_info);
      break;
    case "producer_now":
      res.json(vktdatav_producer_now);
      break;
    case "producer_location":
      res.json(vktdatav_producer_location);
      break;
    case "mproducer_location":
      res.json(vktdatav_mproducer_location);
      break;
    case "bproducer_location":
      res.json(vktdatav_bproducer_location);
      break;
    case "flyline":
      res.json(vktdatav_flyline);
      break;
    case "cnyusd_price":
      res.json(vktdatav_cnyusd_price);
      break;

  }
});

const intervalObj0 = setInterval(async () => {

  //获取汇率jsons数据
  await superagent.get(SCATTER_API + "/v1/prices?v2=true").end(async (err, sres) => {
    if (err) {
      console.log('err:', err);
      return;
    }
    const dataccxt = await runScatterPrices(JSON.parse(sres.text)).catch(err => {
      console.log("runScatterPrices error: ", err)
    });
  });

  console.log("nodejs app passed runScatterPrices!!!");
}, 15000);

const intervalObj1 = setInterval(async () => {

  //获取汇率jsons数据
  await r2(XE_URL + +new Date())
    .json
    .then(async ({
      rates
    }) => runExchange(rates))
    .catch((error) => {
      console.error('⚠️  Cannot fetch currency rates'.bold.red)
      console.log(error)
    })
  console.log("nodejs app passed runExchange!!!");

  //获取jsons数据
  const dataccxt = await runCcxt().catch(err => {
    console.log("ccxt error: ", err)
  });
  console.log("nodejs app passed runCcxt!!!");
}, 30000);

const intervalObj2 = setInterval(async () => {

  IsLoadingRPCBASE = true;

  console.log("nodejs app runRpcBaseInfo is loading ?", IsLoadingRPCBASE);

  //获取jsons数据
  const data = await runRpcBaseInfo().catch(err => {
    console.log("runRpcBaseInfo error: ", err)
  });

  console.log("nodejs app passed runRpcBaseInfo!!!");
  IsLoadingRPCBASE = false;

}, 3000);


const intervalObj3 = setInterval(async () => {

  IsLoadingRPCBlockList = true;

  console.log("nodejs app runRpcBlockList is loading ?", IsLoadingRPCBlockList);

  //获取jsons数据
  const data = await runRpcBlockList().catch(err => {
    console.log("runRpcBlockList error: ", err)
  });

  console.log("nodejs app passed runRpcBlockList!!!");
  IsLoadingRPCBlockList = false;

}, 6000);


const intervalObj4 = setInterval(async () => {

  IsLoadingRPCPRODUCER = true;

  console.log("nodejs app is loading ?", IsLoadingRPCPRODUCER);

  //获取jsons数据
  const data = await runRpcGetProducers().catch(err => {
    console.log("runRpcGetProducers error: ", err)
  });

  console.log("nodejs app passed runRpcGetProducers!!!");

  //获取jsons数据
  const datadb = await runMongodb().catch(err => {
    console.log("mongodb error: ", err)
  });
  console.log("nodejs app passed runMongodb!!!");

  IsLoadingRPCPRODUCER = false;

}, 8000);

const intervalObj5 = setInterval(async () => {

  //获取jsons数据
  const datadb = await runMongodbTPSList().catch(err => {
    console.log("mongodb error: ", err)
  });
  console.log("nodejs app passed runMongodbTPSList!!!");

}, 10000);

const defaultPrivateKey = "5KWNB8FSe3dYbW3fZJBvK4M4QhaCtRjh2EP5j7gSbs7GeNTnxV2"; // useraaaaaaaa
const signatureProvider = new JsSignatureProvider([defaultPrivateKey]);

const rpc = new JsonRpc(VKTAPI_URL, {
  fetch
});
const api = new Api({
  rpc,
  signatureProvider,
  textDecoder: new TextDecoder(),
  textEncoder: new TextEncoder()
});

// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runRpcBaseInfo = async () => {

  let curBlockNum = 0;
  let block_time;

  // 获取主网信息
  const info = await rpc.get_info();
  //console.log(info);
  vktdatav.chain_id = info.chain_id;
  vktdatav.head_block_num = info.head_block_num;
  vktdatav.head_block_producer = info.head_block_producer;
  vktdatav_blocks_num = [{
    // "name": "区块数量",
    "value": vktdatav.head_block_num
  }];

  vktdatav_producer_now = [{
    "producer": info.head_block_producer
  }, ];
  // 获取当前块交易单TPS数量
  // await rpc.get_block(info.head_block_num).then(async (currentblockInfo) => {
  //   //console.log(currentblockInfo)
  //   vktdatav_nowtps = [{
  //     "name": "TPS",
  //     "value": parseInt(currentblockInfo.transactions.length / 3) > 0 ? parseInt(currentblockInfo.transactions.length / 3) : (currentblockInfo.transactions.length % 3 > 0 ? 1 : 0)
  //   }];

  //   if(currentblockInfo.transactions.length / 3 >= m_maxtps) {
  //     m_maxtps = parseInt(currentblockInfo.transactions.length / 3);
  //   }
  // });

  return (vktdatav);

};


// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runRpcBlockList = async () => {

  let curBlockNum = 0;
  let block_time;

  // 获取最后24个区块信息的信息
  curBlockNum = vktdatav.head_block_num;
  vktdatav_blocks_list = JSON.parse('[]');
  for (let i = curBlockNum; i > curBlockNum - 10; i--) {
    // const blockInfo = await rpc.get_block(i);
    // [
    //   {
    //     "name": 22222,
    //     "location": "vankia",
    //     "state": "22:22:22"
    //   },
    // ]
    await Promise.resolve(i).then(async (i) => {
      await rpc.get_block(i).then(async (blockInfo) => {
        block_time = new Date(Date.parse(blockInfo.timestamp) + 8 * 3600 * 1000);
        vktdatav_blocks_list.push({
          "name": blockInfo.block_num,
          "producer": blockInfo.producer,
          "time": (block_time.getHours() < 10 ? '0' + block_time.getHours() : block_time.getHours()) + ':' +
            (block_time.getMinutes() < 10 ? '0' + block_time.getMinutes() : block_time.getMinutes()) + ':' +
            (block_time.getSeconds() < 10 ? '0' + block_time.getSeconds() : block_time.getSeconds())
        });
      });
    });
  }

  //确保排序
  vktdatav_blocks_list.sort(function down(x, y) {
    return (x.name < y.name) ? 1 : -1
  });

  return (vktdatav);

};


// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runRpcGetProducers = async () => {

  let dumapLocal_cn = "";
  let dumapLocal_en = "";
  let dumapLocal_start = 0;
  let producer_count = 0;


  const producersinfo = await rpc.get_producers();
  //console.log(producersinfo);

  producer_count = 0;
  for (let i in producersinfo.rows) {
    if (1 == producersinfo.rows[i].is_active) {
      producer_count++;
    }
  }

  console.log("count ------ alll", producer_count, vktdatav.producers_num, vktdatav_producers_list.length, vktdatav_producer_location.length)
  if (vktdatav.producers_num != producer_count ||
    vktdatav_producers_list.length != producer_count ||
    vktdatav_producer_location.length != producer_count) {
    vktdatav.producers_num = producer_count;
    vktdatav_producers_num = [{
      // "name": "节点数量",
      "value": producer_count
    }]

    vktdatav.producers = JSON.parse('[]');
    vktdatav_producer_location = JSON.parse('[]');
    vktdatav_mproducer_location = JSON.parse('[]');
    vktdatav_bproducer_location = JSON.parse('[]');
    vktdatav_producers_list = JSON.parse('[]');
    vktdatav_flyline = JSON.parse('[]');
    let producer_state = "";

    for (let i in producersinfo.rows) {
      (function () {
        setTimeout(async function () {
          dumapLocal_start = producersinfo.rows[i].url.indexOf("vkt") + 3;

          if (dumapLocal_start > 3) {
            dumapLocal_en = producersinfo.rows[i].url.substr(dumapLocal_start, producersinfo.rows[i].url.length - dumapLocal_start)
          }
          console.log("start ---- 1", dumapLocal_en)
          if (dumapLocal_en != "") {
            console.log("start ---- 2", dumapLocal_en)
            if (dumapLocal_en.indexOf("shi") < 0) {
              dumapLocal_en += "shi"
            }
            console.log(dumapLocal_en)
            await translate(dumapLocal_en, {
              to: 'zh-CN'
            }).then(async (res) => {
              dumapLocal_cn = res.text;
              console.log("start ---- 3", dumapLocal_cn)
              console.log(res.text);
              //=> 北京市
              console.log(res.from.language.iso);
              //=> zh-CN
              dumapLocal_en = "";

              if (dumapLocal_cn != "") {
                var sk = '5iRbwByNvoPafZvsYE6GWoGm5vooaS9F' // 创建应用的sk
                  ,
                  address = dumapLocal_cn;

                await superagent.get('http://api.map.baidu.com/geocoder/v2/')
                  .query({
                    address: address
                  })
                  .query({
                    output: 'json'
                  })
                  .query({
                    ak: sk
                  })
                  .end((err, sres) => {
                    if (err) {
                      console.log('err:', err);
                      return;
                    }
                    console.log('location:', sres.text);

                    if (producersinfo.rows[i].is_active == 1) {

                      vktdatav_producer_location.push({
                        lat: JSON.parse(sres.text).result.location.lat,
                        lng: JSON.parse(sres.text).result.location.lng,
                        value: 100
                      });
                      //res.send(sres.text);
                      vktdatav.producers.push({
                        owner: producersinfo.rows[i].owner,
                        location: {
                          city: dumapLocal_cn,
                          lat: JSON.parse(sres.text).result.location.lat,
                          lng: JSON.parse(sres.text).result.location.lng
                        }
                      });
                      if (i < 7) {
                        vktdatav_mproducer_location.push({
                          lat: JSON.parse(sres.text).result.location.lat,
                          lng: JSON.parse(sres.text).result.location.lng,
                          value: 100
                        });
                        producer_state = "超级节点"
                      } else {
                        vktdatav_bproducer_location.push({
                          lat: JSON.parse(sres.text).result.location.lat,
                          lng: JSON.parse(sres.text).result.location.lng,
                          value: 100
                        });
                        producer_state = "备用节点"
                        if (vktdatav_mproducer_location.length > 0) {
                          let idx = parseInt(Math.random() * vktdatav_mproducer_location.length, 10);
                          vktdatav_flyline.push({
                            from: JSON.parse(sres.text).result.location.lng + ',' + JSON.parse(sres.text).result.location.lat,
                            to: vktdatav_mproducer_location[idx].lng + ',' + vktdatav_mproducer_location[idx].lat
                          });
                        }
                      }
                      // [
                      //   {
                      //     "name": "vankia",
                      //     "location": "北京",
                      //     "state": "超级节点"
                      //   },
                      // ]
                      vktdatav_producers_list.push({
                        "name": producersinfo.rows[i].owner,
                        "location": dumapLocal_cn,
                        "state": producer_state
                      })
                      console.log("end ---- 1", dumapLocal_cn)
                    }
                  })
              }
            }).catch(err => {
              console.error(err);
            });
          }
        }, 800 * i);
      })();
    }
  }

  // var ip = "124.200.176.166";
  // var geo = geoip.lookup(ip);

  // console.log(geo);

  return (vktdatav);

};

// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runMongodb = async () => {


  MongoClient.connect(MONGO_URL, async function (err, db) {
    if (err) {
      console.error(err);
      throw err;
    }
    const dbo = db.db("EOS");
    // dbo.collection("accounts").find().toArray(function(err, result) {
    //   if (err) throw err;
    //   for (let i in result) {
    //     console.log(result[i].name);
    //   }
    await dbo.collection("accounts").find().toArray(async function (err, result) {
      if (err) throw err;
      // for (let i in result) {
      //   console.log(result[i].name);
      // }
      if (result.length >= 1) {
        vktdatav.accounts_num = result.length;
        vktdatav_accounts_num = [{
          // "name": "账户数量",
          "value": result.length + 500
        }];
      }
    });
    await dbo.collection("transaction_traces").find({
      "producer_block_id": {
        $ne: null
      }
    }).count(async function (err, result) {
      if (err) throw err;
      if (result >= 1) {
        vktdatav.transactions_num = result;
        vktdatav_transaction_num = [{
          // "name": "交易数量",
          "value": result
        }];
      }
    });
    // await dbo.collection("account_controls").find().count(async function (err, result) {
    //   if (err) throw err;
    //   vktdatav.contracks_num = result;
    // });
    //controlled_account: 'vktbeijing',
    // controlled_permission: 'qingzhudatac',
    //   controlling_account: 'vankia.trans',
    //     createdAt: 2018 - 12 - 03T09: 07: 03.191Z
    //获取合约
    await dbo.collection("account_controls").find().toArray(async function (err, result) {
      if (err) throw err;
      vktdatav.constracks = JSON.parse('[]');
      for (let i in result) {
        vktdatav.constracks.push({
          controlled_account: result[i].controlled_account,
          controlled_permission: result[i].controlled_permission,
          controlling_account: result[i].controlling_account,
          createdAt: result[i].createdAt
        });
      }
      vktdatav.contracks_num = result.count;
      //console.log(result);
    });
    if (m_maxtps < 2000 || m_maxtps_onehour > m_maxtps) {
      //aggregate({$group : {_id : "$block_num", max_transactions : {$sum : 1}}},{$group:{_id:null,max:{$max:"$max_transactions"}}})
      await dbo.collection("transaction_traces").aggregate({
          $match: {
            "producer_block_id": {
              $ne: null
            }
          }
        }, {
          $group: {
            _id: "$block_num",
            max_transactions: {
              $sum: 1
            }
          }
        }, {
          $sort: {
            max_transactions: -1
          }
        }, {
          $group: {
            _id: null,
            block_num: {
              $first: "$_id"
            },
            max: {
              $first: "$max_transactions"
            }
          }
        },
        async function (err, result) {
          if (err) throw err;
          result.toArray(async function (err, result) {
            if (err) throw err;
            // console.log(result);
            if (result.length >= 1) {
              vktdatav.max_tps_num = parseInt(result[0].max / 3);
              vktdatav.max_tps_block_num = parseInt(result[0].block_num);
              // [
              //   {
              //     "value": "/2000MAX",
              //     "url": ""
              //   }
              // ]
              if (parseInt(result[0].max / 3) >= m_maxtps) {
                m_maxtps = parseInt(result[0].max / 3);
              }
              vktdatav_maxtps = [{
                "value": "/" + m_maxtps + "MAX",
                "url": ""
              }];
            }
          });
          db.close();
        });
    } else {
      // 最后一小时TPS
      await dbo.collection("transaction_traces").aggregate({
          $match: {
            "block_num": {
              $gte: vktdatav.head_block_num - 1200
            },
            "producer_block_id": {
              $ne: null
            }
          }
        }, {
          $group: {
            _id: "$block_num",
            max_transactions: {
              $sum: 1
            }
          }
        }, {
          $sort: {
            max_transactions: -1
          }
        }, {
          $group: {
            _id: null,
            block_num: {
              $first: "$_id"
            },
            max: {
              $first: "$max_transactions"
            }
          }
        },
        async function (err, result) {
          if (err) throw err;
          result.toArray(async function (err, result) {
            if (err) throw err;
            // console.log(result);
            if (result.length >= 1) {
              m_maxtps_onehour = parseInt(result[0].max / 3) > 1 ? parseInt(result[0].max / 3) : 1;
              vktdatav_maxtps_onehour = [{
                "value": m_maxtps_onehour + "MAX/H",
                "url": ""
              }];
            }
          });
        });
      //nowtps取得
      await dbo.collection("transaction_traces").aggregate({
          $match: {
            "block_num": {
              $gte: vktdatav.head_block_num - 2
            },
            "producer_block_id": {
              $ne: null
            }
          }
        }, {
          $group: {
            _id: "$block_num",
            max_transactions: {
              $sum: 1
            }
          }
        }, {
          $sort: {
            max_transactions: -1
          }
        }, {
          $group: {
            _id: null,
            block_num: {
              $first: "$_id"
            },
            max: {
              $first: "$max_transactions"
            }
          }
        },
        async function (err, result) {
          if (err) throw err;
          result.toArray(async function (err, result) {
            if (err) throw err;
            // console.log(result);
            if (result.length >= 1) {
              //   vktdatav_nowtps = [{
              //     "name": "TPS",
              //     "value": parseInt(currentblockInfo.transactions.length / 3) > 0 ? parseInt(currentblockInfo.transactions.length / 3) : (currentblockInfo.transactions.length % 3 > 0 ? 1 : 0)
              //   }];
              vktdatav_nowtps = [{
                // "name": "TPS",
                "value": parseInt(result[0].max / 3) > 0 ? parseInt(result[0].max / 3) : (result[0].max % 3 > 0 ? 1 : 0)
              }];
            } else {
              vktdatav_nowtps = [{
                // "name": "TPS",
                "value": 0
              }];
            }
          });
          db.close();
        });
    }
  });

  return vktdatav;
}

// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runMongodbTPSList = async () => {


  MongoClient.connect(MONGO_URL, async function (err, db) {
    if (err) {
      console.error(err);
      throw err;
    }
    const dbo = db.db("EOS");
    // dbo.collection("accounts").find().toArray(function(err, result) {
    //   if (err) throw err;
    //   for (let i in result) {
    //     console.log(result[i].name);
    //   }
    //nowtps取得
    await dbo.collection("transaction_traces").aggregate({
        $match: {
          "block_num": {
            $gte: vktdatav.head_block_num - 26,
            $lte: vktdatav.head_block_num
          },
          "producer_block_id": {
            $ne: null
          }
        }
      }, {
        $group: {
          _id: "$block_num",
          max_transactions: {
            $sum: 1
          }
        }
      },
      async function (err, result) {
        if (err) throw err;
        result.toArray(async function (err, result) {
          if (err) throw err;
          // console.log(result);
          if (result.length >= 1) {
            vktdatav_tpslist = JSON.parse('[]');
            for (let i = 0; i < result.length; i++) {

              await Promise.resolve(i).then(async (i) => {
                vktdatav_tpslist.push({
                  'x': result[i]._id,
                  'y': parseInt(result[i].max_transactions / 3),
                  's': 0
                });
              });
            }
            //确保排序
            vktdatav_tpslist.sort(function down(x, y) {
              return (x.x < y.x) ? -1 : 1
            });

            for (let i = 0; i < result.length; i++) {
              await Promise.resolve(i).then(async (i) => {
                vktdatav_tpslist[i].s = i+1;
              });
            }
          } else {
            vktdatav_tpslist = JSON.parse('[]');
            for (let i = 0; i < 12; i++) {
              await Promise.resolve(i).then(async (i) => {
                vktdatav_tpslist.push({
                  'x': vktdatav.head_block_num - 12 + i,
                  'y': parseInt(0),
                  's': i+1
                });
              });
            }
          }
        });
        db.close();
      });
  });
  return vktdatav;
}

// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runCcxt = async () => {

  let ticker_vkteth = [];
  let ticker_ethusd = [];
  let vktkline_date = "";
  let vktkline_YMD = "";

  // get vkteth price and vol
  let bitforex = new ccxt.bitforex();
  //bitforex.proxy = 'https://cors-anywhere.herokuapp.com/';
  // load all markets from the exchange
  let markets = await bitforex.loadMarkets();

  const symbol_vkteth = 'VKT/ETH';
  if (symbol_vkteth in bitforex.markets) {
    ticker_vkteth = await bitforex.fetchTicker(symbol_vkteth);
  }
  //console.log(ticker_vkteth);

  // get ethusd price
  let bittrex = new ccxt.bittrex();
  //bittrex.proxy = 'https://cors-anywhere.herokuapp.com/';
  // load all markets from the exchange
  markets = await bittrex.loadMarkets();

  const symbol_ethusd = 'ETH/USD';
  if (symbol_ethusd in bittrex.markets) {
    ticker_ethusd = await bittrex.fetchTicker(symbol_ethusd);
  }
  //console.log(ticker_ethusd);

  // get vkteth 1hour price
  const ohlcvkteth = await bitforex.fetchOHLCV(symbol_vkteth, '1d', 8);
  const last7dTime = ohlcvkteth[0].time; // 1h ago closing time
  const currentPrice = ohlcvkteth[ohlcvkteth.length - 1].close; // current closing price
  const last1dPrice = ohlcvkteth[ohlcvkteth.length - 2].close; // 1d ago closing price
  const last1wPrice = ohlcvkteth[1].close; // 1w ago closing price
  // console.log(last7dTime);
  // console.log(last1hPrice);
  // console.log(last1dPrice);
  // console.log(last1wPrice);
  // console.log(ohlcvkteth);

  const ohlcethusd = await bittrex.fetchOHLCV(symbol_ethusd, '1d', last7dTime, 8);
  // console.log(ohlcethusd);
  // console.log(ohlcethusd[0][4]);

  vktdatav.vktusdlast7d = JSON.parse('[]');
  vktdatav_vktprice_list = JSON.parse('[]');
  // [
  //   {
  //     "x": "2010/01/01 00:00:00",
  //     "y": 375
  //   },
  // ]
  for (let i in ohlcethusd) {
    vktkline_date = new Date(ohlcvkteth[i].time);
    vktkline_YMD = vktkline_date.getFullYear() + '/' +
      (vktkline_date.getMonth() + 1 < 10 ? '0' + (vktkline_date.getMonth() + 1) : vktkline_date.getMonth() + 1) + '/' +
      (vktkline_date.getDate() < 10 ? '0' + (vktkline_date.getDate()) : vktkline_date.getDate())
    // console.log(vktkline_date)
    vktdatav.vktusdlast7d.push({
      'price': (ohlcethusd[i][4] * ohlcvkteth[i].close).toFixed(8),
      'date': vktkline_YMD
    });
    vktdatav_vktprice_list.push({
      'x': vktkline_YMD,
      'y': (ohlcethusd[i][4] * ohlcvkteth[i].close).toFixed(8)
    });
  }

  vktdatav_cnyusd_price = [{
    // "name": "",
    "value": (vktdatav.usdcny * vktdatav_vktprice_list[7].y).toFixed(8)
  }];

  vktdatav_vkttracker_info = {
    'price_vktcny': (vktdatav.usdcny * vktdatav_vktprice_list[7].y).toFixed(8),
    'price_vkteth': last1dPrice.toFixed(8),
    'volume_24h': ticker_vkteth.baseVolume,
    'circulating_supply': 500000000,
    'total_supply': 1000000000,
    'percent_change_1d': ((currentPrice - last1dPrice) / last1dPrice).toFixed(8),
    'percent_change_7d': ((currentPrice - last1wPrice) / last1wPrice).toFixed(8)
  };
  return vktdatav;
}

// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runExchange = async (rates) => {
  const currencies = JSON.parse(decodeRatesData(rates.minutely))
  vktdatav.usdcny = currencies.CNY
  vktdatav.currencies = currencies
  // console.log(currencies)
}

// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runScatterPrices = async (prices) => {
  //console.log(prices)
  vktdatav_allprices = prices;
  if (vktdatav.vktusdlast7d && vktdatav.vktusdlast7d.length > 0) {
    vktdatav_allprices["vkt:eosio.token:vkt"] = {
      USD: (vktdatav.vktusdlast7d[7].price * 1.0).toFixed(8),
      EUR: (vktdatav.vktusdlast7d[7].price * vktdatav.currencies.EUR).toFixed(8),
      CNY: (vktdatav.vktusdlast7d[7].price * vktdatav.currencies.CNY).toFixed(8),
      GBP: (vktdatav.vktusdlast7d[7].price * vktdatav.currencies.GBP).toFixed(8),
      JPY: (vktdatav.vktusdlast7d[7].price * vktdatav.currencies.JPY).toFixed(8),
      CAD: (vktdatav.vktusdlast7d[7].price * vktdatav.currencies.CAD).toFixed(8),
      CHF: (vktdatav.vktusdlast7d[7].price * vktdatav.currencies.CHF).toFixed(8),
      AUD: (vktdatav.vktusdlast7d[7].price * vktdatav.currencies.AUD).toFixed(8),
      KRW: (vktdatav.vktusdlast7d[7].price * vktdatav.currencies.KRW).toFixed(8),
    };
    vktdatav.allprices = vktdatav_allprices;
  }

  // console.log(currencies)
}

/* eslint-disable */
function decodeRatesData(c) {
  try {
    var a = c.substr(c.length - 4)
    var f = a.charCodeAt(0) + a.charCodeAt(1) + a.charCodeAt(2) + a.charCodeAt(3)
    f = (c.length - 10) % f
    f = (f > (c.length - 10 - 4)) ? (c.length - 10 - 4) : f
    var l = c.substr(f, 10)
    c = c.substr(0, f) + c.substr(f + 10)
    var c = decode64(decodeURIComponent(c))
    if (c === false) {
      return false
    }
    var m = ''
    var b = 0
    for (var d = 0; d < (c.length); d += 10) {
      var h = c.charAt(d)
      var g = l.charAt(((b % l.length) - 1) < 0 ? (l.length + (b % l.length) - 1) : ((b % l.length) - 1))
      h = String.fromCharCode(h.charCodeAt(0) - g.charCodeAt(0))
      m += (h + c.substring(d + 1, d + 10))
      b++
    }
    return m
  } catch (k) {
    return false
  }
}

function decode64(g) {
  try {
    var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    var b = ''
    var o, m, k = ''
    var n, l, j, h = ''
    var d = 0
    var a = /[^A-Za-z0-9\+\/\=]/g
    if (a.exec(g)) {
      return false
    }
    g = g.replace(/[^A-Za-z0-9\+\/\=]/g, '')
    do {
      n = c.indexOf(g.charAt(d++))
      l = c.indexOf(g.charAt(d++))
      j = c.indexOf(g.charAt(d++))
      h = c.indexOf(g.charAt(d++))
      o = (n << 2) | (l >> 4)
      m = ((l & 15) << 4) | (j >> 2)
      k = ((j & 3) << 6) | h
      b = b + String.fromCharCode(o)
      if (j != 64) {
        b = b + String.fromCharCode(m)
      }
      if (h != 64) {
        b = b + String.fromCharCode(k)
      }
      o = m = k = ''
      n = l = j = h = ''
    } while (d < g.length)
    return unescape(b)
  } catch (f) {
    return false
  }
}

// 监听端口、打开浏览器
app.listen(NODE_PORT, function () {
  if (isOpenWin === 'false') {
    let uri = 'http://' + utils.getIP() + ':' + port + '/api';
    opn(uri);

    // 设置窗口打开标识
    utils.localStorage().setItem('ISOPENWIN', 'true');

    console.log("mock server start success.".green);
  }
});
