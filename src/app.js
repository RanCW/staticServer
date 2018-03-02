const http=require('http')
const path=require('path')
const url=require('url')
const fs=require('fs')
const {promisify}=require('util')
const config=require('./config')
const stat=promisify(fs.stat)


class Server{
    constructor(){
        // this.config=Object.assign({},config);
        this.config=config;
    }
    //启动服务
    start(){
        let server=http.createServer();
        server.on('request',this.request.bind(this))
        server.listen(this.config.port);
        console.log(`服务启动成功http://${this.config.host}:${this.config.port}`);
    }
    async request(req,res){
        let pathName=url.parse(req.url).path;
        let filePath=path.join(this.config.root,pathName);
        if(filePath.indexOf('favicon.ico')>0){
            this.sendContent(req,res);
            return
        }
        try{
            let statObj=await stat(filePath);
            console.log(statObj);
            if(statObj.isDirectory()){
                console.log(filePath);

            }else{
                console.log(`${filePath}是个文件`);

            }
        }catch(err) {
            console.log(err);

        }

        this.sendContent(req,res);
    }
    sendContent(req,res,filePath,statObj){
        res.setHeader('content-type','text/html;charset=UTF-8')
        res.end(`访问http://${this.config.host}:${this.config.port}成功`)
    }
}
new Server().start();
module.exports=Server;
