## Node手把手构建一个静态文件服务器
这篇文章主要将会通过node手把手的构建一个静态文件服务器，那么废话不多说，开发流程走起来，我们先看一下将要做的这个静态文件服务器将会有哪些功能？

### 这个静态文件服务器有哪些功能？
  * 读取静态文件
  * MIME类型支持
  * 支持压缩
  * 支持断点续传
  * 支持缓存与缓存控制
  * 实现命令行调用
  * 最后将代码发布到npm，可通过npm install -g全局安装

好了，通过以上的功能梳理，那么我们需要实现的功能就很明确了，也就相当于我们项目开发过程中的需求现在已经确定了（原谅我这些天被公司项目别急了），接下来就一步步开始实现功能吧。

### 功能实现——读取静态文件+MIME类型支持
1. 首先先构建好项目目录，项目目录如下：

   ```
   project
    |---bin 命令行实现放置脚本
    |
    |---public 静态文件服务器默认静态文件夹
    |
    |---src 实现功能的相关代码
    |   |
    |   |__template 模板文件夹
    |   |
    |   |__app.js 主要功能文件
    |   |__config.js 配置文件
    |
    |---package.josn （这个不用多说了吧）

   ```

2. 然后开始实现功能，我们将会通过node的http模块来启动一个服务，这里我先将功能（读取静态文件、MIME类型支持）的实现整体代码贴出来，再慢慢道来：
```javascript
const http = require('http')
const path = require('path')
const url = require('url')
const fs = require('fs')
let chalk = require('chalk');
process.env.DEBUG = 'static:*';
let debug = require('debug')('static:app');//每个debug实例都有一个名字，是否在控制台打印取决于环境变量中DEBUG的值是否等于static:app
const mime = require('mime');
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
        this.list = getTemplet();
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
            this.sendError(req, res, 'not found');
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
        } catch (err) {//静态服务器内容不存在访问内容
            this.sendError(req, res, err);
        }
    }
    sendContent(req, res, filePath, statObj) {//向客户端响应内容
        let fileType = mime.getType(filePath);
        res.setHeader('Content-Type', `${fileType};charset=UTF-8`);
        let rs = this.getStream(filePath);//获取文件的可读流
        rs.pipe(res);
    }
    getStream(filePath) {//返回一个可读流
        return fs.createReadStream(filePath);
    }
    sendError(req, res, err) {//发送错误
        res.statusCode = 500;
        res.end(`${err.toString()}`)
    }
}
module.exports = Server;
```

通过以上的代码，我们可以看出，我这里是创建了一个Server类，然后通过在调用Server类的start()方法来启动这样一个服务，在Server类当中有以下方法：

   * start 用来启动服务的——这个方法里面主要是通过node的http模块来启动一个服务，并监听对应的端口
   * request 服务监听函数——这个方法主要是对启动服务的监听，具体逻辑这里还是在代码中通过注释来说明吧：
   ```javascript
    async request(req, res) {//服务监听函数
            let pathName = url.parse(req.url).path;//获取到客户端要访问的服务器路径
            let filePath = path.join(this.config.root, pathName);//客户端要访问的路径得到该路径在服务器上的对应服务器物理路径
            if (filePath.indexOf('favicon.ico') > 0) {//这个判断主要是为了去掉网站默认favicon.ico的请求报错
                this.sendError(req, res, 'not found');
                return
            }
            try {//在静态服务器存在访问路径内容
                let statObj = await stat(filePath);//通过node来获取该路径下的文件信息
                if (statObj.isDirectory()) {//如果该路径是对应的文件夹
                    let directories = await readDir(filePath);//读取该文件夹里面的文件内容，readDir其实是我定义的const readDir = promisify(fs.readdir)

                    let files = directories.map(file => {//这里主要是为了生成返回html模板内容的对应数据结构如： {title:'显示的页面标题',files:[{filename:'1',url:'/1'}]};

                        return {
                            filename: file,
                            url: path.join(pathName, file)
                        }
                    });
                    let htmls = this.list({//调用模板引擎的渲染方法，这就不对模板引擎做过多说明了，会在最后附上模板引擎的相关连接，这里用的handlebars
                        title: pathName,
                        files
                    });
                    res.setHeader('Content-Type', 'text/html');//因为返回的是html页面，所以需要设置请求头，告诉客户端如何来解析
                    res.end(htmls);//将读取到的html发送给客户端
                } else {
                    this.sendContent(req, res, filePath, statObj);//调用Server类的sendContent方法,向客户端发送内容
                }
            } catch (err) {//静态服务器不存在访问内容
                this.sendError(req, res, err);//调用Server类的sendError方法，向客户端发送错误信息
            }
        }
   ```
   代码的解读我会根据上一个方法的调用来一个个的逐行解读，那么接下来时sendContent
   * sendContent 向客户端发送内容，代码段如下：
   ```javascript
    sendContent(req, res, filePath, statObj) {//向客户端响应内容
            let fileType = mime.getType(filePath);//这里是为了实现对MIME类型的支持，所以这里需要判断访问路径的文件的MIME类型，主要是通过npm上的mime包来获取
            res.setHeader('Content-Type', `${fileType};charset=UTF-8`);//设置对应MIME的http响应头，这样客户端才能对应的解析
            let rs = this.getStream(filePath);//获取对应路径文件的可读流
            rs.pipe(res);//向客户端发送内容，这主要是因为res本身就是一个流
        }
   ```
   那么同样逐行解读Server类的getStream方法
   * getStream 获取一个流对象，代码如下：
   ```javascript
    getStream(filePath) {
            return fs.createReadStream(filePath);//返回一个可读流，供sendContent方法使用
        }
   ```
   那么以上就已经完成了向客户端返回对应的访问路径信息了，最后还剩一个Server类的sendError方法，这个方法主要是向客户端发送一个错误信息。
   * sendError 发送错误信息，代码段如下：
   ```javascript
    sendError(req, res, err) {//发送错误
           res.statusCode = 500;//设置错误码
           res.end(`${err.toString()}`)//向客户端发送对应的错误信息字符串
       }
   ```
   那么以上的代码就实现了一个这个静态服务器的——1.读取静态文件。2.MIME类型支持。这样两个功能点，[对应的代码文件app.js github地址](https://github.com/RanCW/staticServer/blob/master/src/app.js)

### 功能实现——支持压缩
    因为这个功能点的实现都是基于前面已实现的功能（读取静态文件、MIME类型支持）的基础上来做的，所以前面那些基础的就不再做说明，同样的是先贴上完整代码，然后再讲压缩的实现思路、以及压缩的功能实现的核心代码。整体代码如下:
    ```javascript
    //添加上文件压缩，实现功能有——读取静态文件、MIME类型支持，支持压缩
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
            let fileType = mime.getType(filePath);
            res.setHeader('Content-Type', `${fileType};charset=UTF-8`);
            let enCoding=this.sourceGzip(req,res);
            let rs = this.getStream(filePath);//获取文件的可读流
            if(enCoding){//开启压缩传输模式
                rs.pipe(enCoding).pipe(res);
            }else{
                rs.pipe(res);
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
        getStream(filePath) {//返回一个可读流
            return fs.createReadStream(filePath);
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
    ```
    通过以上代码我们会发现，这里代码只是对像客户端发送内容做的sendContent方法做了修改，所以，这里将会只讲sendContent以及sendContent里面与压缩相关的sourceGzip方法：
    那么我们一起来看看sendContent和sourceGzip方法吧，代码如下：
    ```javascript
        sendContent(req, res, filePath, statObj) {//向客户端响应内容
                let fileType = mime.getType(filePath);
                res.setHeader('Content-Type', `${fileType};charset=UTF-8`);
                let enCoding=this.sourceGzip(req,res);//调用sourceGzip，来实现资源压缩传输
                let rs = this.getStream(filePath);//获取文件的可读流
                if(enCoding){////如果客户端支持压缩格式传输，那么就以压缩方式传输数据
                    rs.pipe(enCoding).pipe(res);//向客户端发送压缩格式数据
                }else{
                    rs.pipe(res);
                }

            }
         sourceGzip(req,res){//资源开启压缩传输
             //    Accept-Encoding:gzip, deflate, sdch, br，客户端会发送这样的请求头，给服务器判断
                 let encoding=req.headers['accept-encoding'];//获取客户端发送的压缩相关的请求头信息，
                 if(/\bgzip\b/.test(encoding)){//客户端支持gzip压缩格式
                     res.setHeader('Content-Encoding','gzip');//设置请求头
                     return zlib.createGzip();//创建并返回一个Gzip流对象
                 }else if(/\bdeflate\b/.test(encoding)){//客户端支持deflate压缩格式
                     res.setHeader('Content-Encoding','deflate');//设置请求头
                     return zlib.createDeflate();//创建并返回一个Deflate流对象
                 }else{//代表客户端不支持压缩格式数据传输，
                     return null;
                 }
             }

    ```
   以上就是对实现数据压缩传输的代码实现说明，那么到这里，总共就已经实现了三个功能（读取静态文件、MIME类型的支持，支持压缩），[对应的代码文件appGzip.js github地址](https://github.com/RanCW/staticServer/blob/master/src/appGzip.js);

### 功能实现——断点续传（同样是在appGzip.js的基础上继续开发）

  因为现在的完整代码越来越多了，所以我这里就不再贴完整的代码了，就贴对应功能的核心代码吧，最后再附上完整的文件链接地址。这个功能主要是在获取文件流的方法getStream里面去扩展的，断点续传的个核心功能如下：
  ```javascript
    getStream(req,res,filePath,statObj) {//返回一个可读流
            let start = 0;//可读流的起司位置
            let end = statObj.size - 1;//可读流的结束位置
            let range = req.headers['range'];//获取客户端的range请求头信息，Server通过请求头中的Range: bytes=0-xxx来判断是否是做Range请求
            if (range) {//断点续传
                res.setHeader('Accept-Range', 'bytes');
                res.statusCode = 206;//返回指定内容的状态码
                let result = range.match(/bytes=(\d*)-(\d*)/);//断点续传的分段内容
                if (result) {
                    start = isNaN(result[1]) ? start : parseInt(result[1]);
                    end = isNaN(result[2]) ? end : parseInt(result[2]) - 1;
                }
            }
            return fs.createReadStream(filePath, {//返回一个指定起始位置和结束位置的可读流
                start, end
            });
        }
  ```
  那么上面的代码就已经实现了文件的断点续传了，对应[完整代码文件github地址](https://github.com/RanCW/staticServer/blob/master/src/appRange.js);接下来，将继续实现【支持缓存与缓存控制】这样一个功能点；

### 功能实现——断点续传（同样是在前面所有已完成功能基础上继续开发）

   之所以要实现缓存的支持与控制，主要是为了让客户端在访问服务端时以最小的数据传输量得到服务端最新的资源。其实现代码如下：
   ```javascript
   sendContent(req, res, filePath, statObj) {//向客户端响应内容
           if (this.checkCache(req, res, filePath, statObj)) return; //通过sendContent方法实现缓存校验
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
           let ifModifiedSince = req.headers['if-modified-since'];//当资源过期时（使用Cache-Control标识的max-age），发现资源具有Last-Modified声明，则再次向服务器请求时带上头If-Modified-Since。
           let isNoneMatch = req.headers['is-none-match'];//客户端想判断缓存是否可用可以先获取缓存中文档的ETag，然后通过If-None-Match发送请求给Web服务器询问此缓存是否可用。
           res.setHeader('Cache-Control', 'private,max-age=10');//Cache-Control private 客户端可以缓存,max-age=10 缓存内容将在10秒后失效
           res.setHeader('Expires', new Date(Date.now() + 10 * 1000).toGMTString());//服务器响应消息头字段，在响应http请求时告诉浏览器在过期时间前浏览器可以直接从浏览器缓存取数据
           let etag = statObj.size;
           let lastModified = statObj.ctime.toGMTString();
           res.setHeader('ETag', etag);//ETag是实体标签的缩写，根据实体内容生成的一段hash字符串,可以标识资源的状态。当资源发生改变时，ETag也随之发生变化。 ETag是Web服务端产生的，然后发给浏览器客户端。
           res.setHeader('Last-Modified', lastModified);//服务器文件的最后修改时间
           if (isNoneMatch && isNoneMatch != etag) {//缓存过期
               return false;
           }
           if (ifModifiedSince && ifModifiedSince != lastModified) {//换存过期
               return false;
           }
           if (isNoneMatch || ifModifiedSince) {//缓存有效
               res.writeHead(304);
               res.end();
               return true;
           } else {//缓存无效
               return false;
           }

       }
   ```
  那么以上代码就已经把静态服务器的【读取静态文件、MIME类型支持、支持压缩、支持断点续传、支持缓存与缓存控制】这些功能都已经实现了，[完整的代码文件GitHub地址](https://github.com/RanCW/staticServer/blob/master/src/appCache.js),接下来将要实现命令行调用我们的静态文件服务器启用；

### 功能实现——命令行调用
   命令行调用的功能主要是什么？
     如果没有命令行调用，如果我们想要执行我们这个app.js，那么就只能是先cmd进入命令行面板，然后在里面输入node app.js才能执行app.js。如果我们做了命令行调用，那么我们只需要自定义一个命令假如叫Myserver，这个命令主要功能主要就是执行app.js,那么我们在cmd命令行里面就只要输入Myserver就能实现了，而且还可以通过命令行来实现传参。例如：我们平时看电脑的ip地址时，我们可以在命令行中输入ipconfig，就会显示信息，也可以通过ipconfig /all 这样一个命令来显示完整信息，那么后面的这个/all就相当于一个筛选参数了，这样子就想Linux里面的命令一样了，这里就不再做太多说明了，这里主要讲一下如何将我们的静态服务器通过命令行来调用；
    首先在package.json中提供一个bin字段，主要是将包里包含可执行文件，通过设置这个字段可以将它们包含到系统的PATH中，这样直接就可以运行。我这里添加的bin字段如下：
    ```javascript
        "bin": {
            "rcw-staticserver": "bin/app"
          }
    ```
    这里是主要是将rcw-staticserver这个字段设置到系统PATH当中去，然后记得一定要运行一次npm link，从而将命令执行内容路径改到，bin/app文件来。那么我这里就能通过在命令行输入rcw-staticserver来启动我的静态文件服务器了。那么bin文件夹下的app文件代码内容如下：

    ```javascript

        #! /usr/bin/env node     //这段代码一定要写在开头，为了兼容各个电脑平台的差异性
        const yargs = require('yargs');//yargs模块，主要是用它提供的argv对象，用来读取命令行参数
        let Server = require('../src/appCache.js');
        const child = require('child_process');
        const path=require('path')
        const os = require('os');
        let argv = yargs.option('d', {//通过-d别名或者--root 文件夹名称来指定对应的静态文件服务器的文件夹目录
            alias: 'root',//指令变量名称
            demand: 'false',//是否必传字段
            type: 'string',//输入值类型
            default: path.resolve(process.cwd(),'public'),//默认值
            description: '静态文件根目录'//字段描述
        }).option('o', {
            alias: 'host',
            demand: 'false',
            default: 'localhost',
            type: 'string',
            description: '请配置监听的主机'
        }).option('p', {
            alias: 'port',
            demand: 'false',
            type: 'number',
            default: 9898,
            description: '请配置端口号'
        })
            .usage('rcw-staticserver [options]')//使用示例
            .example(
                'rcw-staticserver -d / -p 9898 -o localhost', '在本机的9898端口上监听客户端的请求'
            ).help('h').argv;

        let server = new Server(argv).start();//启动我的静态文件服务器
    ```
    这样子的话我就能在命令行当中通过输入rcw-staticserver来直接启动静态文件服务器了，那么命令行调用的功能也就实现了。

### 功能实现——代码发布到npm，可通过npm install -g全局安装。
  这个功能其实相对来说就很简单了，首先要有个[npm](https://www.npmjs.com/)官网的账号，没有的请自觉注册吧。命令行里通过npm login先登录自己的npm账号，然后再运行npm publish，这个包就很轻松的发布到npm上面去了，也就可以通过npm install -g来进行全局安装了。

   通过以上的操作我们一个静态文件服务器就已经实现了哦！有不好和错误的地方，请大家多多指教。

   [完整代码GitHub地址](https://github.com/RanCW/staticServer)

   参考文献：
   * [ndejs中文网](http://nodejs.cn/)
   * [handlebars模板引擎文档](http://www.ghostchina.com/introducing-the-handlebars-js-templating-engine/)
   * [mime npm包](https://www.npmjs.com/package/mime)
   * [命令行框架 yargs](https://www.npmjs.com/package/yargs)
   * [HTTP 缓存机制一二三](http://web.jobbole.com/92773/)












