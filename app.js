'use strict';
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
//const mockjs = require('express-mockjs');
const opn = require('opn');
const utils = require('./utils');
const r2 = require('r2');
// import ccxt
const ccxt = require('ccxt-vkt');
// import IP2Region
const IP2Region = require('ip2region');
const superagent = require('superagent');
const translate = require('translate-google-cn');
// 载入配置文件
const config = require('./config');
const fs = require('fs');
const moment = require('moment');
const async	= require('async');
const request = require('request');
const { Ut,ClientWasm } = require("./common");
const util = require('util');
const Hashids = require('hashids');
const RateLimit = require('express-rate-limit');
const trim = require('string.prototype.trim');
require('colors');
const chainWasm = new ClientWasm('./data/chain-client.wasm');
const tokenWasm = new ClientWasm('./data/token-client.wasm');
const redis = require("redis");
const redis_client = redis.createClient({ detect_buffers: true });
const { promisify } = require("util");
const getAsync = promisify(redis_client.get).bind(redis_client);
const setAsync = promisify(redis_client.set).bind(redis_client);
const keysAsync = promisify(redis_client.keys).bind(redis_client);
const delAsync = promisify(redis_client.del).bind(redis_client);

(async () => {
  try {
      fs.writeFileSync('chain_request_schema.json', JSON.stringify(chainWasm.describe_query_request(), null, 4));
      fs.writeFileSync('chain_response_schema.json', JSON.stringify(chainWasm.describe_query_response(), null, 4));
      fs.writeFileSync('token_request_schema.json', JSON.stringify(tokenWasm.describe_query_request(), null, 4));
      fs.writeFileSync('token_response_schema.json', JSON.stringify(tokenWasm.describe_query_response(), null, 4));
    } catch (e) {
      console.error(e);
    }
})();

const {
  Api,
  JsonRpc,
  RpcError,
} = require('vktjs');
const ecc = require("vktjs-ecc");
const fetch = require('node-fetch'); // node only; not needed in browsers
const {
  TextDecoder,
  TextEncoder
} = require('text-encoding'); // node, IE11 and IE Edge Browsers
const MongoClient = require('mongodb').MongoClient;
const MONGO_URL = config.MONGO_URL;
const VKTAPI_URL = config.VKTAPI_URL;
const BGAPI_URL = config.BGAPI_URL;
const XE_URL = config.XE_URL;
const SCATTER_API = config.SCATTER_API;
const HOTBIT_API = config.HOTBIT_API;
const defaultPrivateKey = config.defaultPrivateKey;
const candyPrivateKey = config.candyPrivateKey;

const http = require('http');
const https = require('https');
let privateKey  = fs.readFileSync('./data/server.key', 'utf8');
let certificate = fs.readFileSync('./data/server.crt', 'utf8');
let credentials = {key: privateKey, cert: certificate};

// 定时触发
const schedule = require('node-schedule');
const nodemailer = require('nodemailer');

// 服务器端口
let NODE_PORT = 3030;
var NODE_SSLPORT = 3033;

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
let vktdatav_vktoken_currencies = ["USD", "CNY", "KRW"];
let vktdatav_producer_now = {};
let vktdatav_producer_location = {};
let vktdatav_mproducer_location = {};
let vktdatav_bproducer_location = {};
let vktdatav_cnyusd_price = [];
let vktdatav_flyline = {};

let IsLoadingRPCBASE = false;
let IsLoadingRPCPRODUCER = false;
let IsLoadingRPCBlockList = false;
let accountid = "";

let m_maxtps = 0;
let m_maxtps_onehour = 0;

let m_lasttrxid = JSON.parse('[]');

const MAX_ELEMENTS 	= 1000;
const MAX_SKIP 		= config.maxSkip;

// 创建express
const app = express();

// const JsSignatureProvider = require('vktjs/dist/eosjs-jssig').default;
const { JsSignatureProvider } = require('vktjs/dist/eosjs-jssig'); // development only
const signatureProvider = new JsSignatureProvider([defaultPrivateKey,candyPrivateKey]);

const rpc = new JsonRpc(VKTAPI_URL, {
  fetch
});
const api = new Api({
  rpc,
  signatureProvider,
  textDecoder: new TextDecoder(),
  textEncoder: new TextEncoder()
});

let httpServer = http.createServer(app);
let httpsServer = https.createServer(credentials, app);

httpServer.listen(NODE_PORT, function() {
  console.log('HTTP Server is running on: http://localhost:%s', NODE_PORT);
});
httpsServer.listen(NODE_SSLPORT, function() {
  console.log('HTTPS Server is running on: https://localhost:%s', NODE_SSLPORT);
});

const createAccountLimiter = RateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 1 hour window
  max: 2, // start blocking after 5 requests
  skip: async(req, res) => {
    let signedIp = getNetIp(req);
    let skipFlag = false;
    await async.eachSeries(config.WHITELIST_IP_ARR,async(skip_ip, cb) =>{
      if(signedIp.includes(skip_ip)){skipFlag = true;}
    });
    return skipFlag;
  },
  // message:
    // "Too many accounts created from this IP, please try again after an hour"
  handler: function (req, res) { // 响应格式
    res.format({
        json: function () {
            res.status(429).json({code:429,message:'Too many accounts created from this IP, please try again after an hour.'});
        },
        html: function () {
            res.status(429).end('Too many accounts created from this IP, please try again after an hour.');
        }
    });
  }
});

const defaultLimiter = RateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 300, // start blocking after 5 requests
  skip: async(req, res) => {
    let signedIp = getNetIp(req);
    let skipFlag = false;
    await async.eachSeries(config.WHITELIST_IP_ARR,async(skip_ip, cb) =>{
      if(signedIp.includes(skip_ip)){skipFlag = true;}
    });
    return skipFlag;
  },
  // message:
    // "Too many requests from this IP, please try again after an hour"
  handler: function (req, res) { // 响应格式
    res.format({
        json: function () {
            res.status(429).json({code:429,message:'Too many requests from this IP, please try again after an hour.'});
        },
        html: function () {
            res.status(429).end('Too many requests from this IP, please try again after an hour.');
        }
    });
  }
});

// 路由android 用户信息
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json());
app.post('/api_oc_personal/v1.0.0/:path_param1', defaultLimiter, async (req, res) => {

  let path_param1 = req.params.path_param1;
  let auth = JSON.parse('{}');
  console.log(path_param1);
  console.log(req.body);
  if (path_param1 === "follow_list") {
    console.log('/api_oc_personal/v1.0.0/follow_list', req.body);
    auth.code = 0;
    auth.message = 'ok';
    auth.data = JSON.parse('[]');
    auth.data.push({
      uid: '13812345678',
      displayName: 'tokyoliyi123',
      avatar: 'http://worldartsme.com/images/avatar-lady-clipart-1.jpg',
      letter: 'v', //索引字母
      followType: '1' //1代表钱包2代表账号
    });
    auth.data.push({
      uid: '13812342678',
      displayName: '馨月',
      avatar: 'http://worldartsme.com/images/avatar-lady-clipart-1.jpg',
      letter: 'v', //索引字母
      followType: '1' //1代表钱包2代表账号
    });
    res.json(auth);
    return;
  } else if (path_param1 === "get_token_info") {
    console.log('/api_oc_personal/v1.0.0/get_token_info', req.body);
    let asset = JSON.parse('{}');
    asset.code = 0;
    asset.message = 'ok';
    asset.data = JSON.parse('[]');
    // let accountName = req.body.accountName;
    let accountNameArr = req.body.accountNameArr;
    // accountNameArr.forEach((accountName) =>{
    await async.eachSeries(accountNameArr,async(accountName, cb) =>{
      console.log(accountName);
      //获取账号xxxx的资产,查询资产的时候要加上资产的合约名字eosio.token
      const balances = await rpc.get_currency_balance('eosio.token', accountName);
      console.log(balances);

      if(balances.length === 0){
        balances.push("0.0000 VKT");
      }

      let vkt_balance = '';
      for (let i in balances) {
        let balarr = balances[i].split(" ");
        if (balarr[1] === "VKT") {
          vkt_balance = balarr[0];
        }
      }

      const lockedbalance = await rpc.get_table_rows({
        json: true,              // Get the response as json
        code: 'eosio.token',     // Contract that we target
        scope: accountName,         // Account that owns the data
        table: 'locked',        // Table name
        limit: 10,               // maximum number of rows that we want to get
        reverse: true,
      });
    
      console.log(lockedbalance)
    
      let amountlocked = 0.0;
      try{
        let balarr = balances[0].split(" ");
        if(balarr[1] === "VKT" && lockedbalance.rows.length > 0){
          amountlocked = lockedbalance.rows[0].total_balance.split(' ')[0];
        }
      } catch (error) {
        amountlocked = 0.0;
      }

      asset.data.push(
        {
          contract_name: "eosio.token",
          token_symbol: "VKT",
          coinmarket_id: "hotbit",
          account_name: accountName,
          balance: vkt_balance,
          locked_amount: amountlocked,
          balance_usd: vkt_balance * vktdatav_allprices["vkt:eosio.token:vkt"].USD,
          balance_cny: vkt_balance * vktdatav_allprices["vkt:eosio.token:vkt"].CNY,
          balance_krw: vkt_balance * vktdatav_allprices["vkt:eosio.token:vkt"].KRW,
          asset_price_usd: vktdatav_allprices["vkt:eosio.token:vkt"].USD,
          asset_price_cny: vktdatav_allprices["vkt:eosio.token:vkt"].CNY,
          asset_price_krw: vktdatav_allprices["vkt:eosio.token:vkt"].KRW,
          asset_price_change_in_24h: (vktdatav_vkttracker_info.percent_change_1d * 100.0).toFixed(2),
          iconUrl: "http://dapi.vankia.io/images/logo_van_green.png",
          iconUrlHd: "http://dapi.vankia.io/images/logo_van_green@3x.png",
          asset_market_cap_cny: vkt_balance * vktdatav_allprices["vkt:eosio.token:vkt"].CNY * 500000000,
          isRedpacket: true
        }
      );
    }, 
    (err) =>
    {
      res.json(asset);
    });
    
    // asset.data.push(
    //   {
    //     contract_name: "token",
    //     token_symbol: "ETH",
    //     coinmarket_id: "Ethereum",
    //     account_name: accountName,
    //     balance: vkt_balance,
    //     balance_usd: vkt_balance * vktdatav_allprices["eth:eth:eth"].USD,
    //     balance_cny: vkt_balance * vktdatav_allprices["eth:eth:eth"].CNY,
    //     asset_price_usd: vktdatav_allprices["eth:eth:eth"].USD,
    //     asset_price_cny: vktdatav_allprices["eth:eth:eth"].CNY,
    //     asset_price_change_in_24h: (vktdatav_vkttracker_info.percent_change_1d * 100.0).toFixed(2),
    //     iconUrl: "http://tracker.devicexx.com/assets/logo.png",
    //     iconUrlHd: "http://tracker.devicexx.com/assets/logo.png",
    //     asset_market_cap_cny: vkt_balance * vktdatav_allprices["vkt:eosio.token:vkt"].CNY * 500000000,
    //     isRedpacket: true
    //   }
    // );
    //TODO
  } else if (path_param1 === "get_all_accounts_token") {
    console.log('/api_oc_personal/v1.0.0/get_all_accounts_token', req.body);
    let snapshot_block = ["head", 0];
    let first_account = "";
    let last_account = "zzzzzzzzzzzzj";
    let assets = JSON.parse('{}');
    assets.code = 0;
    assets.message = 'ok';
    assets.data = JSON.parse('[]');
    do {
        const reply = await tokenWasm.round_trip(['bal.mult.acc', {
            snapshot_block,
            code: 'eosio.token',
            sym: 'VKT',
            first_account: first_account,
            last_account: last_account,
            max_results: 100,
        }]);
        for (let balance of reply[1].balances){
          assets.data.push({
            account: balance.account,
            amount: format_extended_asset(balance.amount),
          });
          console.log(balance.account.padEnd(13, ' '), format_extended_asset(balance.amount));
        }
        first_account = reply[1].more;
    } while (first_account);
    res.json(assets);
  } else if (path_param1 === "import_accounts") {
    console.log('/api_oc_personal/v1.0.0/import_accounts', req.body);
    let import_accounts = JSON.parse('{}');
    import_accounts.code = 0;
    import_accounts.message = 'ok';
    import_accounts.data = JSON.parse('[]');
    import_accounts.data.push({
      uid: '13889365325',
      name: 'vankiauser1',
      avatar: '#',
      letter: 'v', //索引字母
      friend_type: '1' //1代表钱包2代表账号
    });
    res.json(import_accounts);
    return;
  } else if (path_param1 === "get_asset_token") {
    console.log('/api_oc_personal/v1.0.0/get_asset_token', req.body);
    let assets = JSON.parse('{}');
    assets.code = 0;
    assets.message = 'ok';
    assets.data = JSON.parse('{}');
    assets.data.assetCategoryList = JSON.parse('[]');
    assets.data.assetCategoryList.push(
      {
        tokenInfo:{
          id:'01',
          assetName: 'VKT',
          contractName: 'eosio.token',
          coinmarketId: 'bitforex',
          iconUrl: 'http://explorer.vankia.io/assets/logo.png',
          iconUrlHd: 'http://explorer.vankia.io/assets/logo.png',
        },
        isFollow:true
      }
    );
    assets.data.assetCategoryList.push(
      {
        tokenInfo:{
          id:'02',
          assetName: 'ETH',
          contractName: 'token',
          coinmarketId: 'bitforex',
          iconUrl: 'http://icons.iconarchive.com/icons/cjdowner/cryptocurrency-flat/128/Ethereum-ETH-icon.png',
          iconUrlHd: 'http://icons.iconarchive.com/icons/cjdowner/cryptocurrency-flat/512/Ethereum-ETH-icon.png',
        },
        isFollow:false
      }
    );
    assets.data.followAssetIds = JSON.parse('[]');
    assets.data.assetCategoryList.push('VKT');
    assets.data.assetCategoryList.push('ETH');
    console.log(util.inspect(assets, false, null, true));
    res.json(assets);
    return;
  } else if (path_param1 === "news_list") {
    console.log('/api_oc_personal/v1.0.0/news_list', req.body);
    let news_list = JSON.parse('{}');
    news_list.code = 0;
    news_list.message = 'ok';
    news_list.data = JSON.parse('[]');
    news_list.data.push({
      id: '1',
      title: '武景刚：物联网要选择合适的技术',
      summary: '武景刚：物联网要选择合适的技术',
      scope:'1',
      assetCategoryId: '1',
      imageUrl:'https://i1.7234.cn/system/redactor_assets/pictures_3/000/214/895/214895/2018/513cc6ade80674529d1c0fe224bf8edf.jpeg',
      newsUrl:'http://www.cneo.com.cn/article-80121-1.html',
      publisher:'企业观察网',
      status:'released',
      releaseTime:'2018-06-26 09:39:00',
      createTime:'2018-06-26 09:39:00',
      updateTime:'2018-06-26 09:39:00'
    });
    res.json(news_list);
    return;
  } else if (path_param1 === "isFollowRecord") {
    console.log('/api_oc_personal/v1.0.0/isFollowRecord', req.body);
    let followRecord = JSON.parse('{}');
    followRecord.code = 0;
    followRecord.message = 'ok';
    followRecord.data = 'true';
    
    res.json(followRecord);
    return;
  } 
  
});


// 路由android 用户信息
app.post('/api_oc_personal/v1.0.0/user/add_new_vkt', createAccountLimiter, async (req, res) => {
  console.log('/api_oc_personal/v1.0.0/user/add_new_vkt -- OK', req.body);
  let auth = JSON.parse('{}');
  let pubkeyactive = req.body.activeKey;
  let pubkeyowner = req.body.ownerKey;
  let actname = trim(req.body.vktAccountName);
  let inviteCode = "";

  await validataInviteCode()

  async function validataInviteCode() {
      if(req.body.InvitationCode != undefined && req.body.InvitationCode != ""){
        inviteCode = trim(req.body.InvitationCode);

        // make client connect to mongo service
        await MongoClient.connect(MONGO_URL,  { useNewUrlParser: true }, async function(err, db) {
          if (err) {
            console.error(err);
            return res.status(500).end();
          }

          const dbo = db.db("VKT");

          // db pointing to newdb
          console.log("Switched to "+dbo.databaseName+" database");

          // 检查邀请码是否存在
          let query_invite_code = {
            "inviteCode": { $eq: inviteCode }
          }
          console.log(query_invite_code);

          await dbo.collection("InviteCode").find(query_invite_code).toArray(async function (err, result) {
            if (err) throw err;
            console.log(result)
            if (result.length < 1) {
              auth.code = 403;
              auth.message = 'The invitation code is invalid. Please re-enter.';
              res.json(auth);
              console.log("InviteCode is invalid!!!")
              setTimeout(function(){
                db.close();
              },50)
            }else{
              console.log("InviteCode is valid!");
              setTimeout(function(){
                db.close();
              },50)
              await validatePublicKey()
            }
          });
        });
      }else{
        await validatePublicKey();
      }
    }
    async function validatePublicKey(){
      // make client connect to mongo service
      await MongoClient.connect(MONGO_URL, { useNewUrlParser: true }, async function(err, db) {
        if (err) {
          console.error(err);
          return res.status(500).end();
        }
        const dbo = db.db("VKT");

        // db pointing to newdb
        console.log("Switched to "+dbo.databaseName+" database");

        // 检查重复公钥注册
        let query = {
          "public_key": { $eq: pubkeyactive }
        }
        console.log(query);

        await dbo.collection("pub_keys").find(query).toArray(async function (err, result) {
          if (err) throw err;
          if (result.length > 0) {
            console.log("pub_keys is exsit!");
            auth.code = 401;
            auth.message = 'Failed to create account.';
            res.json(auth);
            setTimeout(function(){
              db.close();
            },50)
          }else{
            console.log("pub_keys is valid!");
            setTimeout(function(){
              db.close();
            },50)
            await createAccount();
          }
        });
      });
    }
    async function createAccount() {
      auth.code = 0;
      auth.message = 'ok';
      if (!Ut.isEmpty(String(pubkeyowner)) && !Ut.isEmpty(String(pubkeyactive)) &&
        !Ut.isEmpty(String(req.body.uid)) && !Ut.isEmpty(String(actname)) &&
        pubkeyowner.substring(0,3) === 'VKT' &&
        pubkeyactive.substring(0,3) === 'VKT' &&
        pubkeyowner.length === 53 &&
        pubkeyactive.length === 53) {
        console.log('Public Key:\t', pubkeyactive) // VKTkey...
        let checkpubkeyactive = ecc.isValidPublic(pubkeyactive, 'VKT');
        console.log('/api_oc_personal/v1.0.0/user/add_new_vkt - checkpubkeyactive=', checkpubkeyactive);
        let checkpubkeyowner = ecc.isValidPublic(pubkeyowner, 'VKT');
        console.log('/api_oc_personal/v1.0.0/user/add_new_vkt - checkpubkeyowner=', checkpubkeyowner);

        if(!checkpubkeyactive || !checkpubkeyowner){
          auth.code = 400;
          auth.message = 'Failed to create account.';
          res.json(auth);
        }

        try {
          const result = await api.transact({
            actions: [{
                account: 'eosio',
                name: 'newaccount',
                authorization: [{
                  actor: 'createaccout',
                  permission: 'active',
                }],
                data: {
                  creator: 'createaccout',
                  name: actname,
                  owner: {
                    threshold: 1,
                    keys: [{
                      key: pubkeyowner,
                      weight: 1
                    }],
                    accounts: [],
                    waits: []
                  },
                  active: {
                    threshold: 1,
                    keys: [{
                      key: pubkeyactive,
                      weight: 1
                    }],
                    accounts: [],
                    waits: []
                  },
                },
              },
              {
                account: 'eosio',
                name: 'buyrambytes',
                authorization: [{
                  actor: 'createaccout',
                  permission: 'active',
                }],
                data: {
                  payer: 'createaccout',
                  receiver: actname,
                  bytes: 8192,
                },
              },
              {
                account: 'eosio',
                name: 'delegatebw',
                authorization: [{
                  actor: 'createaccout',
                  permission: 'active',
                }],
                data: {
                  from: 'createaccout',
                  receiver: actname,
                  stake_net_quantity: '0.1500 VKT',
                  stake_cpu_quantity: '0.5000 VKT',
                  transfer: false,
                }
              }
            ]
          }, {
            blocksBehind: 3,
            expireSeconds: 30,
          });
          console.log("newaccount result = ", result);
        } catch (error) {
          auth.code = 500;
          auth.message = 'Failed to create account.';
          console.log(error);
        }
        res.json(auth);
      } else {
        auth.code = 501;
        auth.message = 'Failed to create account.';
        res.json(auth);
      }
      addusertoMG(actname,getNetIp(req),inviteCode)
    }
});

// 路由android 用户信息
app.post('/api_oc_personal/v1.0.0/:path_param1/:path_param2', async (req, res) => {

  let path_param1 = req.params.path_param1;
  let path_param2 = req.params.path_param2;

  console.log(path_param1);
  console.log(path_param2);
  console.log(req.body);
  if (path_param1 === "message") {
    if (path_param2 == "auth") {
      console.log('/api_oc_personal/v1.0.0/message/auth', req.body);
      let auth = JSON.parse('{}');
      auth.code = 0;
      auth.message = 'ok';
      auth.data = JSON.parse('{}');
      auth.data.uid = req.body.phoneNum;
      auth.data.wallet_uid = req.body.phoneNum;
      auth.data.wallet_avatar = "#";
      auth.data.wallet_weixin = req.body.phoneNum;
      auth.data.wallet_qq = req.body.phoneNum;
      res.json(auth);
      return;
    }
  }else if (path_param1 === "user") {
    if (path_param2 === "add_new_vkt") {
      console.log('/api_oc_personal/v1.0.0/user/add_new_vkt -- delete api !!!', req.body);
      
      return;
    }
    if (path_param2 === "upload_access_info") {
      console.log('/api_oc_personal/v1.0.0/user/upload_access_info', req.body);
      let upload_access_info = JSON.parse('{}');
      upload_access_info.code = 0;
      upload_access_info.message = 'ok';
      upload_access_info.data = JSON.parse('{}');
      upload_access_info.data.uid=req.body.uid;

      const ipquery = new IP2Region();
      let lastLoginIp = getNetIp(req);
      let ipres = ipquery.search(lastLoginIp);
      let bm_upload_access_info = JSON.parse('{}');
      bm_upload_access_info.accountName = req.body.uid;
      bm_upload_access_info.lastLoginIp = lastLoginIp;
      bm_upload_access_info.lastLoginPlace = ipres.country + " - " + ipres.province + " - " + ipres.city + " - " + ipres.isp;
      bm_upload_access_info.os = req.body.os;
      bm_upload_access_info.did = req.body.did;

      console.log(bm_upload_access_info)
      request.post({
        url: BGAPI_URL+'/walletUser/login',
        json: bm_upload_access_info
      }, 
      (error, res2, body) => {
        if (error) {
          console.error(error)
          return true
        }
        console.log(body)
        if(body.code == -1){
          addusertoMG(req.body.uid,getNetIp(req),'');
        }
      })

      await saveLoginLogs(req.body.uid, lastLoginIp, ipres.country + " - " + ipres.province + " - " + ipres.city);

      res.json(upload_access_info);
      return;
    }
    if (path_param2 === "validata_invitecode") {
      console.log('/api_oc_personal/v1.0.0/user/validata_invitecode', req.body);
      let inviteCode = "";
      let auth = JSON.parse('{}');

      await validataInviteCode();

      async function validataInviteCode() {
        if(req.body.InvitationCode != undefined && req.body.InvitationCode != ""){
          inviteCode = trim(req.body.InvitationCode);
  
          // make client connect to mongo service
          await MongoClient.connect(MONGO_URL,  { useNewUrlParser: true }, async function(err, db) {
            if (err) {
              console.error(err);
              return res.status(500).end();
            }
  
            const dbo = db.db("VKT");
  
            // db pointing to newdb
            console.log("Switched to "+dbo.databaseName+" database");
  
            // 检查邀请码是否存在
            let query_invite_code = {
              "inviteCode": { $eq: inviteCode }
            }
            console.log(query_invite_code);
  
            await dbo.collection("InviteCode").find(query_invite_code).toArray(async function (err, result) {
              if (err) throw err;
              console.log(result)
              if (result.length < 1) {
                auth.code = 403;
                auth.message = 'The invitation code is invalid. Please re-enter.';
                res.json(auth);
                console.log("InviteCode is invalid!!!")
                setTimeout(function(){
                  db.close();
                },50)
              }else{
                console.log("InviteCode is valid!");
                auth.code = 0;
                auth.message = 'ok';
                res.json(auth);
                setTimeout(function(){
                  db.close();
                },50)
              }
            });
          });
        }
      }
    }
    //user info and icon
    if (path_param2 === "get_user") {
      console.log('/api_oc_personal/v1.0.0/user/get_user', req.body);
      let userinfo = JSON.parse('{}');
      userinfo.code = 0;
      userinfo.message = 'ok';
      userinfo.data = JSON.parse('{}');
      userinfo.data.uid=13889365325;
      userinfo.data.walletName = 'tokyoliyi';
      userinfo.data.avatar = 'https://avatarfiles.alphacoders.com/155/155894.jpg';
      userinfo.data.phoneNum = '13889365325';
      userinfo.data.wechat = '1389365325';
      userinfo.data.qq = 8760358;
      res.json(userinfo);
      return;
    }
    if (path_param2 === "toggleVktMain") {
      console.log('/api_oc_personal/v1.0.0/user/toggleVktMain', req.body);
      let msgs = JSON.parse('{}');
      msgs.code = 0;
      msgs.message = 'ok';
      msgs.data = 'YES';
      res.json(msgs);
      return;
    }
    if (path_param2 === "getVktAccount") {
      console.log('/api_oc_personal/v1.0.0/user/getVktAccount', req.body);
      let account = JSON.parse('{}');
      account.code = 0;
      account.message = 'success';
      account.data = 'tokyoliyi123';
      
      res.json(account);
      return;
    }
    if(path_param2 === "get_infoFeedback") {
      console.log('/api_oc_personal/v1.0.0/user/get_infoFeedback', req.body);
      let feedbackinfo = JSON.parse('{}');

      feedbackinfo.code = 0;
      feedbackinfo.message = 'ok';
      feedbackinfo.data = JSON.parse('[]');
      feedbackinfo.data.push({
        uid:'tokyoliyi',
        content:'软件不会用？',
        comment:"看说明",
        status:"完结"
      });
      feedbackinfo.data.push({
        uid:'tokyoliyi',
        content:'软件怎么转账？',
        comment:"看说明",
        status:"完结"
      });

      console.log(feedbackinfo);
      res.json(feedbackinfo);
    } else if(path_param2 === "add_infoFeedback") {
      console.log('/api_oc_personal/v1.0.0/user/add_infoFeedback', req.body);
      let add_infoFeedback = JSON.parse('{}');

      add_infoFeedback.code = 0;
      add_infoFeedback.message = 'ok';
      add_infoFeedback.data = JSON.parse('{}');

      console.log(add_infoFeedback);
      res.json(add_infoFeedback);
    }

  } else if (path_param1 === "msg") {
    if (path_param2 === "getMagList") {
      console.log('/api_oc_personal/v1.0.0/msg/GetMagList', req.body);
      let msgs = JSON.parse('{}');
      msgs.code = 0;
      msgs.message = 'ok';
      msgs.data = JSON.parse('[]');
      msgs.data.push({title:'test title 1',
      summary:'软件还在测试中...',
      createTime:moment().format("MM/DD"), 
      updateTime:moment().format("MM/DD")});
      msgs.data.push({title:'test title 2',
      summary:'软件还在测试中...',
      createTime:moment().format("MM/DD"), 
      updateTime:moment().format("MM/DD")});
      res.json(msgs);
      return;
    }
    if (path_param2 === "hasUnreadMsg") {
      console.log('/api_oc_personal/v1.0.0/msg/hasUnreadMsg', req.body);
      let msgs = JSON.parse('{}');
      msgs.code = 0;
      msgs.message = 'ok';
      msgs.data = JSON.parse('{}');
      msgs.data.unreadMsg = '1';
      res.json(msgs);
      return;
    }
  }

});

// 路由scatter 多语言数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/api_oc_personal/v1.0.0/:path_param1', defaultLimiter, async (req, res) => {

  let path_param1 = req.params.path_param1;

  if (path_param1 === "is_open_timeLimitRegister") {
    console.log('/api_oc_personal/v1.0.0/is_open_timeLimitRegister', req.body);
    let is_open = JSON.parse('{}');

    // 获取账号qingzhudatac的信息
    // const chaininfo = await rpc.get_info();
    // console.log(chaininfo);
    is_open.code = 0;
    is_open.message = 'ok';
    is_open.data = 'YES';
    res.json(is_open);
  } else if (path_param1 === "get_last_info") {
    console.log('/api_oc_personal/v1.0.0/get_last_info', req.body);
    let ios_version = JSON.parse('{}');
    
    ios_version.code = 0;
    ios_version.message = 'ok';
    ios_version.data = JSON.parse('{}');
    ios_version.data.uploadUrl = 'http://wapi.devicexx.com:3030/upgrade/umeng/VKToken_umeng_release.apk';
    ios_version.data.versionDetail = '1.0.0'
    ios_version.data.versionCode = '100'
    ios_version.data.versionName = '1.0.0'
    ios_version.data.versionDescription = ['1.新增xxx功能','2.修改了xxx，修复若干bug','3.修改了xxx，修复若干bug','4.新增xxx功能']
    console.log(ios_version);
    res.json(ios_version);
  } else if (path_param1 === "get_last_info_ios") {
    console.log('/api_oc_personal/v1.0.0/get_last_info_ios', req.body);
    let ios_version = JSON.parse('{}');
    
    ios_version.code = 0;
    ios_version.message = 'ok';
    ios_version.data = JSON.parse('{}');
    ios_version.data.uploadUrl = 'https://testflight.apple.com/join/g01bXkTX';
    ios_version.data.versionDetail = '2.0.1'
    ios_version.data.versionCode = '201'
    ios_version.data.versionName = '2.0.1'
    ios_version.data.forceFlg = '0'
    ios_version.data.versionDescription = ['1.新增xxx功能','2.修改了xxx，修复若干bug','3.修改了xxx，修复若干bug','4.新增xxx功能']
    console.log(ios_version);
    res.json(ios_version);
  } else if (path_param1 === "recommend_dapp") {
    console.log('/api_oc_personal/v1.0.0/recommend_dapp', req.body);
    let recommend_dapp = JSON.parse('{}');

    recommend_dapp.code = 0;
    recommend_dapp.message = 'ok';
    recommend_dapp.data = JSON.parse('{}');
    recommend_dapp.data.bannerDapps = JSON.parse('[]');
    recommend_dapp.data.bannerDapps.push({
      dapp_id:'1',
      dappName:'清竹大数据1',
      dappIntro:'数据确权，数据溯源',
      dappIcon:'https://www.gemalto.com/iot-site/PublishingImages/inspired-iot-modules-banner.jpg?RenditionID=1',
      dappPicture:'https://www.gemalto.com/iot-site/PublishingImages/inspired-iot-modules-banner.jpg?RenditionID=1',
      dappUrl:'http://182.92.72.34:8081',
      status:'released',
      introReason:'good',
      dappCategoryName:'1',
      txtColor:'red',
      tagColor:'red'
    });
    recommend_dapp.data.bannerDapps.push({
      dapp_id:'2',
      dappName:'清竹大数据2',
      dappIntro:'数据确权，数据溯源',
      dappIcon:'https://www.simplilearn.com/ice9/free_resources_article_thumb/Data-Science-vs.-Big-Data-vs.jpg',
      dappPicture:'https://www.simplilearn.com/ice9/free_resources_article_thumb/Data-Science-vs.-Big-Data-vs.jpg',
      dappUrl:'http://182.92.72.34:8081',
      status:'released',
      introReason:'good',
      dappCategoryName:'1',
      txtColor:'red',
      tagColor:'red'
    });
    recommend_dapp.data.introDapps = JSON.parse('[]');
    recommend_dapp.data.introDapps.push({
      dapp_id:'1',
      dappName:'清竹大数据',
      dappIntro:'数据确权，数据溯源',
      dappIcon:'https://5b0988e595225.cdn.sohucs.com/a_auto,c_cut,x_14,y_8,w_386,h_386/images/20180329/f3f82468cf734c0db09ea978801db4f2.jpeg',
      dappPicture:'https://5b0988e595225.cdn.sohucs.com/a_auto,c_cut,x_14,y_8,w_386,h_386/images/20180329/f3f82468cf734c0db09ea978801db4f2.jpeg',
      dappUrl:'http://182.92.72.34:8081',
      status:'released',
      introReason:'good',
      dappCategoryName:'2',
      txtColor:'red',
      tagColor:'red'
    });
    recommend_dapp.data.introDapps.push({
      dapp_id:'2',
      dappName:'预言家',
      dappIntro:'预测大盘，谁是预言家',
      dappIcon:'http://icons.iconarchive.com/icons/hadezign/hobbies/128/Magic-icon.png',
      dappPicture:'http://icons.iconarchive.com/icons/hadezign/hobbies/128/Magic-icon.png',
      dappUrl:'http://182.92.72.34:8081',
      status:'released',
      introReason:'good',
      dappCategoryName:'3',
      txtColor:'red',
      tagColor:'red'
    });
    recommend_dapp.data.starDapps = JSON.parse('[]');
    recommend_dapp.data.starDapps.push({
      dapp_id:'3',
      dappName:'清竹大数据',
      dappIntro:'数据确权，数据溯源',
      dappIcon:'https://precise.seas.upenn.edu/content/images/research/domain/banner/banner_iot_r3.png',
      dappPicture:'https://precise.seas.upenn.edu/content/images/research/domain/banner/banner_iot_r3.png',
      dappUrl:'http://182.92.72.34:8081',
      status:'released',
      introReason:'good',
      dappCategoryName:'3',
      txtColor:'red',
      tagColor:'red'
    });
    res.json(recommend_dapp);
  } else if (path_param1 === "category_config") {
    console.log('/api_oc_personal/v1.0.0/category_config', req.body);
    let category = JSON.parse('{}');
    
    category.code = 0;
    category.message = 'ok';
    category.data = JSON.parse('[]');
    category.data.push({
      id:'1',
      dappCategoryName:'数据确权类'
    });
    category.data.push({
      id:'2',
      dappCategoryName:'游戏类'
    });
    console.log(category);
    res.json(category);
  } else if (path_param1 === "get_dapp_by_config_id") {
    console.log('/api_oc_personal/v1.0.0/get_dapp_by_config_id?id=', req.query.id);
    let dapp = JSON.parse('{}');
    
    dapp.code = 0;
    dapp.message = 'ok';
    dapp.data = JSON.parse('[]');
    if(req.query.id === '1') {
      dapp.data.push({
        dapp_id:'1',
        dappName:'清竹大数据',
        dappIntro:'数据确权，数据溯源',
        dappIcon:'https://5b0988e595225.cdn.sohucs.com/a_auto,c_cut,x_14,y_8,w_386,h_386/images/20180329/f3f82468cf734c0db09ea978801db4f2.jpeg',
        dappPicture:'https://5b0988e595225.cdn.sohucs.com/a_auto,c_cut,x_14,y_8,w_386,h_386/images/20180329/f3f82468cf734c0db09ea978801db4f2.jpeg',
        dappUrl:'http://182.92.72.34:8081',
        status:'released',
        introReason:'good',
        dappCategoryName:'3',
        txtColor:'red',
        tagColor:'red'
      });
    }else if(req.query.id === '2'){
      dapp.data.push({
        dapp_id:'1',
        dappName:'预言家',
        dappIntro:'预测大盘，谁是预言家',
        dappIcon:'http://icons.iconarchive.com/icons/hadezign/hobbies/128/Magic-icon.png',
        dappPicture:'http://icons.iconarchive.com/icons/hadezign/hobbies/128/Magic-icon.png',
        dappUrl:'http://182.92.72.34:8081',
        status:'released',
        introReason:'good',
        dappCategoryName:'3',
        txtColor:'red',
        tagColor:'red'
      });
    }
    console.log(dapp);
    res.json(dapp);
    //新闻分类
  } else if (path_param1 === "getAssetCategoryAll") {
    console.log('/api_oc_personal/v1.0.0/getAssetCategoryAll', req.query);
    let assetCategory = JSON.parse('{}');
    
    assetCategory.code = 0;
    assetCategory.message = 'ok';
    assetCategory.data = JSON.parse('[]');
    assetCategory.data.push({
      id:'1',
      assetName: '最新热点',
      selected: true
    });
    assetCategory.data.push({
      id:'2',
      assetName: '行业资讯',
      selected: true
    });
    assetCategory.data.push({
      id:'3',
      assetName: '万加动态',
      selected: true
    });
    console.log(assetCategory);
    res.json(assetCategory);
  } else if (path_param1 === "get_VKToken_info") {
    console.log('/api_oc_personal/v1.0.0/get_VKToken_info?language=', req.query.language);
    let VKToken_info = JSON.parse('{}');
    VKToken_info.code = 0;
    VKToken_info.message = 'ok';
    VKToken_info.data = JSON.parse('{}');
    let language = req.query.language;
    if(language === "en"){
      VKToken_info.data.weChatOfficialAccount = 'Vankia';
      VKToken_info.data.weChat = 'vankia_asst';
      VKToken_info.data.officiaWebsite = 'http://www.vankia.net';
      VKToken_info.data.companyProfile = 'Vankia Chain is the third generation of Internet of Things based on blockchain technology. It is a public chain in the field of Internet of Things. It aims to provide intelligent transformation programs for small and medium-sized manufacturing enterprises. After years of research and development, Wanjia Chain has accumulated strong technical strength. In 2018, it submitted 10 patent applications for fog calculation and blockchain.';
    }else{
      VKToken_info.data.weChatOfficialAccount = '万加物联';
      VKToken_info.data.weChat = 'vankia_asst';
      VKToken_info.data.officiaWebsite = 'http://www.vankia.net';
      VKToken_info.data.companyProfile = 'VANKIA万加链是基于区块链技术的第三代物联网，是一条物联网领域的公链，旨在为中小制造业企业提供产品智能化改造方案。万加链经过多年的研发，积累了很强的技术实力，2018年提交了10项雾计算和区块链的专利申请。';
    }
    console.log(VKToken_info);
    res.json(VKToken_info);
  }
});

// 路由android blockchain信息
app.post('/api_oc_blockchain-v1.0.0/:path_param1', defaultLimiter, async (req, res) => {

  let path_param1 = req.params.path_param1;

  console.log(path_param1);
  console.log(req.body);
  if (path_param1 === "get_account") {
    console.log('/api_oc_blockchain-v1.0.0/get_account', req.body);

    let auth = JSON.parse('{}');
    // 获取账号qingzhudatac的信息
    try {
      const accountInfo = await rpc.get_account(req.body.name);
      console.log(accountInfo);
      auth.code = 0;
      auth.message = 'ok';
      auth.data = accountInfo;
    } catch (error) {
      auth.code = 0;
      auth.message = 'The account '+ req.body.name +' was not found.';
      auth.data = JSON.parse('{}');
    }
    res.json(auth);

  } else if (path_param1 === "get_account_asset") {
    console.log('/api_oc_blockchain-v1.0.0/get_account_asset', req.body);
    let asset = JSON.parse('{}');

    let accountName = req.body.name;

    //获取账号xxxx的资产,查询资产的时候要加上资产的合约名字eosio.token
    const balances = await rpc.get_currency_balance('eosio.token', accountName);
    console.log(balances);
    if(balances.length === 0){
      balances.push("0.0000 VKT");
    }

    let vkt_balance = 0;
    for (let i in balances) {
      let balarr = balances[i].split(" ");
      if (balarr[1] === "VKT") {
        vkt_balance = balarr[0];
      }
    }

    const lockedbalance = await rpc.get_table_rows({
      json: true,              // Get the response as json
      code: 'eosio.token',     // Contract that we target
      scope: accountName,         // Account that owns the data
      table: 'locked',        // Table name
      limit: 10,               // maximum number of rows that we want to get
      reverse: true,
    });
  
    console.log(lockedbalance)
  
    let amountlocked = 0.0;
    try{
      let balarr = balances[0].split(" ");
      if(balarr[1] === "VKT" && lockedbalance.rows.length > 0){
        amountlocked = lockedbalance.rows[0].total_balance.split(' ')[0];
      }
    } catch (error) {
      amountlocked = 0.0;
    }

    asset.code = 0;
    asset.message = 'ok';
    asset.data = {
      account_name: accountName,
      account_icon: 'http://www.vankia.io',
      vkt_balance: vkt_balance,
      vkt_balance_locked: amountlocked,
      vkt_balance_usd: vkt_balance * vktdatav_allprices["vkt:eosio.token:vkt"].USD,
      vkt_balance_cny: vkt_balance * vktdatav_allprices["vkt:eosio.token:vkt"].CNY,
      vkt_price_usd: vktdatav_allprices["vkt:eosio.token:vkt"].USD,
      vkt_price_cny: vktdatav_allprices["vkt:eosio.token:vkt"].CNY,
      vkt_price_change_in_24h: (vktdatav_vkttracker_info.percent_change_1d * 100.0).toFixed(2),
      vkt_market_cap_usd: vkt_balance * vktdatav_allprices["vkt:eosio.token:vkt"].USD * 500000000,
      vkt_market_cap_cny: vkt_balance * vktdatav_allprices["vkt:eosio.token:vkt"].CNY * 500000000,
      oct_balance: '0.00020000',
      oct_balance_usd: '0.00008678',
      oct_balance_cny: '0.00055036',
      oct_price_usd: '0.433908',
      oct_price_cny: '2.7518011452',
      oct_price_change_in_24h: '-6.63',
      oct_market_cap_usd: '13017240.0',
      oct_market_cap_cny: '82554034.0'
    };

    res.json(asset);
  } else if (path_param1 === "get_rate") {
    console.log('/api_oc_blockchain-v1.0.0/get_rate', req.body);
    let asset = JSON.parse('{}');

    // data : {"id":"vkt","price_usd":"9.45208","price_cny":"59.586384924","percent_change_24h":"12.31"}
    asset.code = 0;
    asset.message = 'ok';
    asset.data = {
      id: req.body.coinmarket_id,
      price_usd: vktdatav_allprices["vkt:eosio.token:vkt"].USD,
      price_cny: vktdatav_allprices["vkt:eosio.token:vkt"].CNY,
      percent_change_24h: (vktdatav_vkttracker_info.percent_change_1d * 100.0).toFixed(2)
    };

    res.json(asset);
  } else if (path_param1 === "abi_json_to_bin") {
    console.log('/api_oc_blockchain-v1.0.0/abi_json_to_bin', req.body);
    let abibin_info = JSON.parse('{}');

    request.post({
      url: VKTAPI_URL+'/v1/chain/abi_json_to_bin',
      form: JSON.stringify(req.body)
    }, 
    (error, res2, body) => {
      if (error) {
        console.error(error)
        return
      }
      console.log(body)
      abibin_info.code = 0;
      abibin_info.message = 'ok';
      abibin_info.data = JSON.parse(body);
      res.json(abibin_info);
    })
  } else if (path_param1 === "get_required_keys") {
    console.log('/api_oc_blockchain-v1.0.0/get_required_keys', req.body);
    let required_keys = JSON.parse('{}');

    request.post({
      url: VKTAPI_URL+'/v1/chain/get_required_keys',
      form: JSON.stringify(req.body)
    }, 
    (error, res2, body) => {
      if (error) {
        console.error(error)
        return
      }
      console.log(body)
      required_keys.code = 0;
      required_keys.message = 'ok';
      required_keys.data = JSON.parse(body);
      res.json(required_keys);
    })
  } else if (path_param1 === "push_transaction") {
    console.log('/api_oc_blockchain-v1.0.0/push_transaction', req.body);
    let transaction = JSON.parse('{}');

    request.post({
      url: VKTAPI_URL+'/v1/chain/push_transaction',
      form: JSON.stringify(req.body)
    }, 
    (error, res2, body) => {
      if (error) {
        console.error(error)
        return
      }
      console.log(body);
      transaction.code = 0;
      transaction.message = 'ok';
      transaction.data = JSON.parse(body);
      res.json(transaction);
    })
  } else if (path_param1 === "get_key_accounts") {
    console.log('/api_oc_blockchain-v1.0.0/get_key_accounts', req.body);
    let accounts = JSON.parse('{}');

    request.post({
      url: VKTAPI_URL+'/v1/history/get_key_accounts',
      form: JSON.stringify(req.body)
    }, 
    (error, res2, body) => {
      if (error) {
        console.error(error)
        return
      }
      console.log(body);
      accounts.code = 0;
      accounts.message = "ok";
      accounts.data = JSON.parse(body);
      console.log(accounts);
      res.json(accounts);
    })
  }

});

const scheduleCronSendMail = async ()=>{
  //每分钟的第30秒定时执行一次:
  schedule.scheduleJob('8 8 8 * * *', async()=>{
        console.log('scheduleCronSendMail:' + new Date());
        var checkAccounts = ['vktokendapps','createaccout'];
        await async.eachSeries(checkAccounts,async(accountName, cb) =>{
          //获取账号xxxx的资产,查询资产的时候要加上资产的合约名字eosio.token
          const balances = await rpc.get_currency_balance('eosio.token', accountName);
          console.log(balances);
          if(balances.length === 0){
            balances.push("0.0000 VKT");
          }

          let vkt_balance = 0;
          for (let i in balances) {
            let balarr = balances[i].split(" ");
            if (balarr[1] === "VKT") {
              vkt_balance = balarr[0];
            }
          }
          if(vkt_balance < 500){
            let transporter = nodemailer.createTransport({
              // host: 'smtp.ethereal.email',
              service: 'qq', // 使用了内置传输发送邮件 查看支持列表：https://nodemailer.com/smtp/well-known/
              port: 465, // SMTP 端口
              secureConnection: true, // 使用了 SSL
              auth: {
                user: '8760358@qq.com',
                // 这里密码不是qq密码，是你设置的smtp授权码
                pass: 'ilmbjmyljenmbghh',
              }
            });
            
            let mailOptions = {
              from: '"李轶给馨月的提醒" <8760358@qq.com>', // sender address
              to: 'xingxinyue@vankia.cn', // list of receivers
              subject: '账户余额不足提醒-账号：'+ accountName, // Subject line
              // 发送text或者html格式
              // text: 'Hello world?', // plain text body
              html: '<b>请及时给该账户充币~！！！！！</b>' + '<p>账户：'+accountName +'</p>' + '<p>余额：'+vkt_balance +' VKT</p>' // html body
            };

            // send mail with defined transport object
            transporter.sendMail(mailOptions, (error, info) => {
              if (error) {
                return console.log(error);
              }
              console.log('Message sent: %s', info.messageId);
              // Message sent: <04ec7731-cc68-1ef6-303c-61b0f796b78f@qq.com>
            });
          }
        }); 
    });
}

scheduleCronSendMail();

// 路由scatter 多语言数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/api_oc_blockchain-v1.0.0/:path_param1', defaultLimiter, async (req, res) => {

  let path_param1 = req.params.path_param1;

  if (path_param1 === "get_info") {
    console.log('/api_oc_blockchain-v1.0.0/get_info', req.body);
    let chain_info = JSON.parse('{}');

    chain_info.code = 0;
    chain_info.message = 'ok';
    // 获取账号qingzhudatac的信息
    const chaininfo = await rpc.get_info();
    console.log(chaininfo);
    chain_info.data = chaininfo;
    res.json(chain_info);
  } else if (path_param1 === "get_sparklines") {
    console.log('/api_oc_blockchain-v1.0.0/get_sparklines', req.body);
    let sparklines = JSON.parse('{}');

    sparklines.code = 0;
    sparklines.message = 'ok';
    // 获取VKT Sparklines的信息
    sparklines.data = JSON.parse('{}');
    sparklines.data.sparkline_vkt_png = 'https://github.com/tokyoliyi/images/blob/master/sparkline_vkt.png?raw=true';
    console.log(sparklines);
    res.json(sparklines);
  }
});


// 路由scatter 多语言数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/oulianvktaccount/getAccountOrder/:path_param1/:path_param2', defaultLimiter, async (req, res) => {

  let path_param1 = req.params.path_param1;
  let path_param2 = req.params.path_param2;

  if (path_param1.length >= 5 && path_param1.length <= 12 && 
    path_param2.length >= 11) {
    console.log('/oulianvktaccount/getAccountOrder/',path_param1,path_param2, req.body);
    let accountorder = JSON.parse('{}');

    // 获取账号qingzhudatac的信息
    // const chaininfo = await rpc.get_info();
    // console.log(chaininfo);
    accountorder.code = 0;
    accountorder.message = 'ok';
    accountorder.data = JSON.parse('{}');
    accountorder.data.createStatus = 1;
    accountorder.data.accountName = path_param1;
    accountorder.data.message = 'ok';
    console.log(accountorder);
    res.json(accountorder);
  }
});

// 路由scatter 多语言数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/oulianvktaccount/:path_param1', async (req, res) => {

  let path_param1 = req.params.path_param1;
  // let path_param2 = req.params.path_param2;

  if (path_param1 === "getAccountCreateResource" ) {
    console.log('/oulianvktaccount/getAccountCreateResource',path_param1, req.body);
    let getAccountCreateResource = JSON.parse('{}');

    // 获取账号qingzhudatac的信息
    // const chaininfo = await rpc.get_info();
    // console.log(chaininfo);
    getAccountCreateResource.code = 0;
    getAccountCreateResource.message = 'ok';
    getAccountCreateResource.data = JSON.parse('{}');
    getAccountCreateResource.data.createStatus = 1;
    getAccountCreateResource.data.message = 'ok';
    console.log(getAccountCreateResource);
    res.json(getAccountCreateResource);
  }
});

// // 路由IOS blockchain history信息
// app.use(bodyParser.urlencoded({
//   extended: false
// }));
// app.use(bodyParser.json());
// app.post('/VX/:path_param1', async (req, res) => {

//   let path_param1 = req.params.path_param1;

//   console.log(path_param1);
//   console.log(req.body);
//   if (path_param1 === "GetActions") {
//     console.log('/VX/GetActions', req.body);
//     let accounts = JSON.parse('{}');
//     let start_pos = req.body.page * req.body.pageSize;
//     let req_json = JSON.stringify({"pos":start_pos,"offset":req.body.pageSize,"account_name":req.body.from});
//     // let req_json = JSON.stringify({"pos":"-1","offset":-1,"account_name":req.body.from});
//     console.log(req_json)
//     request.post({
//       url: VKTAPI_URL+'/v1/history/get_actions',
//       form: req_json
//     }, 
//     (error, res2, body) => {
//       if (error) {
//         console.error(error);
//         return;
//       }
//       // console.log(body);
//       accounts.code = 0;
//       accounts.message = "ok";
//       accounts.data = JSON.parse('{}');
//       accounts.data.pageSize = 1;
//       accounts.data.page = 1;
//       accounts.data.hasMore = 0;
//       accounts.data.actions = JSON.parse('[]');
//       let quantity ;
//       let quantityarr;
//       let index = 0;
//       console.log(m_lasttrxid);
//       for (let i in JSON.parse(body).actions) {
//         if(m_lasttrxid[req.body.from] == JSON.parse(body).actions[i].action_trace.trx_id &&
//         JSON.parse(body).actions.length > 1) {
//           continue;
//         }
//         accounts.data.actions.push({"doc": JSON.parse(body).actions[i].action_trace.act});
//         accounts.data.actions[index].doc.data.expiration = JSON.parse(body).actions[i].action_trace.block_time;
//         if(accounts.data.actions[index].doc.data.from === "eosio"){
//           accounts.data.actions[index].doc.data.from = "vktio";
//         }
//         accounts.data.actions[index].trxid = JSON.parse(body).actions[i].action_trace.trx_id;
//         accounts.data.actions[index].blockNum = JSON.parse(body).actions[i].action_trace.block_num;
//         accounts.data.actions[index].time = JSON.parse(body).actions[i].action_trace.block_time;
//         accounts.data.actions[index].cpu_usage_us = JSON.parse(body).actions[i].action_trace.cpu_usage;
//         accounts.data.actions[index].net_usage_words = "bytes";
//         quantity = JSON.parse(body).actions[i].action_trace.act.data.quantity;
//         if(quantity != undefined){
//           quantityarr = quantity.split(" ");
//         }else{
//           quantityarr = "0.0 VKT".split(" ");
//         }
//         accounts.data.actions[index].amount = quantityarr[0];
//         accounts.data.actions[index].assestsType = quantityarr[1];
//         //for netxt page Deduplication
//         m_lasttrxid[req.body.from] = accounts.data.actions[index].trxid;
//         index ++;
//       }
//       console.log(util.inspect(accounts, false, null, true))
//       res.json(accounts);
//     })
//   }else if (path_param1 === "GetAssetsLockRecords") {
//     console.log('/VX/GetAssetsLockRecords', req.body);
//     let accounts = JSON.parse('{}');
//     let accountid = req.body.account_id;
    
//     // 获取账号ios的信息
//     const accountInfo = await rpc.get_account(accountid);
//     console.log(accountInfo);

//     //获取账号ios的资产,查询资产的时候要加上资产的合约名字eosio.token
//     const balances = await rpc.get_currency_balance('eosio.token', accountid);
//     console.log(balances);
//     if(balances.length === 0){
//       balances.push("0.0000 VKT");
//     }

//     const lockedbalance = await rpc.get_table_rows({
//       json: true,              // Get the response as json
//       code: 'eosio.token',     // Contract that we target
//       scope: accountid,         // Account that owns the data
//       table: 'locked',        // Table name
//       limit: 10,               // maximum number of rows that we want to get
//     });
  
//     console.log(lockedbalance)
  
//     let amountlocked = 0.0;
//     let unlockdate ;
//     for (let i in balances) {
//       let balarr = balances[i].split(" ");
//       if(balarr[1] === "TTMC" && lockedbalance.rows.length > 0){
//         amountlocked = lockedbalance.rows[i].total_balance.split(' ')[0];
//         unlockdate = moment.utc(lockedbalance.rows[i].balances[0].unlock_execute_time, moment.ISO_8601).local().format();
//       }else{
//         amountlocked = 0.0;
//         unlockdate = moment().format();
//       }

//       accounts.code = 0;
//       accounts.message = "ok";
//       accounts.data = JSON.parse('{}');
//       accounts.data.account_name = accountInfo.account_name;
//       accounts.data.contract = "eosio.token";
//       accounts.data.amount = balarr[0];
//       accounts.data.amountlocked = amountlocked;
//       accounts.data.availableamount = balarr[0] - amountlocked;
//       accounts.data.unlockdate = unlockdate;
//       accounts.data.token = balarr[1];
//       accounts.data.decimals = balarr[0].split(".")[1].length;
//       accounts.data.lockedassets = JSON.parse('[]');

//       if(balarr[1] === "VKT" && lockedbalance.rows.length > 0){
//         for(let j in lockedbalance.rows[i].balances){
//             accounts.data.lockedassets.push({
//             assets:lockedbalance.rows[i].balances[j].balance.split(' ')[0],
//             unlocktime:moment.utc(lockedbalance.rows[i].balances[j].unlock_execute_time, moment.ISO_8601).local().format()
//           });
//         }
//       }
//     }

//     res.json(accounts);
//   }

// });


app.post('/VX/GetActions', defaultLimiter, getActionsDistinct);
app.post('/VX/GetActions2', defaultLimiter, getActionsFromHistoryTool);
app.post('/VX/GetAssetsLockRecords', defaultLimiter, getAssetsLockRecords);
app.post('/VX/GenInviteCode', defaultLimiter, genInviteCode);
app.post('/VX/GetNotifications', defaultLimiter, getNotifications);
app.post('/VX/SetNotificationsRead', defaultLimiter, setNotificationsRead);
app.post('/VX/GetUnreadNotificationsNum', defaultLimiter, getUnreadNotificationsNum);
app.post('/VX/SetBlackListUsers', defaultLimiter, setBlackListUsers);
app.use('/VX/GetUserLoginArea/:path_param1', defaultLimiter, getUserLoginArea);

function getActionsDistinct(req, res){
  console.log('/VX/GetActions', req.body,req.query);
  MongoClient.connect(MONGO_URL, { useNewUrlParser: true }, async function (err, db) {
    if (err) {
      console.error(err);
      return res.status(500).end();
    }
    const dbo = db.db("VKT");

    // default values
    let skip = (isNaN(Number(req.body.skip))) ? 0 : Number(req.body.skip);
    let limit = (isNaN(Number(req.body.limit))) ? 10 : Number(req.body.limit);
    let sort = (isNaN(Number(req.body.sort))) ? -1 : Number(req.body.sort);
    
    let pageSize = (isNaN(Number(req.body.pageSize))) ? 0 : Number(req.body.pageSize);
    let curpage = (isNaN(Number(req.body.page))) ? 0 : Number(req.body.page);
    skip = curpage * pageSize;
    limit = pageSize;

    if (limit > MAX_ELEMENTS){
      return res.status(401).send(`Max elements ${MAX_ELEMENTS}!`);
    }
    if (skip < 0 || limit <= 0){
      return res.status(401).send(`Skip (${skip}) || (${limit}) limit <= 0`);
    }
    if (sort !== -1 && sort !== 1){
      return res.status(401).send(`Sort param must be 1 or -1`);
    }
    if (skip > MAX_SKIP){
      return res.status(500).send("Large skip for account! Max skip per request " + MAX_SKIP);
    }

    let filterClass = 0;
    let accountName = "";
    let action = String(req.body.action);
    let counter = Number(req.body.counter);
    let actionsNamesArr = (typeof req.body.filter === "string") ? req.body.filter.split(","): null;
    actionsNamesArr = "reward".split(",");
    action = "transfer";
    if(Ut.isEmpty(String(req.body.from)) && !Ut.isEmpty(String(req.body.to))){
      filterClass = 1;
      accountName = String(req.body.to);
    }else if(!Ut.isEmpty(String(req.body.from)) && Ut.isEmpty(String(req.body.to))){
      filterClass = 2;
      accountName = String(req.body.from);
    }else{
      filterClass = 0;
      accountName = String(req.body.from);
    }

    /*if (latencySkip[accountName] > +new Date()){
      return res.status(500).send("Large skip for account, please wait until previous request will end! Max skip per request " + MAX_SKIP);
    }
  if (!latencySkip[accountName] && skip > MAX_SKIP){
    latencySkip[accountName] = +new Date() + 60000;
    }*/
    // query = {
    //   $or: [
    //   {"action_traces.act.account": accountName}, 
    //   {"action_traces.act.data.receiver": accountName}, 
    //   {"action_traces.act.data.from": accountName}, 
    //   {"action_traces.act.data.to": accountName},
    //   {"action_traces.act.data.name": accountName},
    //   {"action_traces.act.data.voter": accountName},
    //   {"action_traces.act.authorization.actor": accountName}
    // ]};
    let query = "";
    if(filterClass === 0){
      query = {
        $or: [
        {"action_traces.act.data.from": accountName}, 
        {"action_traces.act.data.to": accountName},
        {"action_traces.act.data.account": accountName}
      ]};
    }else if(filterClass === 1){
      query = {
        $or: [
        {"action_traces.act.data.to": accountName},
        {"action_traces.act.data.account": accountName}
      ]};
    }else if(filterClass === 2){
      query = {
        $or: [
        {"action_traces.act.data.from": accountName}
      ]};
    }

    if (!Ut.isEmpty(String(action)) && action !== "all"){
      query["action_traces.act.name"] = action;
    }

    //filter daily signed with 0 vkt case
    query["action_traces.inline_traces"] = {"$exists":true, "$ne":[]};

    //filter duplicate data
    query["producer_block_id"] ={ $ne: null};

    if (actionsNamesArr){
      query['action_traces.act.name'] = { $in : [query['action_traces.act.name']]};
      actionsNamesArr.forEach(elem => {
          query['action_traces.act.name']['$in'].push(elem);
      });
    }

    console.log(query);
    let parallelObject = {
      actions: (callback) => {
        dbo.collection("transaction_traces").find(query).sort({ "block_time": sort }).skip(skip).limit(limit).toArray(callback);
        }
    };

    if (counter === 1){
      parallelObject["actionsTotal"] = (callback) => {
      callback(null, 'Under construction');
        }
    }
    
    async.parallel(parallelObject, (err, result) => {
    if (err){
        console.error(err);
        return res.status(500).end();
    }
    /*if (latencySkip[accountName] && skip > MAX_SKIP){
      delete latencySkip[accountName];
    }*/
    let accounts = JSON.parse('{}');
    accounts.code = 0;
    accounts.message = "ok";
    accounts.data = JSON.parse('{}');
    accounts.data.pageSize = pageSize;
    accounts.data.page = curpage;
    accounts.data.hasMore = 1;
    accounts.data.actions = JSON.parse('[]');
    let quantity ;
    let quantityarr;
    let index = 0;
    console.log(m_lasttrxid);
    console.log(result);
    for (let i in result.actions) {
      // if(m_lasttrxid[req.body.from] == JSON.parse(result).actions[i].trx_id &&
      // JSON.parse(result).actions.length > 1) {
      //   continue;
      // }
      // if(result.actions[i].action_traces[0].act.name == "reward" && 
      //    result.actions[i].action_traces[0].inline_traces.length == 0){
      //    continue;
      // }
      accounts.data.actions.push({"doc": result.actions[i].action_traces[0].act});
      accounts.data.actions[index].doc.data.expiration = result.actions[i].block_time;
      if(accounts.data.actions[index].doc.data.from === "eosio"){
        accounts.data.actions[index].doc.data.from = "vktio";
      }
      accounts.data.actions[index].trxid = result.actions[i].action_traces[0].trx_id;
      accounts.data.actions[index].blockNum = result.actions[i].block_num;
      accounts.data.actions[index].time = result.actions[i].block_time;
      accounts.data.actions[index].cpu_usage_us = result.actions[i].cpu_usage;
      accounts.data.actions[index].net_usage_words = "bytes";
      if(result.actions[i].action_traces[0].act.name == "transfer") {
        quantity = result.actions[i].action_traces[0].act.data.quantity;
      }else if(result.actions[i].action_traces[0].act.name == "reward" &&
               result.actions[i].action_traces[0].inline_traces.length > 0) {
        quantity = result.actions[i].action_traces[0].inline_traces[0].act.data.quantity;
        accounts.data.actions[index].doc.data.from = "daily signed";
        accounts.data.actions[index].doc.data.to = result.actions[i].action_traces[0].inline_traces[0].act.data.to;
        accounts.data.actions[index].doc.data.quantity = result.actions[i].action_traces[0].inline_traces[0].act.data.quantity;
        accounts.data.actions[index].doc.data.memo = result.actions[i].action_traces[0].inline_traces[0].act.data.memo;
      }else{
        quantity = "";
        accounts.data.actions[index].doc.data.from = "daily signed";
        accounts.data.actions[index].doc.data.to = accountName;
        accounts.data.actions[index].doc.data.quantity = "0.0 VKT";
        accounts.data.actions[index].doc.data.memo = "daily signed";
      }
      if(!Ut.isEmpty(String(quantity))){
        quantityarr = quantity.split(" ");
      }else{
        quantityarr = "0.0 VKT".split(" ");
      }
      accounts.data.actions[index].amount = quantityarr[0];
      accounts.data.actions[index].assestsType = quantityarr[1];
      //for netxt page Deduplication
      // m_lasttrxid[req.body.from] = accounts.data.actions[index].trxid;
      index ++;
    }
    // console.log(util.inspect(accounts, false, null, true))
    res.json(accounts);
    });
    db.close();
  });
}

async function getActionsFromHistoryTool (req, res) {
  console.log('/VX/GetActions2', req.body,req.query);


 // default values
  let skip = (isNaN(Number(req.body.skip))) ? 0 : Number(req.body.skip);
  let limit = (isNaN(Number(req.body.limit))) ? 10 : Number(req.body.limit);
  let sort = (isNaN(Number(req.body.sort))) ? -1 : Number(req.body.sort);
  
  let pageSize = (isNaN(Number(req.body.pageSize))) ? 0 : Number(req.body.pageSize);
  let curpage = (isNaN(Number(req.body.page))) ? 0 : Number(req.body.page);
  skip = curpage * pageSize;
  limit = pageSize;

  if (limit > MAX_ELEMENTS){
    return res.status(401).send(`Max elements ${MAX_ELEMENTS}!`);
  }
  if (skip < 0 || limit <= 0){
    return res.status(401).send(`Skip (${skip}) || (${limit}) limit <= 0`);
  }
  if (sort !== -1 && sort !== 1){
    return res.status(401).send(`Sort param must be 1 or -1`);
  }
  if (skip > MAX_SKIP){
    return res.status(500).send("Large skip for account! Max skip per request " + MAX_SKIP);
  }

  let filterClass = 0;
  let accountName = "";
  let action = String(req.body.action);
  let counter = Number(req.body.counter);
  let actionsNamesArr = (typeof req.body.filter === "string") ? req.body.filter.split(","): null;
  actionsNamesArr = "reward".split(",");
  // action = "transfer";
  if(Ut.isEmpty(String(req.body.from)) && !Ut.isEmpty(String(req.body.to))){
    filterClass = 1;
    accountName = String(req.body.to);
  }else if(!Ut.isEmpty(String(req.body.from)) && Ut.isEmpty(String(req.body.to))){
    filterClass = 2;
    accountName = String(req.body.from);
  }else{
    filterClass = 0;
    accountName = String(req.body.from);
  }

  let accounts = JSON.parse('{}');
  accounts.code = 0;
  accounts.message = "ok";
  accounts.data = JSON.parse('{}');
  accounts.data.pageSize = pageSize;
  accounts.data.page = curpage;
  accounts.data.hasMore = 0;
  accounts.data.actions = JSON.parse('[]');
  let quantity ;
  let quantityarr;
  let index = 0;

  let first_key = {
    receiver: accountName,
    account: 'eosio.token',
    block: ['absolute', 0],
    transaction_id: '0000000000000000000000000000000000000000000000000000000000000000',
    action_ordinal: 0,
  };
  let last_key = {
      receiver: accountName,
      account: 'eosio.token',
      block: ['irreversible', 0],
      transaction_id: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      action_ordinal: 0xffffffff,
  };

  let i = 0;
  let transferIdArr = [];
  while (first_key) {
      const reply = await tokenWasm.round_trip(['transfer', {
          snapshot_block: ["head", 0],
          first_key,
          last_key,
          max_results: limit,
          include_notify_incoming: true,
          include_notify_outgoing: true,
      }]);
      // console.log(util.inspect(reply, false, null, true))
      first_key = reply[1].more;
      // i += reply[1].transfers.length;
      // console.log(i);
      // if (i <= skip)
      //     continue;

      for (let transfer of reply[1].transfers){
        if(filterClass === 1 && transfer.from === accountName){continue;}
        if(filterClass === 2 && transfer.to === accountName){continue;}
        transferIdArr.push(transfer.key.transaction_id);
          console.log(
              transfer.from.padEnd(13, ' ') + ' -> ' + transfer.to.padEnd(13, ' '),
              format_extended_asset(transfer.quantity), '     ', transfer.memo);
      }
      // break;
  }
  // console.log(transferIdArr)
  transferIdArr.reverse();
  // console.log(transferIdArr)

  await async.eachSeries(transferIdArr,async(trx_id, cb) =>{

    if (i < skip){
      i++;
      // console.log(i,skip)
      return true;
    }

    if (i >= skip + limit){
        console.log(i,skip + limit)
        accounts.data.hasMore = 1;
        return false;
    }
    i++;

    const trx_info = await rpc.history_get_transaction(trx_id);
    // console.log(util.inspect(trx_info, false, null, true));

    if (!Ut.isEmpty(String(action)) && action !== "undefined" && trx_info.traces[0].act.name != "reward"){
      return true;
    }

    accounts.data.actions.push({"doc": trx_info.traces[0].act});
    if(trx_info.trx !== null && trx_info.trx !== "undefined"){
      accounts.data.actions[index].doc.data.expiration = trx_info.trx.trx.expiration;
      accounts.data.actions[index].cpu_usage_us = trx_info.trx.receipt.cpu_usage_us;
      accounts.data.actions[index].net_usage_words = trx_info.trx.receipt.net_usage_words;
    }else{
      accounts.data.actions[index].doc.data.expiration = trx_info.block_time;
      accounts.data.actions[index].cpu_usage_us = "";
      accounts.data.actions[index].net_usage_words = "";
    }
    if(accounts.data.actions[index].doc.data.from === "eosio"){
      accounts.data.actions[index].doc.data.from = "vktio";
    }
    accounts.data.actions[index].trxid = trx_info.id;
    accounts.data.actions[index].blockNum = trx_info.block_num;
    accounts.data.actions[index].time = trx_info.block_time;
    if(trx_info.traces[0].act.name == "transfer") {
      quantity = trx_info.traces[0].act.data.quantity;
    }else if(trx_info.traces[0].act.name  == "reward" &&
    trx_info.traces.length > 1) {
      quantity = trx_info.traces[1].act.data.quantity;
      accounts.data.actions[index].doc.data.from = "daily signed";
      accounts.data.actions[index].doc.data.to = trx_info.traces[1].act.data.to;
      accounts.data.actions[index].doc.data.quantity = trx_info.traces[1].act.data.quantity;
      accounts.data.actions[index].doc.data.memo = trx_info.traces[1].act.data.memo;
    }else{
      quantity = "";
      accounts.data.actions[index].doc.data.from = "daily signed";
      accounts.data.actions[index].doc.data.to = accountName;
      accounts.data.actions[index].doc.data.quantity = "0.0 VKT";
      accounts.data.actions[index].doc.data.memo = "daily signed";
    }
    if(!Ut.isEmpty(String(quantity))){
      quantityarr = quantity.split(" ");
    }else{
      quantityarr = "0.0 VKT".split(" ");
    }
    accounts.data.actions[index].amount = quantityarr[0];
    accounts.data.actions[index].assestsType = quantityarr[1];
    //for netxt page Deduplication
    // m_lasttrxid[req.body.from] = accounts.data.actions[index].trxid;
    index ++;
  });

  res.json(accounts);
}

async function getNotifications (req, res) {
  console.log('/VX/GetNotifications', req.body,req.query);

  // default values
  let skip = (isNaN(Number(req.body.skip))) ? 0 : Number(req.body.skip);
  let limit = (isNaN(Number(req.body.limit))) ? 10 : Number(req.body.limit);
  let sort = (isNaN(Number(req.body.sort))) ? -1 : Number(req.body.sort);
  
  let pageSize = (isNaN(Number(req.body.pageSize))) ? 0 : Number(req.body.pageSize);
  let curpage = (isNaN(Number(req.body.page))) ? 0 : Number(req.body.page);
  skip = curpage * pageSize;
  limit = pageSize;

  if (limit > MAX_ELEMENTS){
    return res.status(401).send(`Max elements ${MAX_ELEMENTS}!`);
  }
  if (skip < 0 || limit <= 0){
    return res.status(401).send(`Skip (${skip}) || (${limit}) limit <= 0`);
  }
  if (sort !== -1 && sort !== 1){
    return res.status(401).send(`Sort param must be 1 or -1`);
  }
  if (skip > MAX_SKIP){
    return res.status(500).send("Large skip for account! Max skip per request " + MAX_SKIP);
  }

  let filterClass = 0;
  let accountName = "";
  let action = String(req.body.action);
  let counter = Number(req.body.counter);
  let actionsNamesArr = (typeof req.body.filter === "string") ? req.body.filter.split(","): null;
  actionsNamesArr = "reward".split(",");
  action = "transfer";
  if(Ut.isEmpty(String(req.body.from)) && !Ut.isEmpty(String(req.body.to))){
    filterClass = 1;
    accountName = String(req.body.to);
  }else if(!Ut.isEmpty(String(req.body.from)) && Ut.isEmpty(String(req.body.to))){
    filterClass = 2;
    accountName = String(req.body.from);
  }else{
    filterClass = 0;
    accountName = String(req.body.from);
  }

  let accounts = JSON.parse('{}');
  accounts.code = 0;
  accounts.message = "ok";
  accounts.data = JSON.parse('{}');
  accounts.data.pageSize = pageSize;
  accounts.data.page = curpage;
  accounts.data.hasMore = 0;
  accounts.data.actions = JSON.parse('[]');
  let quantity ;
  let quantityarr;
  let index = 0;

  let first_key = {
    receiver: accountName,
    account: 'eosio.token',
    block: ['absolute', 0],
    transaction_id: '0000000000000000000000000000000000000000000000000000000000000000',
    action_ordinal: 0,
  };
  let last_key = {
      receiver: accountName,
      account: 'eosio.token',
      block: ['irreversible', 0],
      transaction_id: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      action_ordinal: 0xffffffff,
  };

  let i = 0;
  let transferIdArr = [];
  while (first_key) {
      const reply = await tokenWasm.round_trip(['transfer', {
          snapshot_block: ["head", 0],
          first_key,
          last_key,
          max_results: limit,
          include_notify_incoming: true,
          include_notify_outgoing: true,
      }]);
      // console.log(util.inspect(reply, false, null, true))
      first_key = reply[1].more;
      // i += reply[1].transfers.length;
      // console.log(i);
      // if (i <= skip)
      //     continue;

      for (let transfer of reply[1].transfers){
        if(filterClass === 1 && transfer.from === accountName){continue;}
        if(filterClass === 2 && transfer.to === accountName){continue;}
        transferIdArr.push(transfer.key.transaction_id);
          console.log(
              transfer.from.padEnd(13, ' ') + ' -> ' + transfer.to.padEnd(13, ' '),
              format_extended_asset(transfer.quantity), '     ', transfer.memo);
      }
      // break;
  }
  // console.log(transferIdArr)
  transferIdArr.reverse();
  // console.log(transferIdArr)

  await async.eachSeries(transferIdArr,async(trx_id, cb) =>{

    if (i < skip){
      i++;
      // console.log(i,skip)
      return true;
    }

    if (i >= skip + limit){
        console.log(i,skip + limit)
        accounts.data.hasMore = 1;
        return false;
    }
    i++;

    await rpc.history_get_transaction(trx_id).then(async(trx_info) =>{
      // console.log(util.inspect(trx_info, false, null, true));

      let read_key = accountName + '_' + trx_id;

      // This will return a read status
      await getAsync(read_key).then(async(reply) => {
          if(reply) {
            console.log(reply)
          }else{
            // redis to be inserted
            await setAsync(read_key, "NO");
          }

          accounts.data.actions.push({"doc": trx_info.traces[0].act});
          if(trx_info.trx !== null && trx_info.trx !== "undefined"){
            accounts.data.actions[index].doc.data.expiration = trx_info.trx.trx.expiration;
            accounts.data.actions[index].cpu_usage_us = trx_info.trx.receipt.cpu_usage_us;
            accounts.data.actions[index].net_usage_words = trx_info.trx.receipt.net_usage_words;
          }else{
            accounts.data.actions[index].doc.data.expiration = trx_info.block_time;
            accounts.data.actions[index].cpu_usage_us = "";
            accounts.data.actions[index].net_usage_words = "";
          }
          if(accounts.data.actions[index].doc.data.from === "eosio"){
            accounts.data.actions[index].doc.data.from = "vktio";
          }
          accounts.data.actions[index].trxid = trx_info.id;
          accounts.data.actions[index].blockNum = trx_info.block_num;
          accounts.data.actions[index].time = trx_info.block_time;
          if(trx_info.traces[0].act.name == "transfer") {
            quantity = trx_info.traces[0].act.data.quantity;
          }else if(trx_info.traces[0].act.name  == "reward" &&
          trx_info.traces.length > 1) {
            quantity = trx_info.traces[1].act.data.quantity;
            accounts.data.actions[index].doc.data.from = "daily signed";
            accounts.data.actions[index].doc.data.to = trx_info.traces[1].act.data.to;
            accounts.data.actions[index].doc.data.quantity = trx_info.traces[1].act.data.quantity;
            accounts.data.actions[index].doc.data.memo = trx_info.traces[1].act.data.memo;
          }else{
            quantity = "";
            accounts.data.actions[index].doc.data.from = "daily signed";
            accounts.data.actions[index].doc.data.to = accountName;
            accounts.data.actions[index].doc.data.quantity = "0.0 VKT";
            accounts.data.actions[index].doc.data.memo = "daily signed";
          }
          if(!Ut.isEmpty(String(quantity))){
            quantityarr = quantity.split(" ");
          }else{
            quantityarr = "0.0 VKT".split(" ");
          }
          accounts.data.actions[index].amount = quantityarr[0];
          accounts.data.actions[index].assestsType = quantityarr[1];
          //for netxt page Deduplication
          // m_lasttrxid[req.body.from] = accounts.data.actions[index].trxid;
          accounts.data.actions[index].had_read = reply ? (reply.toString() === "NO") ? 0 : 1 : 0;

          index ++;
      });
    });
  });

  res.json(accounts);
}

async function setNotificationsRead (req, res) {
  console.log('/VX/SetNotificationsRead', req.body);
  let notificationsRead = JSON.parse('{}');
  let accountid = req.body.account_id;
  let transferIdArr = req.body.trx_ids;
  let trx_key = "";
  console.log(transferIdArr);

  if(transferIdArr.length === 0){
    await keysAsync( accountid + '*').then(async(accountTrxKeys) => {

      await async.eachSeries(accountTrxKeys,async(accountTrx, cb) =>{
        // await getAsync(accountTrx).then(async(value) => {
        // });
        await setAsync(accountTrx,'YES').then(async(reply) => {
          if(reply) {
            console.log(reply)
          }
        });
      });
    });    
  }else{
    await async.eachSeries(transferIdArr,async(trx_id, cb) =>{

      trx_key = accountid + '_' + trx_id.toUpperCase();

      // This will return a read status
      await setAsync(trx_key,'YES').then(async(reply) => {
        if(reply) {
          console.log(reply)
        }
      });
    });
  }

  notificationsRead.code = 0;
  notificationsRead.message = "ok";
  notificationsRead.data = JSON.parse('{}');

  res.json(notificationsRead);

}

async function getUnreadNotificationsNum (req, res) {
  console.log('/VX/GetUnreadNotificationsNum', req.body);
  let notificationsRead = JSON.parse('{}');
  let accountid = req.body.account_id;
  let unreadNum = 0;
  console.log(accountid);

  await keysAsync( accountid + '*').then(async(accountTrxKeys) => {

    await async.eachSeries(accountTrxKeys,async(accountTrx, cb) =>{
      await getAsync(accountTrx).then(async(value) => {
        if(value && value.toString() === 'NO') {
          unreadNum++;
          console.log(value)
        }
      });
    });
  });

  notificationsRead.code = 0;
  notificationsRead.message = "ok";
  notificationsRead.data = JSON.parse('{}');
  notificationsRead.data.unreadNum = unreadNum;

  res.json(notificationsRead);

}


async function getUserLoginArea (req, res) {
  console.log('/VX/GetUserLoginArea', req.body);
  let path_param1 = req.params.path_param1;
  let getUserLoginArea = JSON.parse('{}');

  // make client connect to mongo service
  MongoClient.connect(MONGO_URL, { useNewUrlParser: true }, async function(err, db) {
    if (err) throw err;

    const dbo = db.db("VKT");
    await dbo.collection("LoginLogs").aggregate({
      $match: {
        "name":{
          $eq: path_param1
        },
        "datetime": {
          $gt: (new Date(new Date().getTime() - (7 * 24 * 60 * 60 * 1000))).toISOString()
        },
        "location": {
          $ne: null
        }
      }
    }, {
      $group: {
        _id: "$location",
        totallogin: {
          $sum: 1
        }
      }
    },
    async function (err, result) {
      if (err) throw err;
      result.toArray(async function (err, result) {
        getUserLoginArea.code = 0;
        getUserLoginArea.message = "ok";
        getUserLoginArea.data = JSON.parse('{}');
        getUserLoginArea.data.lastWeekLoginPlaceNum = result.length;
        getUserLoginArea.data.lastWeekLoginPlace = result;
        res.json(getUserLoginArea);
      });
    });
  });
}

async function getAssetsLockRecords (req, res) {
    console.log('/VX/GetAssetsLockRecords', req.body);
    let accounts = JSON.parse('{}');
    let accountid = req.body.account_id;
    
    // 获取账号ios的信息
    const accountInfo = await rpc.get_account(accountid);
    console.log(accountInfo);

    //获取账号ios的资产,查询资产的时候要加上资产的合约名字eosio.token
    const balances = await rpc.get_currency_balance('eosio.token', accountid);
    console.log(balances);
    if(balances.length === 0){
      balances.push("0.0000 VKT");
    }

    const lockedbalance = await rpc.get_table_rows({
      json: true,              // Get the response as json
      code: 'eosio.token',     // Contract that we target
      scope: accountid,         // Account that owns the data
      table: 'locked',        // Table name
      limit: 10,               // maximum number of rows that we want to get
      reverse: true,
    });
  
    console.log(lockedbalance)
  
    let amountlocked = 0.0;
    let unlockdate ;
    for (let i in balances) {
      let balarr = balances[i].split(" ");
      if(balarr[1] === "VKT" && lockedbalance.rows.length > 0){
        amountlocked = lockedbalance.rows[i].total_balance.split(' ')[0];
        unlockdate = moment.utc(lockedbalance.rows[i].balances[0].unlock_execute_time, moment.ISO_8601).local().format();
      }else{
        amountlocked = 0.0;
        unlockdate = moment().format();
      }

      accounts.code = 0;
      accounts.message = "ok";
      accounts.data = JSON.parse('{}');
      accounts.data.account_name = accountInfo.account_name;
      accounts.data.contract = "eosio.token";
      accounts.data.amount = balarr[0];
      accounts.data.amountlocked = amountlocked;
      accounts.data.availableamount = balarr[0] - amountlocked;
      accounts.data.unlockdate = unlockdate;
      accounts.data.token = balarr[1];
      accounts.data.decimals = balarr[0].split(".")[1].length;
      accounts.data.lockedassets = JSON.parse('[]');

      if(balarr[1] === "VKT" && lockedbalance.rows.length > 0){
        for(let j in lockedbalance.rows[i].balances){
            accounts.data.lockedassets.push({
            assets:lockedbalance.rows[i].balances[j].balance.split(' ')[0],
            unlocktime:moment.utc(lockedbalance.rows[i].balances[j].unlock_execute_time, moment.ISO_8601).local().format()
          });
        }
      }
    }
    res.json(accounts);
}


async function setBlackListUsers (req, res) {
  console.log('/VX/SetBlackListUsers', req.body);
  let blackListUsers = JSON.parse('{}');
  let blacklist_users = req.body.blacklist_users;
  let unblacklist_users = req.body.unblacklist_users;
  let head_key = "BLACKLIST_USERS_";
  let blacklist_key = "";
  console.log(blacklist_users);

  await async.eachSeries(blacklist_users,async(bl_user, cb) =>{
 
    blacklist_key = head_key + bl_user;

    // This will return a read status
    await getAsync(blacklist_key).then(async(reply) => {
      if(reply) {
        console.log(reply)

        // This will return a read status
        await setAsync(blacklist_key, "YES");
      }else{
        // redis to be inserted
        await setAsync(blacklist_key, "YES");
      }
    });

  });

  await async.eachSeries(unblacklist_users,async(unbl_user, cb) =>{
 
    blacklist_key = head_key + unbl_user;

    // This will return a read status
    await getAsync(blacklist_key).then(async(reply) => {
      if(reply) {
        console.log(reply)

        // This will return a read status
        await delAsync(blacklist_key, "YES");
      }
    });

  });

  blackListUsers.code = 0;
  blackListUsers.message = "ok";
  blackListUsers.data = JSON.parse('{}');

  res.json(blackListUsers);

}

async function saveLoginLogs (accountid, ip, location) {
  console.log('saveLoginLogs', accountid, ip , location);

  // make client connect to mongo service
  MongoClient.connect(MONGO_URL, { useNewUrlParser: true }, function(err, db) {
    if (err) throw err;

    const dbo = db.db("VKT");

    // db pointing to newdb
    console.log("Switched to "+dbo.databaseName+" database");

    // document to be inserted
    var doc = { name: accountid, ipaddr: ip, location: location, datetime: moment().toISOString()};

    // insert document to 'users' collection using insertOne
    dbo.collection("LoginLogs").insertOne(doc, function(err, res) {
        if (err) throw err;
        console.log("LoginLogs inserted");
        // close the connection to db when you are done with it
        db.close();
    });
    
  });

}

async function genInviteCode (req, res) {
  console.log('/VX/GenInviteCode', req.body);
  let inviteCode = JSON.parse('{}');
  let accountid = req.body.account_id;

  var hashids = new Hashids(accountid, 5);
  console.log(hashids.encode(1));

  // make client connect to mongo service
  MongoClient.connect(MONGO_URL, { useNewUrlParser: true }, function(err, db) {
    if (err) throw err;

    const dbo = db.db("VKT");

    // db pointing to newdb
    console.log("Switched to "+dbo.databaseName+" database");

      dbo.collection("InviteCode").find({
        "name": {
          $eq: accountid
        }
      }).count(function (err, result) {
        if (err) throw err;
        if (result >= 1) {
          console.log("InviteCode duplicated!");
          db.close();
        }else{
          // document to be inserted
          var doc = { name: accountid, inviteCode: hashids.encode(1) };

          // insert document to 'users' collection using insertOne
          dbo.collection("InviteCode").insertOne(doc, function(err, res) {
              if (err) throw err;
              console.log("InviteCode inserted");
              // close the connection to db when you are done with it
              db.close();
          });
        }
      });
  });

  inviteCode.code = 0;
  inviteCode.message = "ok";
  inviteCode.data = JSON.parse('{}');
  inviteCode.data.code = hashids.encode(1);
  inviteCode.data.qrcodeurl = "https://www.vankia.io/mobile/vktoken/index.html";

  res.json(inviteCode);

}


// 路由scatter 多语言数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/api_oc_pe_candy_system/:path_param1/:path_param2', defaultLimiter, async (req, res) => {

  let path_param1 = req.params.path_param1;
  let path_param2 = req.params.path_param2;
  let needtoRewardToday = false;

  if (path_param1 === "get_candy_score") {
    console.log('/api_oc_pe_candy_system/get_candy_score', req.body);
    let actname = path_param2;
    // let signedIp = req.ip.match(/\d+\.\d+\.\d+\.\d+/)[0];
    let signedIp = getNetIp(req);
    let bm_signed_info = JSON.parse('{}');
    let candy_score = JSON.parse('{}');
    var reward_again_info = JSON.parse('{}');
    candy_score.code = 0;
    candy_score.message = 'ok';
    
    // const reward_list = 
    await rpc.get_table_rows({
      json: true,              // Get the response as json
      code: 'vktokendapps',     // Contract that we target
      scope: 'vktokendapps',         // Account that owns the data
      table: 'usertable',        // Table name
      limit: -1,               // maximum number of rows that we want to get
      reverse: true,
    }).then(async (reward_list) => {

    var reward_info = reward_list.rows.filter(function(p){
      return p.account === actname;
    });
    
    candy_score.data = JSON.parse('{}');
   
    if(reward_info.length > 0){
      let last_reward_time = moment.utc(reward_info[0].last_reward_time, moment.ISO_8601).local().format("YYYY-MM-DD");
      let now_time = moment().format("YYYY-MM-DD");
      console.log({"last_reward_time":last_reward_time,"now_time":now_time})

      if(moment(last_reward_time).isSame(now_time)){
        console.log({"last_reward_time":last_reward_time,"now_time":now_time,"is":"same"})
        candy_score.data.scoreNum = reward_info[0].last_reward_amount;
        candy_score.data.totalscoreNum = reward_info[0].balance;
        candy_score.data.totalscoreDays = reward_info[0].sign_in_accumulate_days;
        candy_score.data.isRewardedToday = true;
      }else{
        needtoRewardToday = true;
      }
    }else{
      needtoRewardToday = true;
    }

    if(needtoRewardToday){
      let ip_read_key = 'IP_ADDRESS_' + signedIp;
      console.log(ip_read_key)
      // This will return a read status
      await getAsync(ip_read_key).then(async(reply) => {
        if(reply) {
          await setAsync(ip_read_key, Number(reply) + 1);
          console.log(reply)
        }else{
          // redis to be inserted
          await setAsync(ip_read_key, 1);
        }
        if(Number(reply) > 2 && !config.WHITELIST_IP_ARR.includes(signedIp.slice(signedIp.length-3))){
          candy_score.code = 200;
          candy_score.message = 'Too many requests from this IP, please try again after an hour.';
          res.json(candy_score);
          return true;
        }else{

          let read_key = 'BLACKLIST_USERS_' + actname;
          // This will return a read status
          await getAsync(read_key).then(async(reply) => {
            if(reply) {
              console.log(reply)
              candy_score.code = 200;
              candy_score.message = 'Too many requests from this User, please try again after an hour.';
              res.json(candy_score);
              return true;
            }else{
            // make client connect to mongo service
            MongoClient.connect(MONGO_URL, { useNewUrlParser: true }, async function(err, db) {
              if (err) throw err;

              const dbo = db.db("VKT");
              await dbo.collection("LoginLogs").aggregate({
                $match: {
                  "name":{
										$eq: actname
									},
                  "datetime": {
                    $gt: (new Date(new Date().getTime() - (7 * 24 * 60 * 60 * 1000))).toISOString()
                  },
                  "location": {
                    $ne: null
                  }
                }
              }, {
                $group: {
                  _id: "$location",
                  totallogin: {
                    $sum: 1
                  }
                }
              },
              async function (err, result) {
                if (err) throw err;
                result.toArray(async function (err, result) {
                  if (err) throw err;
                  // console.log(result);
                  if (result.length >= 5) {
                    console.log(reply)
                    candy_score.code = 200;
                    candy_score.message = 'Too many requests from this User, please try again after an hour.';
                    res.json(candy_score);
                    return true;
                  }else{
                    // 签到
                    const result = await api.transact({
                      actions: [{
                        account: 'vktokendapps',
                        name: 'reward',
                        authorization: [{
                          actor: 'vktokendapps',
                          permission: 'active',
                        }],
                        data: {"account":actname},
                      }]
                    }, {
                      blocksBehind: 3,
                      expireSeconds: 30,
                    });
                    let b_reverse = true;
                    async.eachSeries([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20], async(id, cb) => {
                      if(id%2 == 0) {
                        b_reverse = true;
                      }else{
                        b_reverse = false;
                      }
                      const reward_again_list = await rpc.get_table_rows({
                        json: true,              // Get the response as json
                        code: 'vktokendapps',     // Contract that we target
                        scope: 'vktokendapps',         // Account that owns the data
                        table: 'usertable',        // Table name
                        limit: -1,               // maximum number of rows that we want to get
                        reverse: b_reverse,
                      });

                      // console.log(reward_again_info)
                      // console.log("----------------------------------")
                      // console.dir(result,{depth: null});

                      reward_again_info = reward_again_list.rows.filter(function(p){
                        return p.account === actname;
                      });
                      if(reward_again_info.length > 0){
                        let last_reward_time = moment.utc(reward_again_info[0].last_reward_time, moment.ISO_8601).local().format("YYYY-MM-DD");
                        let now_time = moment().format("YYYY-MM-DD");
                        console.log({"last_reward_time":last_reward_time,"now_time":now_time})

                        if(moment(last_reward_time).isSame(now_time)){
                          console.log({"last_reward_time":last_reward_time,"now_time":now_time,"is":"same"})
                          candy_score.data.scoreNum = reward_again_info[0].last_reward_amount;
                          candy_score.data.totalscoreNum = reward_again_info[0].balance;
                          candy_score.data.totalscoreDays = reward_again_info[0].sign_in_accumulate_days;
                          candy_score.data.isRewardedToday = false;
                          // sign in successd then didn't count plus one
                          await setAsync(ip_read_key, Number(reply) - 1);
                          console.log(reply)
                          // Break out of async
                          console.log("Broke out of async!!!")
                          var err = new Error('Broke out of async');
                          err.break = true;
                          return cb(err);
                        }
                      }else{
                        await(sleep(300));
                        console.log("can't get user:", actname, id)
                      }
                    }, function(err) {
                      if (err) {
                        // Handle break out of async here

                        bm_signed_info.accountName = actname;
                        bm_signed_info.ip = signedIp;
                        bm_signed_info.reward = parseFloat(reward_again_info[0].last_reward_amount.split(' ')[0]);

                        console.log(bm_signed_info)
                        request.post({
                          url: BGAPI_URL+'/walletUserSignTimes/add',
                          json: bm_signed_info
                        }, 
                        (error, _res2, body) => {
                          if (error) {
                            console.error(error)
                            return true
                          }
                          console.log(body)
                        })
                        
                        res.json(candy_score);
                      }else{
                        console.log("Failed Broke out of async!!!")
                      }
                    });
                  }
                  setTimeout(function(){
                    db.close();
                  },50)
                });
              });
            });
            }
          });
        }
      });
    }else{

      bm_signed_info.accountName = actname;
      bm_signed_info.ip = signedIp;
      bm_signed_info.reward = parseFloat(reward_info[0].last_reward_amount.split(' ')[0]);

      console.log(bm_signed_info)
      request.post({
        url: BGAPI_URL+'/walletUserSignTimes/add',
        json: bm_signed_info
      }, 
      (error, res2, body) => {
        if (error) {
          console.error(error)
          return true
        }
        console.log(body)
      })
      
      res.json(candy_score); 
    }
  });

  } else if (path_param1 === "get_user_task") {
    console.log('/api_oc_pe_candy_system/get_user_task', req.body);
    let candy_score = JSON.parse('{}');

    candy_score.code = 0;
    candy_score.message = 'ok';
    // 获取账号qingzhudatac的信息

    candy_score.data = JSON.parse('[]');
    candy_score.data.push({
      candyTask:{
        id:'001',
        title:'预言家',
        description:'预测市场',
        avatar:'https://cdn1.iconfinder.com/data/icons/easter-2053/64/star-light-night-shapes-512.png',
        scoreNum:'200',
        taskUrl:'#',
        createTime:'2019-03-15 09:08',
        updateTime:'2019-03-15 09:08'
      }
    });
    res.json(candy_score);
  }
});

// 访问静态资源
app.use('/images', express.static(path.join(__dirname, './images')));

// 访问静态资源
app.use('/resource', express.static(path.join(__dirname, './resource')));

// 访问静态资源
app.use('/upgrade', express.static(path.join(__dirname, './upgrade')));

// 路由scatter prices数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/vktapi/v1/currencies', defaultLimiter, async (req, res) => {

  console.log('/vktapi/v1/currencies', req);
  res.json(vktdatav_currencies);
});

app.use('/vktapi/v1/getcurrencies', async (req, res) => {

  console.log('/vktapi/v1/getcurrencies', req);
  let currencies = JSON.parse('{}');

  currencies.code = 0;
  currencies.message = 'ok';
  currencies.data = vktdatav_vktoken_currencies;

  res.json(currencies);
});

// 路由scatter prices数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/vktapi/v1/prices', defaultLimiter, async (req, res) => {

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

app.post('/vktapi/v1/create_vkt', createAccountLimiter, async (req, res) => {

  console.log('/vktapi/v1/create_vkt', req.body);
  if (!Ut.isEmpty(String(req.body.signature)) && !Ut.isEmpty(String(req.body.keys.active)) &&
     !Ut.isEmpty(String(req.body.transaction_id)) && req.body.transaction_id === "vankiawallet") {
    let sig = req.body.signature;
    let pubkeyactive = req.body.keys.active;
    let pubkeyowner = req.body.keys.owner;
    let actname = req.body.account_name;

    console.log('Public Key:\t', pubkeyactive) // VKTkey...
    let checkHash = ecc.verify(sig, pubkeyactive, pubkeyactive);
    console.log('/vktapi/v1/create_vkt - checkHash=', checkHash);

    const result = await api.transact({
      actions: [{
          account: 'eosio',
          name: 'newaccount',
          authorization: [{
            actor: 'createaccout',
            permission: 'active',
          }],
          data: {
            creator: 'createaccout',
            name: actname,
            owner: {
              threshold: 1,
              keys: [{
                key: pubkeyowner,
                weight: 1
              }],
              accounts: [],
              waits: []
            },
            active: {
              threshold: 1,
              keys: [{
                key: pubkeyactive,
                weight: 1
              }],
              accounts: [],
              waits: []
            },
          },
        },
        {
          account: 'eosio',
          name: 'buyrambytes',
          authorization: [{
            actor: 'createaccout',
            permission: 'active',
          }],
          data: {
            payer: 'createaccout',
            receiver: actname,
            bytes: 8192,
          },
        },
        {
          account: 'eosio',
          name: 'delegatebw',
          authorization: [{
            actor: 'createaccout',
            permission: 'active',
          }],
          data: {
            from: 'createaccout',
            receiver: actname,
            stake_net_quantity: '0.1500 VKT',
            stake_cpu_quantity: '0.5000 VKT',
            transfer: false,
          }
        }
      ]
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });
    /*
      const result = await api.transact({
        actions: [{
          account: 'eosio.token',
          name: 'transfer',
          authorization: [{
            actor: 'makeaccounts',
            permission: 'active',
          }],
          data: {
            from: 'makeaccounts',
            to: 'tokyoliyi',
            quantity: '0.0100 VKT',
            memo: 'VKT test',
          },
        }]
      }, {
        blocksBehind: 3,
        expireSeconds: 30,
      });
      console.dir(result);
    */
    console.log("newaccount result = ", result);
    res.json(JSON.parse('{"created" : true}'));
  } else {
    res.json(JSON.parse('{}'));
  }
});


// 路由scatter 多语言数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/vktapi/v1/languages', defaultLimiter, async (req, res) => {

  let file;
  let Isfound = false;
  let lang = JSON.parse('{}');
  if (!Ut.isEmpty(String(req.query.names))) {
    console.log('/vktapi/v1/languages?names=', req.query.names);
    file = path.join(__dirname, './data/lang/1.json');
    lang = JSON.parse(fs.readFileSync(file));
    res.json(lang);
    return;
  }
  if (!Ut.isEmpty(String(req.query.name))) {
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
app.use('/vktapi/v1/account/vkt/:account_id', defaultLimiter, async (req, res) => {

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

  if(balances.length === 0){
    balances.push("0.0000 VKT");
  }

  vktdatav_accounts_info.account_name = accountInfo.account_name;
  vktdatav_accounts_info.balances = JSON.parse('[]');

  const lockedbalance = await rpc.get_table_rows({
    json: true,              // Get the response as json
    code: 'eosio.token',     // Contract that we target
    scope: accountid,         // Account that owns the data
    table: 'locked',        // Table name
    limit: 10,               // maximum number of rows that we want to get
    reverse: true,
  });

  console.log(lockedbalance)

  let amountlocked = 0.0;
  let unlockdate ;
  for (let i in balances) {
    let balarr = balances[i].split(" ");
    if(balarr[1] === "VKT" && lockedbalance.rows.length > 0){
      amountlocked = lockedbalance.rows[i].total_balance.split(' ')[0];
      unlockdate = moment.utc(lockedbalance.rows[i].balances[0].unlock_execute_time, moment.ISO_8601).local().format();
    }else{
      amountlocked = 0.0;
      unlockdate = moment().format();
    }
    vktdatav_accounts_info.balances.push({
      contract: "eosio.token",
      amount: balarr[0],
      amountlocked: amountlocked,
      availableamount: balarr[0] - amountlocked,
      unlockdate: unlockdate,
      currency: balarr[1],
      decimals: balarr[0].split(".")[1].length,
      locked_balances:JSON.parse('[]')
    });
    if(balarr[1] === "VKT" && lockedbalance.rows.length > 0){
      for(let j in lockedbalance.rows[i].balances){
        vktdatav_accounts_info.balances[i].locked_balances.push({
          balance:lockedbalance.rows[i].balances[j].balance.split(' ')[0],
          unlock_execute_time:moment.utc(lockedbalance.rows[i].balances[j].unlock_execute_time, moment.ISO_8601).local().format()
        });  
      }
    }
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
app.use('/vktapi', defaultLimiter, async (req, res) => {

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

  //获取jsons数据 //TODO
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

}, 18000);

const intervalObj5 = setInterval(async () => {

  //获取jsons数据
  const datadb = await runMongodbTPSList().catch(err => {
    console.log("mongodb error: ", err)
  });
  console.log("nodejs app passed runMongodbTPSList!!!");

}, 10000);

const scheduleCronCleanIPBlackList = async ()=>{
  //每分钟的第30秒定时执行一次:
  schedule.scheduleJob('0 0 1 * * *', async()=>{
    console.log('runCleanIPBlackList:' + new Date());

    //获取jsons数据
    const datadb = await runCleanIPBlackList().catch(err => {
      console.log("runCleanIPBlackList error: ", err)
    });
    console.log("nodejs app passed runCleanIPBlackList!!!");

  });
}

scheduleCronCleanIPBlackList();

// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runCleanIPBlackList = async () => {

let keyPrefix = 'IP_ADDRESS_'

await keysAsync( keyPrefix + '*').then(async(ipAddrs) => {

  await async.eachSeries(ipAddrs,async(ipAddr, cb) =>{
    // await getAsync(accountTrx).then(async(value) => {
    // });
    await delAsync(ipAddr).then(async(reply) => {
      if(reply) {
        console.log(reply)
      }
    });
  });
});

}

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
  // { rows: 
  //   [ { owner: 'vktbeijing',
  //       total_votes: '1578603255546462464.00000000000000000',
  //       producer_key: 'VKT8mVLMTiuocf8n89uHxhdPYjZrDkpgRYE8tW6N8bGK2GJpBM94R',
  //       is_active: 1,
  //       url: 'http://vankia.io/vktbeijing',
  //       unpaid_blocks: 1568563,
  //       last_claim_time: 0,
  //       location: 0 },
  //     { owner: 'vktqingdao',
  //       total_votes: '1578603255546462464.00000000000000000',
  //       producer_key: 'VKT53u9A41ZHmbhNEcst7rM6vCXKSppufbNQmsNVQKQukgLhmbAMk',
  //       is_active: 1,
  //       url: 'http://vankia.io/vktqingdao',
  //       unpaid_blocks: 1385845,
  //       last_claim_time: 0,
  //       location: 0 },
 

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
    //vktdatav_producers_list = [];
    //vktdatav_producer_location = [];
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

    let i = 0;
    await async.eachSeries(producersinfo.rows,async(producer, cb) =>{

        dumapLocal_start = producer.url.indexOf("vkt") + 3;

        if (dumapLocal_start > 3) {
          dumapLocal_en = producer.url.substr(dumapLocal_start, producer.url.length - dumapLocal_start)
        }
        console.log("start ---- 1", dumapLocal_en)
        if (dumapLocal_en != "" ) {
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

                  if (producer.is_active == 1) {

                    vktdatav_producer_location.push({
                      lat: JSON.parse(sres.text).result.location.lat,
                      lng: JSON.parse(sres.text).result.location.lng,
                      value: 100
                    });
                    //res.send(sres.text);
                    vktdatav.producers.push({
                      owner: producer.owner,
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
                    if(producer.owner === "vktbeijing"){
                    vktdatav_producers_list.push({
                      "name": "vktjingjinji",
                      "location": "京津冀地区",
                      "state": producer_state
                    })
                    }
                    else if(producer.owner === "vktshenzhen"){
                    vktdatav_producers_list.push({
                      "name": "vktlangfang",
                      "location": "廊坊",
                      "state": producer_state
                    })
                    }
                    else if(producer.owner === "vktshanghai"){
                    vktdatav_producers_list.push({
                      "name": "vkttongzhou",
                      "location": "通州",
                      "state": producer_state
                    })
                    }
                    else if(producer.owner === "vktchengdu"){
                    vktdatav_producers_list.push({
                      "name": "vktwuqing",
                      "location": "武清",
                      "state": producer_state
                    })
                    }else{
                    vktdatav_producers_list.push({
                      "name": producer.owner,
                      "location": dumapLocal_cn,
                      "state": producer_state
                    })
                    }
                    console.log("end ---- 1", dumapLocal_cn)
                  }
                })
            }
          }).catch(err => {
            console.error(err);
          });
        }
        i++;
      });
    }

  return (vktdatav);

};

// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runMongodb = async () => {


  MongoClient.connect(MONGO_URL, { useNewUrlParser: true }, async function (err, db) {
    if (err) {
      console.error(err);
      throw err;
    }
    const dbo = db.db("VKT");
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
      setTimeout(function(){
        db.close();
      },50);
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
      setTimeout(function(){
        db.close();
      },50);
    });
    if (false) {
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
                "value": m_maxtps_onehour,
                "url": ""
              }];
            }
            setTimeout(function(){
              db.close();
            },50)
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
            setTimeout(function(){
              db.close();
            },50)
          });
        });
    }
  });

  return vktdatav;
}

// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runMongodbTPSList = async () => {


  MongoClient.connect(MONGO_URL, { useNewUrlParser: true }, async function (err, db) {
    if (err) {
      console.error(err);
      throw err;
    }
    const dbo = db.db("VKT");
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
                vktdatav_tpslist[i].s = i + 1;
              });
            }
          } else {
            vktdatav_tpslist = JSON.parse('[]');
            for (let i = 0; i < 12; i++) {
              await Promise.resolve(i).then(async (i) => {
                vktdatav_tpslist.push({
                  'x': vktdatav.head_block_num - 12 + i,
                  'y': parseInt(0),
                  's': i + 1
                });
              });
            }
          }
          setTimeout(function(){
            db.close();
          },50)
        });
      });
  });
  return vktdatav;
}

// rpc对象支持promise，所以使用 async/await 函数运行rpc命令
const runCcxt = async () => {

  let vktkline_7day = [];
  let vktkline_YMD = "";
  let vkteth24_info = {};
  let ethusd24_info = {};

  const symbol_vkteth = 'VKT/ETH';

  //获取VKT/ETH 24小时 交易量jsons数据
  await superagent.get(HOTBIT_API + '/v1/market.status24h').end(async (err, sres) => {
    if (err) {
      console.log('err:', err);
      return;
    }
    vkteth24_info = JSON.parse(sres.text).VKTETH;
    ethusd24_info = JSON.parse(sres.text).ETHUSD;
 
    // console.log(vkteth24_info);
    // console.log(ethusd24_info);

    let enddate = moment(moment().format("YYYY-MM-DD")).format('X');
    // console.log(enddate);
    let startdate = moment(moment().format("YYYY-MM-DD")).format('X') - 3600 * 24 * 7;
    // console.log(startdate);

    // get vkteth price from before 7day to now 
    //https://api.hotbit.io/api/v1/market.kline?market=ETH/BTC&start_time=1521100000&end_time=1521101193&interval=60
    await superagent.get(HOTBIT_API + '/v1/market.kline?market=VKT/ETH&start_time=' + startdate + '&end_time=' + enddate + '&interval=86400').end(async (err, sres) => {
      if (err) {
        console.log('err:', err);
        return;
      }

      vktkline_7day = JSON.parse(sres.text).result;
      // console.log(ohlcvkteth);
      const currentvktethPrice = vkteth24_info.last; // current closing price
      const currentethusdPrice = ethusd24_info.last; // current closing price
      const last1dPrice = vktkline_7day[1][3]; // 1d ago closing price
      const last1wPrice = vktkline_7day[vktkline_7day.length - 1][3]; // 1w ago closing price
      // console.log(last7dTime);
      // console.log(last1hPrice);
      // console.log(last1dPrice);
      // console.log(last1wPrice);

      vktdatav.vktusdlast7d = JSON.parse('[]');
      vktdatav_vktprice_list = JSON.parse('[]');


      vktkline_YMD = moment().format("YYYY/MM/DD");
      vktdatav.vktusdlast7d.push({
        'price': (currentvktethPrice * currentethusdPrice).toFixed(8),
        'date': vktkline_YMD
      });
      vktdatav_vktprice_list.push({
        'x': vktkline_YMD,
        'y': (currentvktethPrice * currentethusdPrice).toFixed(8)
      });

      vktdatav_cnyusd_price = [{
        // "name": "",
        "value": (vktdatav.usdcny * vktdatav_vktprice_list[0].y).toFixed(8)
      }];

      vktdatav_vkttracker_info = {
        'price_vktcny': (vktdatav.usdcny * vktdatav_vktprice_list[0].y).toFixed(8),
        'price_vkteth': (currentvktethPrice * 1.0).toFixed(8),
        'volume_24h': vkteth24_info.volume,
        'circulating_supply': 500000000,
        'total_supply': 1000000000,
        'percent_change_1d': ((currentvktethPrice - last1dPrice) / last1dPrice).toFixed(8),
        'percent_change_7d': ((currentvktethPrice - last1wPrice) / last1wPrice).toFixed(8)
      };
      // console.log(vktdatav_vkttracker_info);
    });
  });
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
  if (vktdatav.vktusdlast7d && vktdatav.vktusdlast7d.length > 0) {
    console.log("runScatterPrices vktdatav.vktusdlast7d.length=" ,vktdatav.vktusdlast7d.length);
    vktdatav_allprices = prices;
    vktdatav_allprices["vkt:eosio.token:vkt"] = {
      USD: (vktdatav.vktusdlast7d[0].price * 1.0).toFixed(8),
      EUR: (vktdatav.vktusdlast7d[0].price * vktdatav.currencies.EUR).toFixed(8),
      CNY: (vktdatav.vktusdlast7d[0].price * vktdatav.currencies.CNY).toFixed(8),
      GBP: (vktdatav.vktusdlast7d[0].price * vktdatav.currencies.GBP).toFixed(8),
      JPY: (vktdatav.vktusdlast7d[0].price * vktdatav.currencies.JPY).toFixed(8),
      CAD: (vktdatav.vktusdlast7d[0].price * vktdatav.currencies.CAD).toFixed(8),
      CHF: (vktdatav.vktusdlast7d[0].price * vktdatav.currencies.CHF).toFixed(8),
      AUD: (vktdatav.vktusdlast7d[0].price * vktdatav.currencies.AUD).toFixed(8),
      KRW: (vktdatav.vktusdlast7d[0].price * vktdatav.currencies.KRW).toFixed(8),
    };
    vktdatav.allprices = vktdatav_allprices;
  }

  // console.log(currencies)
}

function addusertoMG(accountName,registIp,inviteCode) {
  try {
    const ipquery = new IP2Region();
    let ipres = ipquery.search(registIp);
    let user_info = JSON.parse('{}');
    user_info.accountName = accountName;
    user_info.registIp = registIp;
    user_info.inviteCode = inviteCode;
    user_info.registPlace = ipres.country + " - " + ipres.province + " - " + ipres.city + " - " + ipres.isp;

    // make client connect to mongo service
    MongoClient.connect(MONGO_URL, { useNewUrlParser: true }, function(err, db) {
      if (err) throw err;

      const dbo = db.db("VKT");

      // db pointing to newdb
      console.log("Switched to "+dbo.databaseName+" database");

        dbo.collection("InviteCode").find({
          "inviteCode": {
            $regex:inviteCode,
            $options:'i'
          }
        }).toArray(async function (err, result) {
          if (err) throw err;
          if (result.length >= 1) {
            user_info.inviteAccountName = result[0].name;
            console.log(result)
            request.post({
              url: BGAPI_URL+'/walletUser/add',
              json: user_info
            }, 
            (error, res2, body) => {
              if (error) {
                console.error(error)
                return true
              }
              console.log(body)
            })
            setTimeout(function(){
              db.close();
            },50)
          }else{
            console.log("InviteCode not exist!");
            setTimeout(function(){
              db.close();
            },50)
          }
        });
    });
    return true
  } catch (k) {
    return false
  }
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

function amount_to_decimal(amount) {
  let s;
  if (amount.amount[0] === '-')
      s = '-' + amount.amount.substr(1).padStart(amount.precision + 1, '0');
  else
      s = amount.amount.padStart(amount.precision + 1, '0');
  return s.substr(0, s.length - amount.precision) + '.' + s.substr(s.length - amount.precision);
}

function format_extended_asset(amount, number_size = 0) {
  return amount_to_decimal(amount).padStart(number_size, ' ') + ' ' + amount.symbol;
}

// 监听端口、打开浏览器
// app.listen(NODE_PORT, function () {
//   if (isOpenWin === 'false') {
//     let uri = 'http://' + utils.getIP() + ':' + port + '/api';
//     opn(uri);

//     // 设置窗口打开标识
//     utils.localStorage().setItem('ISOPENWIN', 'true');

//     console.log("mock server start success.".green);
//   }
// });

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

//获取外网ip
var getNetIp = function(_http) {
  var ipStr = _http.headers['X-Real-IP'] || _http.headers['x-forwarded-for'];
  console.log(ipStr)
  if (ipStr) {
    var ipArray = ipStr.split(",");
    if (ipArray.length > 1) { //如果获取到的为ip数组
      for (var i = 0; i < ipArray.length; i++) {
        var ipNumArray = ipArray[i].split(".");
        var tmp = ipNumArray[0] + "." + ipNumArray[1];
        if (tmp == "192.168" || (ipNumArray[0] == "172" && ipNumArray[1] >= 16 && ipNumArray[1] <= 32) || tmp == "10.7") {
          continue;
        }
        return ipArray[i];
      }
    }
    return ipArray[0];
  } else { //获取不到时
    return _http.ip.substring(_http.ip.lastIndexOf(":") + 1);
  }
};