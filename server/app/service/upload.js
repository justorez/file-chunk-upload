// app/service/upload.js
const path = require('path')
const fs = require('fs-extra')
const Service = require('egg').Service

class UploadService extends Service {
    extractExt(filename) {
        // return filename.slice(filename.lastIndexOf("."), filename.length);
        return path.parse(filename).ext
    }

    async mergeFiles(files, dest, size) {
        const pipeStream = (filePath, writeStream) => {
            return new Promise((resolve) => {
                const readStream = fs.createReadStream(filePath)
                readStream.on('end', () => {
                    fs.unlinkSync(filePath) // 删除文件
                    resolve()
                })
                readStream.pipe(writeStream)
            })
        }

        return Promise.all(
            files.map((file, index) =>
                pipeStream(
                    file,
                    fs.createWriteStream(dest, {
                        start: index * size,
                        end: (index + 1) * size
                    })
                )
            )
        )
    }

    /**
     * @param {string} savePath 切片合并后的最终保存路径
     * @param {string} fileHash 文件哈希
     * @param {number} size 切片大小
     */
    async mergeFileChunk(savePath, fileHash, size) {
        const chunkDir = path.resolve(this.config.UPLOAD_DIR, fileHash)
        let chunkPaths = await fs.readdir(chunkDir)
        // 根据切片下标进行排序
        // 否则直接读取目录的获得的顺序可能会错乱
        chunkPaths.sort((a, b) => a.split('-')[1] - b.split('-')[1])
        chunkPaths = chunkPaths.map(cp => path.resolve(chunkDir, cp)) // 转成文件路径
        return this.mergeFiles(chunkPaths, savePath, size)
    }
}
module.exports = UploadService
