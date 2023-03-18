// app/controller/home.js
const path = require('path')
const fs = require('fs-extra')
const Controller = require('egg').Controller

class HomeController extends Controller {
    async index() {
        this.ctx.body = {
            msg: 'hello eggjs'
        }
    }

    async check() {
        const { ext, hash } = this.ctx.request.body
        const filePath = path.resolve(this.config.UPLOAD_DIR, `${hash}.${ext}`)
        console.log(filePath)
        // 文件是否存在
        let uploaded = false
        let uploadedList = []
        if (fs.existsSync(filePath)) {
            uploaded = true // 存在文件，直接返回已上传
        } else {
            // 文件没有完全上传完毕，但是可能存在部分切片上传完毕了
            uploadedList = await this.getUploadedList(
                path.resolve(this.config.UPLOAD_DIR, hash)
            )
        }

        this.ctx.body = {
            code: 0,
            uploaded,
            uploadedList
        }
    }

    async getUploadedList(dirPath) {
        return fs.existsSync(dirPath)
            ? (await fs.readdir(dirPath)).filter(name => name[0] !== '.') // 过滤诡异的隐藏文件 比如.DS_store
            : []
    }

    async upload() {
        if (Math.random() < 0.4) {
            this.ctx.status = 500
            this.ctx.body = '模拟上传异常'
            return
        }

        const file = this.ctx.request.files[0]
        const { chunkname, ext, hash } = this.ctx.request.body
        console.log(chunkname, ext)
        console.log(file, '\n')
        const filename = `${hash}.${ext}`
        // 最终文件存储位置
        const filePath = path.resolve(this.config.UPLOAD_DIR, filename)
        // 切片文件夹，用哈希命名
        const chunkPath = path.resolve(this.config.UPLOAD_DIR, hash)

        // 文件存在直接返回
        if (fs.existsSync(filePath)) {
            this.ctx.body = {
                code: -1,
                msg: '文件存在'
            }
            return
        }
        if (!fs.existsSync(this.config.UPLOAD_DIR)) {
            await fs.mkdirs(this.config.UPLOAD_DIR)
        }
        await fs.move(file.filepath, `${chunkPath}/${chunkname}`)
        this.ctx.body = {
            code: 0,
            msg: '上传成功'
        }
    }

    async merge() {
        const { ext, size, hash } = this.ctx.request.body
        const savePath = path.resolve(this.config.UPLOAD_DIR, `${hash}.${ext}`)
        await this.ctx.service.upload.mergeFileChunk(savePath, hash, size)
        this.ctx.body = {
            code: 0,
            msg: '合并成功'
        }
    }
}

module.exports = HomeController
