const http = require('http')
const path = require('path')
const url = require('url')
const fs = require('fs')
const mime = require('mime')
const {promisify} = require('util')
let handlebars = require('handlebars');

const config = require('./config')
const stat = promisify(fs.stat)
const readDir = promisify(fs.readdir)

//获取编译模板
function getTemplet(tmplPath) {
  let tmpl = fs.readFileSync(path.resolve(__dirname, 'template', tmplPath), 'utf8');
  return handlebars.compile(tmpl);
}


class Server {
  constructor() {
    this.config = config;
    this.list=getTemplet('list.html')
  }

  //启动服务
  start() {
    let server = http.createServer();
    server.on('request', this.request.bind(this))
    server.listen(this.config.port);
    console.log(`服务启动成功http://${this.config.host}:${this.config.port}`);
  }

  async request(req, res) {
    let pathName = url.parse(req.url).path;
    let filePath = path.join(this.config.root, pathName);
    if (filePath.indexOf('favicon.ico') > 0) {
      this.sendError(req, res, 'not found');
      return
    }
    try {
      let statObj = await stat(filePath);
      console.log(statObj);
      if (statObj.isDirectory()) {
        console.log(filePath);
        let directories=readDir(filePath);
        console.log(directories);
        res.end('haha')

      } else {
        this.sendContent(req, res, filePath, statObj);
      }
    } catch (err) {
      this.sendError(req,res,err);
    }

  }

  sendContent(req, res, filePath, statObj) {
    let fileType= mime.getType(filePath);
    res.setHeader('Content-Type', `${fileType};charset=UTF-8`);
    let rs = this.getStream(filePath);//获取文件的可读流
    rs.pipe(res);
  }

  getStream(filePath) {
    return fs.createReadStream(filePath);

  }

  sendError(req, res, err) {
    res.statusCode = 500;
    res.end(`${err.toString()}`)
  }
}
new Server().start();

module.exports = Server;
