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
// import GeoIP-lite
const geoip = require('geoip-lite');
const superagent = require('superagent');
const translate = require('google-translate-api');
// 载入配置文件
const config = require('./config');
const fs = require('fs');
const moment = require('moment');
const request = require('request');
const Ut = require("./common");
const util = require('util');
require('colors');
const {
  Api,
  JsonRpc,
  RpcError,
} = require('ttmcjs');
const ecc = require("ttmcjs-ecc");
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
const defaultPrivateKey = config.defaultPrivateKey;

const http = require('http');
const https = require('https');
let privateKey  = fs.readFileSync('./data/server.key', 'utf8');
let certificate = fs.readFileSync('./data/server.crt', 'utf8');
let credentials = {key: privateKey, cert: certificate};

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

let m_lasttrxid = JSON.parse('[]');

// 创建express
const app = express();

const JsSignatureProvider = require('ttmcjs/dist/eosjs-jssig').default;
const signatureProvider = new JsSignatureProvider([defaultPrivateKey]);;

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


// 路由android 用户信息
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json());
app.post('/api_oc_personal/v1.0.0/:path_param1', async (req, res) => {

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
    console.log('/api_oc_blockchain-v1.0.0/get_token_info', req.body);
    let asset = JSON.parse('{}');
    let accountName = req.body.accountName;
    //获取账号xxxx的资产,查询资产的时候要加上资产的合约名字eosio.token
    const balances = await rpc.get_currency_balance('eosio.token', req.body.accountName);
    console.log(balances);

    if(balances.length === 0){
      balances.push("0.0000 TTMC");
    }

    let vkt_balance = '';
    for (let i in balances) {
      let balarr = balances[i].split(" ");
      if (balarr[1] === "TTMC") {
        vkt_balance = balarr[0];
      }
    }

    const lockedbalance = await rpc.get_table_rows({
      json: true,              // Get the response as json
      code: 'eosio.token',     // Contract that we target
      scope: accountName,         // Account that owns the data
      table: 'locked',        // Table name
      limit: 10,               // maximum number of rows that we want to get
    });
  
    console.log(lockedbalance)
  
    let amountlocked = 0.0;
    try{
      let balarr = balances[0].split(" ");
      if(balarr[1] === "TTMC" && lockedbalance.rows.length > 0){
        amountlocked = lockedbalance.rows[0].total_balance.split(' ')[0];
      }
    } catch (error) {
      amountlocked = 0.0;
    }
    asset.code = 0;
    asset.message = 'ok';
    asset.data = JSON.parse('[]');
    asset.data.push(
      {
        contract_name: "eosio.token",
        token_symbol: "TTMC",
        coinmarket_id: "bitforex",
        account_name: accountName,
        balance: vkt_balance,
        locked_amount: amountlocked,
        balance_usd: vkt_balance * vktdatav_allprices["vkt:eosio.token:vkt"].USD,
        balance_cny: vkt_balance * vktdatav_allprices["vkt:eosio.token:vkt"].CNY,
        asset_price_usd: vktdatav_allprices["vkt:eosio.token:vkt"].USD,
        asset_price_cny: vktdatav_allprices["vkt:eosio.token:vkt"].CNY,
        asset_price_change_in_24h: (vktdatav_vkttracker_info.percent_change_1d * 100.0).toFixed(2),
        iconUrl: "http://192.178.1.64:3030/images/ttmc.png",
        iconUrlHd: "http://192.178.1.64:3030/images/ttmc.png",
        asset_market_cap_cny: vkt_balance * vktdatav_allprices["vkt:eosio.token:vkt"].CNY * 500000000,
        isRedpacket: true
      }
    );

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

    res.json(asset);
    //TODO
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
          assetName: 'TTMC',
          contractName: 'eosio.token',
          coinmarketId: 'bitforex',
          iconUrl: 'http://tracker.devicexx.com/assets/logo.png',
          iconUrlHd: 'http://tracker.devicexx.com/assets/logo.png',
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
    assets.data.assetCategoryList.push('TTMC');
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
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json());
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
    if (path_param2 === "add_new_ttmc") {
      console.log('/api_oc_personal/v1.0.0/user/add_new_ttmc', req.body);
      let auth = JSON.parse('{}');
      auth.code = 0;
      auth.message = 'ok';
      if (req.body.ownerKey != undefined && req.body.activeKey != undefined &&
        req.body.uid != undefined && req.body.ttmcAccountName != undefined &&
        req.body.ownerKey.substring(0,4) === 'TTMC' &&
        req.body.activeKey.substring(0,4) === 'TTMC' &&
        req.body.ownerKey.length === 54 &&
        req.body.activeKey.length === 54) {

        let pubkeyactive = req.body.activeKey;
        let pubkeyowner = req.body.ownerKey;
        let actname = req.body.ttmcAccountName;
    
        console.log('Public Key:\t', pubkeyactive) // VKTkey...
        let checkpubkeyactive = ecc.isValidPublic(pubkeyactive, 'TTMC');
        console.log('/api_oc_personal/v1.0.0/user/add_new_ttmc - checkpubkeyactive=', checkpubkeyactive);
        let checkpubkeyowner = ecc.isValidPublic(pubkeyowner, 'TTMC');
        console.log('/api_oc_personal/v1.0.0/user/add_new_ttmc - checkpubkeyowner=', checkpubkeyowner);
        try {
          const result = await api.transact({
            actions: [{
                account: 'eosio',
                name: 'newaccount',
                authorization: [{
                  actor: 'makeaccounts',
                  permission: 'active',
                }],
                data: {
                  creator: 'makeaccounts',
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
                  actor: 'makeaccounts',
                  permission: 'active',
                }],
                data: {
                  payer: 'makeaccounts',
                  receiver: actname,
                  bytes: 8192,
                },
              },
              {
                account: 'eosio',
                name: 'delegatebw',
                authorization: [{
                  actor: 'makeaccounts',
                  permission: 'active',
                }],
                data: {
                  from: 'makeaccounts',
                  receiver: actname,
                  stake_net_quantity: '0.1500 TTMC',
                  stake_cpu_quantity: '0.5000 TTMC',
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
      return;
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
    if (path_param2 === "toggleTtmcMain") {
      console.log('/api_oc_personal/v1.0.0/user/toggleTtmcMain', req.body);
      let msgs = JSON.parse('{}');
      msgs.code = 0;
      msgs.message = 'ok';
      msgs.data = 'YES';
      res.json(msgs);
      return;
    }
    if (path_param2 === "getTtmcAccount") {
      console.log('/api_oc_personal/v1.0.0/user/getTtmcAccount', req.body);
      let account = JSON.parse('{}');
      account.code = 0;
      account.message = 'success';
      account.data = 'tokyoliyi123';
      
      res.json(account);
      return;
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
  }

});

// 路由scatter 多语言数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/api_oc_personal/v1.0.0/:path_param1', async (req, res) => {

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
    ios_version.data.uploadUrl = 'https://github.com/vankiaio/PocketVKT-IOS';
    ios_version.data.versionDetail = '0.9.0'
    ios_version.data.versionCode = '090'
    ios_version.data.versionName = '0.9.0'
    console.log(ios_version);
    res.json(ios_version);
  }else   if (path_param1 === "recommend_dapp") {
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
      dappUrl:'http://bc.qzbdata.com',
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
      dappUrl:'http://bc.qzbdata.com',
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
      dappUrl:'http://bc.qzbdata.com',
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
      dappUrl:'http://bc.qzbdata.com',
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
      dappUrl:'http://bc.qzbdata.com',
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
        dappUrl:'http://bc.qzbdata.com',
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
        dappUrl:'http://bc.qzbdata.com',
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
      assetName: '万加链',
      selected: true
    });
    assetCategory.data.push({
      id:'2',
      assetName: '区块链新闻',
      selected: true
    });
    assetCategory.data.push({
      id:'3',
      assetName: '币圈大佬',
      selected: true
    });
    console.log(assetCategory);
    res.json(assetCategory);
  } else if (path_param1 === "get_pocketttmc_info") {
    console.log('/api_oc_personal/v1.0.0/get_pocketttmc_info', req.query);
    let pocketttmc_info = JSON.parse('{}');
    
    pocketttmc_info.code = 0;
    pocketttmc_info.message = 'ok';
    pocketttmc_info.data = JSON.parse('{}');
    pocketttmc_info.data.weChatOfficialAccount = 'TTMC Platform';
    pocketttmc_info.data.weChat = 'ttmc_asst';
    pocketttmc_info.data.officiaWebsite = 'http://www.ttmc.io';
    pocketttmc_info.data.companyProfile = 'TTMC는 데이터이력추적과 관련해 연구해온 중국 칭화대학교 청죽 빅데이타 연구소와 마이크로니들 기술을 갖고 있는 일본 동경대학교의 기술 합작으로 만들어낸 메디컬 블록체인으로 블록체인 기술을 활용하여 제품에 대한 정보, 거래이력에 대한 정보 등등 제품 및 서비스의 유통과 관련한 Data를 축적하고, Data가 필요한 사용자들이 이를 활용할 수 있는 Big Data Platform을 제공하려고 한다. Data를 제공하는 정보제공자나 Data를 활용하는 측은 TTMC Platform에 정보를 제공하거나 제공받을 수 있고 이를 위해 TTMC Coin을 거래수단으로 활용하게 된다.';
    
    console.log(pocketttmc_info);
    res.json(pocketttmc_info);
  }
});

// 路由android blockchain信息
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json());
app.post('/api_oc_blockchain-v1.0.0/:path_param1', async (req, res) => {

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
      balances.push("0.0000 TTMC");
    }

    let vkt_balance = 0;
    for (let i in balances) {
      let balarr = balances[i].split(" ");
      if (balarr[1] === "TTMC") {
        vkt_balance = balarr[0];
      }
    }

    const lockedbalance = await rpc.get_table_rows({
      json: true,              // Get the response as json
      code: 'eosio.token',     // Contract that we target
      scope: accountName,         // Account that owns the data
      table: 'locked',        // Table name
      limit: 10,               // maximum number of rows that we want to get
    });
  
    console.log(lockedbalance)
  
    let amountlocked = 0.0;
    try{
      let balarr = balances[0].split(" ");
      if(balarr[1] === "TTMC" && lockedbalance.rows.length > 0){
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

// 路由scatter 多语言数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/api_oc_blockchain-v1.0.0/:path_param1', async (req, res) => {

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
app.use('/oulianttmcaccount/getAccountOrder/:path_param1/:path_param2', async (req, res) => {

  let path_param1 = req.params.path_param1;
  let path_param2 = req.params.path_param2;
  let accountorder = JSON.parse('{}');

  console.log('/oulianttmcaccount/getAccountOrder/',path_param1,path_param2, req.body);

  // if (path_param1.indexOf("null") === -1  && path_param1.length >= 5 && path_param1.length <= 12 ) {

  //   // 获取账号qingzhudatac的信息
  //   // const chaininfo = await rpc.get_info();
  //   // console.log(chaininfo);
  //   try {
  //     const accountInfo = await rpc.get_account(path_param1);
  //     console.log(accountInfo);
      accountorder.code = 0;
      accountorder.message = 'ok';
      accountorder.data = JSON.parse('{}');
      accountorder.data.createStatus = 1;
      accountorder.data.accountName = path_param1;
      accountorder.data.message = 'ok';
      console.log(accountorder);
      res.json(accountorder);
  //   } catch (error) {
  //     accountorder.code = 0;
  //     accountorder.message = 'ok';
  //     accountorder.data = JSON.parse('{}');
  //     accountorder.data.createStatus = 0;
  //     accountorder.data.accountName = path_param1;
  //     accountorder.data.message = 'Account does not exist!';
  //   }
  // }else{
  //   accountorder.code = 0;
  //   accountorder.message = 'ok';
  //   accountorder.data = JSON.parse('{}');
  //   accountorder.data.createStatus = 0;
  //   accountorder.data.accountName = path_param1;
  //   accountorder.data.message = 'Account does not exist!';
  // }
});

// 路由scatter 多语言数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/oulianttmcaccount/:path_param1', async (req, res) => {

  let path_param1 = req.params.path_param1;
  // let path_param2 = req.params.path_param2;

  if (path_param1 === "getAccountCreateResource" ) {
    console.log('/oulianttmcaccount/getAccountCreateResource',path_param1, req.body);
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

// 路由IOS blockchain history信息
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json());
app.post('/VX/:path_param1', async (req, res) => {

  let path_param1 = req.params.path_param1;

  console.log(path_param1);
  console.log(req.body);
  if (path_param1 === "GetActions") {
    console.log('/VX/GetActions', req.body);
    let accounts = JSON.parse('{}');
    let start_pos = req.body.page * req.body.pageSize;
    let req_json = JSON.stringify({"pos":start_pos,"offset":req.body.pageSize,"account_name":req.body.from});
    // let req_json = JSON.stringify({"pos":"-1","offset":-1,"account_name":req.body.from});
    console.log(req_json)
    request.post({
      url: VKTAPI_URL+'/v1/history/get_actions',
      form: req_json
    }, 
    (error, res2, body) => {
      if (error) {
        console.error(error);
        return;
      }
      // console.log(body);
      accounts.code = 0;
      accounts.message = "ok";
      accounts.data = JSON.parse('{}');
      accounts.data.pageSize = 1;
      accounts.data.page = 1;
      accounts.data.hasMore = 0;
      accounts.data.actions = JSON.parse('[]');
      let quantity ;
      let quantityarr;
      let index = 0;
      console.log(m_lasttrxid);
      for (let i in JSON.parse(body).actions) {
        if(m_lasttrxid[req.body.from] == JSON.parse(body).actions[i].action_trace.trx_id &&
        JSON.parse(body).actions.length > 1) {
          continue;
        }
        accounts.data.actions.push({"doc": JSON.parse(body).actions[i].action_trace.act});
        accounts.data.actions[index].doc.data.expiration = JSON.parse(body).actions[i].action_trace.block_time;
        if(accounts.data.actions[index].doc.data.from === "eosio"){
          accounts.data.actions[index].doc.data.from = "ttmcio";
        }
        accounts.data.actions[index].trxid = JSON.parse(body).actions[i].action_trace.trx_id;
        accounts.data.actions[index].blockNum = JSON.parse(body).actions[i].action_trace.block_num;
        accounts.data.actions[index].time = JSON.parse(body).actions[i].action_trace.block_time;
        accounts.data.actions[index].cpu_usage_us = JSON.parse(body).actions[i].action_trace.cpu_usage;
        accounts.data.actions[index].net_usage_words = "bytes";
        quantity = JSON.parse(body).actions[i].action_trace.act.data.quantity;
        if(quantity != undefined){
          quantityarr = quantity.split(" ");
        }else{
          quantityarr = "0.0 TTMC".split(" ");
        }
        accounts.data.actions[index].amount = quantityarr[0];
        accounts.data.actions[index].assestsType = quantityarr[1];
        //for netxt page Deduplication
        m_lasttrxid[req.body.from] = accounts.data.actions[index].trxid;
        index ++;
      }
      console.log(util.inspect(accounts, false, null, true))
      res.json(accounts);
    })
  }else if (path_param1 === "GetAssetsLockRecords") {
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
      balances.push("0.0000 TTMC");
    }

    const lockedbalance = await rpc.get_table_rows({
      json: true,              // Get the response as json
      code: 'eosio.token',     // Contract that we target
      scope: accountid,         // Account that owns the data
      table: 'locked',        // Table name
      limit: 10,               // maximum number of rows that we want to get
    });
  
    console.log(lockedbalance)
  
    let amountlocked = 0.0;
    let unlockdate ;
    for (let i in balances) {
      let balarr = balances[i].split(" ");
      if(balarr[1] === "TTMC" && lockedbalance.rows.length > 0){
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

      if(balarr[1] === "TTMC" && lockedbalance.rows.length > 0){
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

});


// 路由scatter 多语言数据
//app.use('/vktapi', mockjs(path.join(__dirname, './data')));
app.use('/api_oc_pe_candy_system/:path_param1/:path_param2', async (req, res) => {

  let path_param1 = req.params.path_param1;
  let path_param2 = req.params.path_param2;

  if (path_param1 === "get_candy_score") {
    console.log('/api_oc_pe_candy_system/get_candy_score', req.body);
    let candy_score = JSON.parse('{}');

    candy_score.code = 0;
    candy_score.message = 'ok';
    // 获取账号qingzhudatac的信息

    candy_score.data = JSON.parse('{}');
    candy_score.data.scoreNum = 2019888;
    res.json(candy_score);
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

app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json());
app.post('/vktapi/v1/create_vkt', async (req, res) => {

  console.log('/vktapi/v1/create_vkt', req.body);
  if (req.body.signature != undefined && req.body.keys.active != undefined &&
    req.body.transaction_id != undefined && req.body.transaction_id === "ttmcwallet") {
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
            actor: 'makeaccounts',
            permission: 'active',
          }],
          data: {
            creator: 'makeaccounts',
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
            actor: 'makeaccounts',
            permission: 'active',
          }],
          data: {
            payer: 'makeaccounts',
            receiver: actname,
            bytes: 8192,
          },
        },
        {
          account: 'eosio',
          name: 'delegatebw',
          authorization: [{
            actor: 'makeaccounts',
            permission: 'active',
          }],
          data: {
            from: 'makeaccounts',
            receiver: actname,
            stake_net_quantity: '0.1500 TTMC',
            stake_cpu_quantity: '0.5000 TTMC',
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
            quantity: '0.0100 TTMC',
            memo: 'TTMC test',
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

  if(balances.length === 0){
    balances.push("0.0000 TTMC");
  }

  vktdatav_accounts_info.account_name = accountInfo.account_name;
  vktdatav_accounts_info.balances = JSON.parse('[]');

  const lockedbalance = await rpc.get_table_rows({
    json: true,              // Get the response as json
    code: 'eosio.token',     // Contract that we target
    scope: accountid,         // Account that owns the data
    table: 'locked',        // Table name
    limit: 10,               // maximum number of rows that we want to get
  });

  console.log(lockedbalance)

  let amountlocked = 0.0;
  let unlockdate ;
  for (let i in balances) {
    let balarr = balances[i].split(" ");
    if(balarr[1] === "TTMC" && lockedbalance.rows.length > 0){
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
    if(balarr[1] === "TTMC" && lockedbalance.rows.length > 0){
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
      if (!IsLoadingRPCPRODUCER && vktdatav_producers_list.length >= 3) {
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
  //  const data = await runRpcGetProducers().catch(err => {
  //    console.log("runRpcGetProducers error: ", err)
  //  });

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
    const dbo = db.db("TTMC");
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
    const dbo = db.db("TTMC");
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
  // console.log(ticker_vkteth);

  // get ethusd price
  let bittrex = new ccxt.bittrex();
  //bittrex.proxy = 'https://cors-anywhere.herokuapp.com/';
  // load all markets from the exchange
  markets = await bittrex.loadMarkets();

  const symbol_ethusd = 'ETH/USD';
  if (symbol_ethusd in bittrex.markets) {
    ticker_ethusd = await bittrex.fetchTicker(symbol_ethusd);
  }
  // console.log(ticker_ethusd);

  console.log("get markets finish sleep start!!!", new Date());
  await Ut.sleep(5000);
  console.log("get markets finish sleep end!!!", new Date());
  // get vkteth 1hour price
  const ohlcvkteth = await bitforex.fetchOHLCV(symbol_vkteth, '1d', 8);
  if(ohlcvkteth.length < 7 ) {
    console.log("ohlcvkteth fetchOHLCV failed!!!");
    return;
  }
  // console.log(ohlcvkteth);
  const last7dTime = ohlcvkteth[0].time; // 1h ago closing time
  const currentPrice = ohlcvkteth[ohlcvkteth.length - 1].close; // current closing price
  const last1dPrice = ohlcvkteth[ohlcvkteth.length - 2].close; // 1d ago closing price
  const last1wPrice = ohlcvkteth[1].close; // 1w ago closing price
  // console.log(last7dTime);
  // console.log(last1hPrice);
  // console.log(last1dPrice);
  // console.log(last1wPrice);

  const ohlcethusd = await bittrex.fetchOHLCV(symbol_ethusd, '1d', last7dTime, 7);
  if(ohlcethusd.length < 7 ) {
    console.log("ohlcethusd fetchOHLCV failed!!!");
    return;
  }
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
    "value": (vktdatav.usdcny * vktdatav_vktprice_list[6].y).toFixed(8)
  }];

  vktdatav_vkttracker_info = {
    'price_vktcny': (vktdatav.usdcny * vktdatav_vktprice_list[6].y).toFixed(8),
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
  if (vktdatav.vktusdlast7d && vktdatav.vktusdlast7d.length > 6) {
    console.log("runScatterPrices vktdatav.vktusdlast7d.length=" ,vktdatav.vktusdlast7d.length);
    vktdatav_allprices = prices;
    vktdatav_allprices["vkt:eosio.token:vkt"] = {
      USD: (vktdatav.vktusdlast7d[6].price * 1.0).toFixed(8),
      EUR: (vktdatav.vktusdlast7d[6].price * vktdatav.currencies.EUR).toFixed(8),
      CNY: (vktdatav.vktusdlast7d[6].price * vktdatav.currencies.CNY).toFixed(8),
      GBP: (vktdatav.vktusdlast7d[6].price * vktdatav.currencies.GBP).toFixed(8),
      JPY: (vktdatav.vktusdlast7d[6].price * vktdatav.currencies.JPY).toFixed(8),
      CAD: (vktdatav.vktusdlast7d[6].price * vktdatav.currencies.CAD).toFixed(8),
      CHF: (vktdatav.vktusdlast7d[6].price * vktdatav.currencies.CHF).toFixed(8),
      AUD: (vktdatav.vktusdlast7d[6].price * vktdatav.currencies.AUD).toFixed(8),
      KRW: (vktdatav.vktusdlast7d[6].price * vktdatav.currencies.KRW).toFixed(8),
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
// app.listen(NODE_PORT, function () {
//   if (isOpenWin === 'false') {
//     let uri = 'http://' + utils.getIP() + ':' + port + '/api';
//     opn(uri);

//     // 设置窗口打开标识
//     utils.localStorage().setItem('ISOPENWIN', 'true');

//     console.log("mock server start success.".green);
//   }
// });