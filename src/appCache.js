//添加上服务器压缩+断点续传+设置缓存
const http = require('http')
const path = require('path')
const url = require('url')
const fs = require('fs')
const mime = require('mime')
var zlib = require('zlib');
let chalk = require('chalk');
process.env.DEBUG = 'static:app';
let debug = require('debug')('static:app');//每个debug实例都有一个名字，是否在控制台打印取决于环境变量中DEBUG的值是否等于static:app
const {promisify} = require('util')
let handlebars = require('handlebars');

const config = require('./config')
const stat = promisify(fs.stat)
const readDir = promisify(fs.readdir)

//获取编译模板
function getTemplet() {
    let tmpl = fs.readFileSync(path.resolve(__dirname, 'template', 'list.html'), 'utf8');
    return handlebars.compile(tmpl);
}
class Server {
    constructor(argv) {
        this.config = Object.assign({}, config, argv);
        this.list = getTemplet()
    }
    //启动服务
    start() {
        let server = http.createServer();
        server.on('request', this.request.bind(this))
        server.listen(this.config.port);
        let url=`http://${this.config.host}:${this.config.port}`;
        debug(`静态服务启动成功${chalk.green(url)}`);
    }
    async request(req, res) {//服务监听函数
        let pathName = url.parse(req.url).path;
        let filePath = path.join(this.config.root, pathName);
        if (filePath.indexOf('favicon.ico') > 0) {
            this.sendError(req, res, 'not found',404);
            return
        }
        try {//在静态服务文件夹存在访问的路径内容
            let statObj = await stat(filePath);
            if (statObj.isDirectory()) {//是文件夹
                let directories = await readDir(filePath);
                let files = directories.map(file => {
                    return {
                        filename: file,
                        url: path.join(pathName, file)
                    }
                });
                let htmls = this.list({
                    title: pathName,
                    files
                });
                res.setHeader('Content-Type', 'text/html');
                res.end(htmls);
            } else {//是文件
                this.sendContent(req, res, filePath, statObj);
            }
        } catch (err) {//静态服务器不存在访问内容
            this.sendError(req, res, err);
        }
    }
    sendContent(req, res, filePath, statObj) {//向客户端响应内容
        if (this.checkCache(req, res, filePath, statObj)) return; //如果走缓存，则直接返回
        let fileType = mime.getType(filePath);
        res.setHeader('Content-Type', `${fileType};charset=UTF-8`);
        let enCoding=this.sourceGzip(req,res);
        let rs = this.getStream(req,res,filePath,statObj);//获取文件的可读流
        if(enCoding){//开启压缩传输模式
            rs.pipe(enCoding).pipe(res);
        }else{
            rs.pipe(res);
        }

    }
    checkCache(req,res,filePath,statObj){//校验缓存
        let ifModifiedSince = req.headers['if-modified-since'];
        let isNoneMatch = req.headers['is-none-match'];
        res.setHeader('Cache-Control', 'private,max-age=10');
        res.setHeader('Expires', new Date(Date.now() + 10 * 1000).toGMTString());
        let etag = statObj.size;
        let lastModified = statObj.ctime.toGMTString();
        res.setHeader('ETag', etag);
        res.setHeader('Last-Modified', lastModified);
        if (isNoneMatch && isNoneMatch != etag) {
            return false;
        }
        if (ifModifiedSince && ifModifiedSince != lastModified) {
            return false;
        }
        if (isNoneMatch || ifModifiedSince) {
            res.writeHead(304);
            res.end();
            return true;
        } else {
            return false;
        }

    }
    sourceGzip(req,res){//资源开启压缩传输
        //    Accept-Encoding:gzip, deflate, sdch, br
        let encoding=req.headers['accept-encoding'];
        if(/\bgzip\b/.test(encoding)){//gzip压缩格式
            res.setHeader('Content-Encoding','gzip');
            return zlib.createGzip();
        }else if(/\bdeflate\b/.test(encoding)){//deflate压缩格式
            res.setHeader('Content-Encoding','deflate');
            return zlib.createDeflate();
        }else{
            return null;
        }
    }
    getStream(req,res,filePath,statObj) {//返回一个可读流
        let start = 0;
        let end = statObj.size - 1;
        let range = req.headers['range'];
        if (range) {//支持断点续传
            res.setHeader('Accept-Range', 'bytes');
            res.statusCode = 206;//返回整个内容的一块
            let result = range.match(/bytes=(\d*)-(\d*)/);
            if (result) {
                start = isNaN(result[1]) ? start : parseInt(result[1]);
                end = isNaN(result[2]) ? end : parseInt(result[2]) - 1;
            }
        }
        return fs.createReadStream(filePath, {
            start, end
        });
    }
    sendError(req, res, err,errCode) {//发送错误
        if(errCode){
            res.statusCode=errCode;
        }else{
            res.statusCode = 500;
        }
        res.end(`${err.toString()}`)
    }
}
module.exports = Server;
