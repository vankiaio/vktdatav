'use strict';
const path = require('path');
const express = require('express');
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

require('colors');
const { Api, JsonRpc, RpcError, JsSignatureProvider } = require('eosjs');
const fetch = require('node-fetch');                            // node only; not needed in browsers
const { TextDecoder, TextEncoder } = require('text-encoding');  // node, IE11 and IE Edge Browsers
const MongoClient = require('mongodb').MongoClient;
const url = "mongodb://@221.122.119.226:27017/admin";
const XE_URL = 'http://www.xe.com/a/ratesprovider.php?_=';

// 服务器端口
let NODE_PORT = 3030;

// 获取窗口打开标识
let isOpenWin = utils.localStorage().getItem('ISOPENWIN');

let vktdatav = {};
let vktdatav_producers_num = {};
let vktdatav_producers_list = [];
let vktdatav_accounts_num = {};
let vktdatav_blocks_num = {};
let vktdatav_transaction_num = {};
let vktdatav_maxtps = {};
let vktdatav_blocks_list = [];
let vktdatav_vktprice_list = [];

let IsLoading = false;

// 创建express
const app = express();

// 路由mock数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/vktapi', async (req, res) => {

  if (IsLoading == false) {

    IsLoading = true;

    console.log("nodejs app is loading ?", IsLoading);

    //获取jsons数据
    const data = await runRpc().catch(err => {
      console.log("rpc error: ", err)
    });

    console.log("nodejs app passed runRpc!!!");

    //获取jsons数据
    const datadb = await runMongodb().catch(err => {
      console.log("mongodb error: ", err)
    });
    console.log("nodejs app passed runMongodb!!!");

    //获取jsons数据
    const dataccxt = await runCcxt().catch(err => {
      console.log("ccxt error: ", err)
    });
    console.log("nodejs app passed runCcxt!!!");

    //获取汇率jsons数据
    await r2(XE_URL + +new Date())
      .json
      .then(async ({ rates }) => runExchange(rates))
      .catch((error) => {
        console.error('⚠️  Cannot fetch currency rates'.bold.red)
        console.log(error)
      })
    console.log("nodejs app passed runExchange!!!");
    IsLoading = false;
  }
  console.log(req.query.showtype);
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
    case "vktdatav_maxtps":
      res.json(vktdatav_maxtps);
      break;
    case "producers_list":
      res.json(vktdatav_producers_list);
      break;
    case "blocks_list":
      res.json(vktdatav_blocks_list);
      break;
    case "vktprice_list":
      res.json(vktdatav_vktprice_list);
      break;

  }
});


const defaultPrivateKey = "5KWNB8FSe3dYbW3fZJBvK4M4QhaCtRjh2EP5j7gSbs7GeNTnxV2"; // useraaaaaaaa
const signatureProvider = new JsSignatureProvider([defaultPrivateKey]);

const rpc = new JsonRpc('http://221.122.119.226:8888', { fetch });
const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });

// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runRpc = async () => {

  let dumapLocal_cn = "";
  let dumapLocal_en = "";
  let dumapLocal_start = 0;
  let curBlockNum = 0;
  // 获取主网信息
  const info = await rpc.get_info();
  console.log(info);
  vktdatav.head_block_num = info.head_block_num;
  vktdatav.head_block_producer = info.head_block_producer;
  vktdatav_blocks_num = [
    {
      "name": "区块数量",
      "value": vktdatav.head_block_num
    }
  ]
  // 获取最后24个区块信息的信息
  curBlockNum = vktdatav.head_block_num;
  vktdatav_blocks_list = JSON.parse('[]');
  for (let i = curBlockNum; i > curBlockNum - 24; i--) {
    const blockInfo = await rpc.get_block(i);
    // [
    //   {
    //     "name": 22222,
    //     "location": "vankia",
    //     "state": "22:22:22"
    //   },
    // ]
    vktdatav_blocks_list.push({ "name": blockInfo.block_num, "producer": blockInfo.producer, "time": blockInfo.timestamp });
  }



  // 获取账号qingzhudatac的信息
  // const accountInfo = await rpc.get_account('qingzhudatac');
  // console.log(accountInfo);


  //获取账号qingzhudatac的资产,查询资产的时候要加上资产的合约名字eosio.token
  // const balance = await rpc.get_currency_balance('eosio.token','qingzhudatac');
  // console.log(balance);


  // const accountInfo2 = await rpc.get_account('qingzhudatac');
  // console.log(accountInfo2);


  //获取账号操作历史
  // const actionHistory = await rpc.history_get_actions('qingzhudatac');
  // console.log(actionHistory);

  //table_row

  // const tableRow = await rpc.get_table_rows({ "scope": "currency", "code": "currency", "table":"stat","json":true})
  // console.log(tableRow);

  const producersinfo = await rpc.get_producers();
  console.log(producersinfo);

  vktdatav.producers_num = producersinfo.rows.length;
  vktdatav_producers_num = [
    {
      "name": "节点数量",
      "value": producersinfo.rows.length
    }
  ]

  vktdatav.producers = JSON.parse('[]');
  let producer_state = "";

  for (let i in producersinfo.rows) {
    dumapLocal_start = producersinfo.rows[i].url.indexOf("vkt") + 3;

    if (dumapLocal_start > 3) {
      dumapLocal_en = producersinfo.rows[i].url.substr(dumapLocal_start, producersinfo.rows[i].url.length - dumapLocal_start)
    }
    if (dumapLocal_en != "") {
      if (dumapLocal_en.indexOf("shi") < 0) {
        dumapLocal_en += "shi"
      }
      console.log(dumapLocal_en)
      await translate(dumapLocal_en, { to: 'zh-CN' }).then(async (res) => {
        dumapLocal_cn = res.text;
        console.log(res.text);
        //=> 北京市
        console.log(res.from.language.iso);
        //=> zh-CN
        dumapLocal_en = "";

        if (dumapLocal_cn != "") {
          var sk = 'M6RPENx4SM8jvjk5qPdVy8yp6AgMKAv0' // 创建应用的sk
            , address = dumapLocal_cn;

          await superagent.get('http://api.map.baidu.com/geocoder/v2/')
            .query({ address: address })
            .query({ output: 'json' })
            .query({ ak: sk })
            .end(function (err, sres) {
              if (err) {
                console.log('err:', err);
                return;
              }
              console.log('location:', sres.text);
              //res.send(sres.text);
              vktdatav.producers.push({ owner: producersinfo.rows[i].owner, location: { city: dumapLocal_cn, lat: JSON.parse(sres.text).result.location.lat, lng: JSON.parse(sres.text).result.location.lng } });
              if (i < 3) {
                producer_state = "超级节点"
              } else {
                producer_state = "备用节点"
              }
              // [
              //   {
              //     "name": "vankia",
              //     "location": "北京",
              //     "state": "超级节点"
              //   },
              // ]
              if (vktdatav_producers_list.length >= producersinfo.rows.length) {
                console.log(vktdatav_producers_list[i])
                //vktdatav_producers_list[0].setItem({ name: producersinfo.rows[i].owner, location: dumapLocal_cn, state: producer_state })
              } else {
                vktdatav_producers_list.push({ "name": producersinfo.rows[i].owner, "location": dumapLocal_cn, "state": producer_state })
              }
            })
        }
      }).catch(err => {
        console.error(err);
      });
    }

  }

  // var ip = "124.200.176.166";
  // var geo = geoip.lookup(ip);

  // console.log(geo);

  return (vktdatav);

};

// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runMongodb = async () => {


  MongoClient.connect(url, function (err, db) {
    if (err) {
      console.error(err);
      throw err;
    }
    var dbo = db.db("EOS");
    // dbo.collection("accounts").find().toArray(function(err, result) {
    //   if (err) throw err;
    //   for (let i in result) {
    //     console.log(result[i].name);
    //   }
    dbo.collection("accounts").find().toArray(function (err, result) {
      if (err) throw err;
      // for (let i in result) {
      //   console.log(result[i].name);
      // }
      if (result.length >= 1) {
        vktdatav.accounts_num = result.length;
        vktdatav_accounts_num = [
          {
            "name": "账户数量",
            "value": result.length
          }
        ];
      }
      db.close();
    });
    dbo.collection("transaction_traces").find().count(function (err, result) {
      if (err) throw err;
      if (result >= 1) {
        vktdatav.transactions_num = result;
        vktdatav_transaction_num = [
          {
            "name": "交易数量",
            "value": result
          }
        ];
      }
      db.close();
    });
    dbo.collection("account_controls").find().count(function (err, result) {
      if (err) throw err;
      vktdatav.contracks_num = result;
      db.close();
    });
    //controlled_account: 'vktbeijing',
    // controlled_permission: 'qingzhudatac',
    //   controlling_account: 'vankia.trans',
    //     createdAt: 2018 - 12 - 03T09: 07: 03.191Z
    //获取合约
    dbo.collection("account_controls").find().toArray(function (err, result) {
      if (err) throw err;
      vktdatav.constracks = JSON.parse('[]');
      for (let i in result) {
        vktdatav.constracks.push({
          controlled_account: result[i].controlled_account, controlled_permission: result[i].controlled_permission,
          controlling_account: result[i].controlling_account, createdAt: result[i].createdAt
        });
      }
      console.log(result);
      db.close();
    });
    //aggregate({$group : {_id : "$block_num", max_transactions : {$sum : 1}}},{$group:{_id:null,max:{$max:"$max_transactions"}}})
    dbo.collection("transaction_traces").aggregate({ $group: { _id: "$block_num", max_transactions: { $sum: 1 } } },
      { $group: { _id: null, max: { $max: "$max_transactions" } } },
      function (err, result) {
        if (err) throw err;
        result.toArray(function (err, result) {
          if (err) throw err;
          console.log(result);
          if (result.length >= 1) {
            vktdatav.max_tps_num = result[0].max / 3;
            // [
            //   {
            //     "value": "/2000MAX",
            //     "url": ""
            //   }
            // ]
            vktdatav_maxtps = [
              {
                "value": "/" + result[0].max / 3 +"MAX",
                "url": ""
              }
            ];
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
  // const last1hPrice = ohlcvkteth[ohlcvkteth.length - 1].close; // 1h ago closing price
  // const last1dPrice = ohlcvkteth[ohlcvkteth.length - 2].close; // 1d ago closing price
  // const last1wPrice = ohlcvkteth[1].close; // 1w ago closing price
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
    vktkline_YMD = vktkline_date.getFullYear() + '-' +
      (vktkline_date.getMonth() + 1 < 10 ? '0' + (vktkline_date.getMonth() + 1) : vktkline_date.getMonth() + 1) + '-' +
      (vktkline_date.getDate() < 10 ? '0' + (vktkline_date.getDate()) : vktkline_date.getDate())
    // console.log(vktkline_date)
    vktdatav.vktusdlast7d.push({ 'price': ohlcethusd[i][4] * ohlcvkteth[i].close, 'date': vktkline_YMD });
    vktdatav_vktprice_list.push({ 'x': ohlcethusd[i][4] * ohlcvkteth[i].close, 'y': vktkline_YMD });
  }

  return vktdatav;
}

// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runExchange = async (rates) => {
  const currencies = JSON.parse(decodeRatesData(rates.minutely))
  vktdatav.usdcny = currencies.CNY
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
