<template>
    <div class="app">
        <div ref="drag" id="drag">
            <input
                ref="input"
                type="file"
                name="file"
                @change="handleFileChange"
            />
            <!-- <img :src="preview" alt=""> -->
        </div>
        <!--
        <div v-loading="loading">
            <textarea ref="article" v-model="article" cols="30" rows="10"></textarea>
            <div class="output" v-html="articleHtml"></div>
        </div>
        <div v-if="file">{{file.name}}</div>
        -->

        <div>
            <el-button type="primary" @click="handleUpload">上 传</el-button>
            <el-button type="primary" @click="handleSlowStartUpload"
                >慢启动上传</el-button
            >
            <el-button type="success" @click="pauseUpload">暂停</el-button>
        </div>

        <div class="row">
            <!-- 哈希计算进度 -->
            <span>文件准备中</span>
            <el-progress
                text-inside
                :stroke-width="20"
                :percentage="hashProgress"
            ></el-progress>
        </div>
        <div class="row">
            <span>上传进度</span>
            <el-progress
                text-inside
                :stroke-width="20"
                :percentage="uploadProgress"
            ></el-progress>
        </div>

        <!-- 方块进度条 -->
        <div class="cube-container" :style="{ width: cubeWidth + 'px' }">
            <div
                v-for="(chunk, index) in chunks"
                :key="chunk.name"
                class="cube"
                :class="{
                    'border-top': index < cubeSideLen,
                    'border-right': (index + 1) % cubeSideLen === 0
                }"
            >
                <div
                    :class="{
                        uploading: chunk.progress > 0 && chunk.progress < 100,
                        success: chunk.progress == 100,
                        error: chunk.progress < 0
                    }"
                    :style="{ width: chunk.progress + '%' }"
                >
                    <i
                        v-if="chunk.progress < 100 && chunk.progress > 1"
                        class="el-icon-loading"
                        style="color: #f56c6c"
                    ></i>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import marked from 'marked'
import { isImage } from './utils'
import { calcHashSample } from './utils'

const CHUNK_SIZE = 1 * 1024 * 1024 // 1M

export default {
    name: 'app',
    data() {
        return {
            chunks: [],
            file: null,
            hash: null,
            preview: null,
            article: '# 开心的一天\n' + '* 吃饭\n' + '* 睡觉\n' + '* 上王者',
            loading: false,
            hashProgress: 0
        }
    },
    computed: {
        articleHtml() {
            return marked(this.article)
        },
        cubeSideLen() {
            const max = Math.floor(document.body.clientWidth * 0.7 / 28)
            return Math.min(max, Math.ceil(Math.sqrt(this.chunks.length)))
        },
        cubeWidth() {
            return this.cubeSideLen * 28
        },
        uploadProgress() {
            if (!this.file || !this.chunks.length) return 0
            const loaded = this.chunks
                .map((item) => item.chunk.size * item.progress)
                .reduce((acc, cur) => acc + cur)
            return parseInt((loaded / this.file.size).toFixed(2))
        }
    },
    async mounted() {
        this.bindDragEvent('drag', () => {
            this.preview = window.URL.createObjectURL(this.file)
        })
        // this.bindDragEvent('article',async ()=>{
        //     this.loading = true
        //     const ret = await this.handleUpload()
        //     this.article += `![${this.file.name}](/api${ret.url})`
        //     this.loading = false
        // })
        // this.bindPasteEvent()
    },
    methods: {
        handleFileChange(e) {
            const [file] = e.target.files
            if (!file) return

            // if (file.size > CHUNK_SIZE) {
            //   this.$message.error("请选择小于2M的文件");
            //   return;
            // }
            // if (!isImage(file)) {
            //   this.$message.error("请选择正确的图片格式");
            //   return
            // }

            this.file = file
            this.chunks = []
            this.hashProgress = 0
            this.hash = null
        },
        async handleUpload() {
            if (!this.file) {
                this.$message.info('请选择文件')
                return
            }

            // 检查文件是否已经上传
            this.hash ||= await calcHashSample(this.file, this)
            const { uploaded, uploadedList } = await this.$axios.post(
                '/check',
                {
                    ext: this.ext(this.file.name),
                    hash: this.hash
                }
            )
            if (uploaded) {
                return this.$message.success('秒传成功 (oﾟ▽ﾟ)o')
            }

            // 切片
            let chunks = this.createFileChunks(this.file)
            this.chunks = chunks.map((chunk, index) => {
                const chunkName = this.hash + '-' + index
                return {
                    index,
                    hash: this.hash,
                    chunk: chunk.file,
                    name: chunkName,
                    progress: uploadedList.includes(chunkName) ? 100 : 0
                }
            })
            // 传入已经存在的切片清单
            this.paused = false
            return this.uploadChunks(uploadedList)
        },
        /**
         * 将文件切分为大小一样的数据块（最后一个块可能偏小）
         * @param {File} file
         * @param {Number} size
         */
        createFileChunks(file, size = CHUNK_SIZE) {
            // 生成文件块 Blob.slice
            const chunks = []
            let cur = 0
            while (cur < file.size) {
                chunks.push({ index: cur, file: file.slice(cur, cur + size) })
                cur += size
            }
            return chunks
        },
        async uploadChunks(uploadedList = []) {
            const list = this.chunks
                .filter(chunk => !uploadedList.includes(chunk.name))
                .map(({ chunk, name, hash, index }) => {
                    const form = new FormData()
                    form.append('index', index)
                    form.append('chunkname', name)
                    form.append('ext', this.ext(this.file.name))
                    form.append('hash', hash)
                    form.append('file', chunk)
                    return { form, index, error: 0 }
                })

            try {
                await this.sendRequest([...list], 4)
                if (uploadedList.length + list.length === this.chunks.length) {
                    await this.mergeRequest()
                }
            } catch (e) {
                console.error(e)
                this.$message.error('上传似乎出了点小问题 (ó﹏ò｡)')
            }
        },
        pauseUpload() {
            this.paused = true
        },
        sendRequest(chunks, limit = 4) {
            return new Promise((resolve, reject) => {
                const len = chunks.length
                let counter = 0
                this.paused = false // 全局开关

                const start = async () => {
                    if (this.paused) return
                    const task = chunks.shift()
                    if (!task) return

                    const { form, index } = task
                    try {
                        await this.$axios.post('/upload', form, {
                            onUploadProgress: (progress) => {
                                this.chunks[index].progress = Number(
                                    (
                                        (progress.loaded / progress.total) *
                                        100
                                    ).toFixed(2)
                                )
                            }
                        })
                        counter += 1
                        if (counter === len) {
                            resolve() // 最后一个
                        } else {
                            start()
                        }
                    } catch (e) {
                        // 当前切片报错了
                        // 尝试3次重试机制，重新push到数组中
                        // 进度条改成红色
                        this.chunks[index].progress = -1
                        if (task.error < 3) {
                            task.error++
                            chunks.push(task) // 准备重试
                            start()
                        } else {
                            this.paused = true // 错误3次了 直接结束
                            reject(e)
                        }
                    }
                }

                while (limit-- > 0) {
                    setTimeout(() => {
                        start() // 模拟延迟
                    }, Math.random() * 2000)
                }
            })
        },
        async mergeRequest() {
            await this.$axios.post('/merge', {
                ext: this.ext(this.file.name),
                size: CHUNK_SIZE,
                hash: this.hash
            })
            this.$message.success('上传成功 (๑*◡*๑)')
        },
        async handleSlowStartUpload() {
            // @todo 数据缩放的比率 可以更平缓
            // @todo 并发 + 慢启动

            // 慢启动上传逻辑
            const file = this.file
            if (!file) return
            const fileSize = file.size
            let offset = 0.1 * 1024 * 1024

            let cur = 0
            let count = 0
            this.hash = await calcHashSample()

            while (cur < fileSize) {
                const chunk = file.slice(cur, cur + offset)
                cur += offset
                const chunkName = this.container.hash + '-' + count
                const form = new FormData()

                form.append('chunkname', chunkName)
                form.append('ext', this.ext(this.file.name))
                form.append('hash', this.hash)
                // form.append("file", new File([chunk],name,{hash,type:'png'}))

                let start = new Date().getTime()
                await this.$axios.post('/upload', form)
                const now = new Date().getTime()

                const time = ((now - start) / 1000).toFixed(4)

                // 期望10秒一个切片
                let rate = time / 10
                // 速率有最大和最小 可以考虑更平滑的过滤 比如1/tan
                if (rate < 0.5) rate = 0.5
                if (rate > 2) rate = 2
                // 新的切片大小等比变化
                console.log(
                    `切片${count}大小是${this.format(
                        offset
                    )},耗时${time}秒，是30秒的${rate}倍，修正大小为${this.format(
                        offset / rate
                    )}`
                )
                offset = parseInt(offset / rate)
                // if(time)
                count++
            }
        },
        // 返回文件后缀名
        ext(filename) {
            return filename.split('.').pop()
        },
        bindPasteEvent() {
            this.$refs.article.addEventListener('paste', async (e) => {
                const files = e.clipboardData.files
                if (!files.length) return
                this.file = files[0]
                this.loading = true
                const ret = await this.handleUpload()
                this.article += `![${this.file.name}](/api${ret.url})`
                this.loading = false

                e.preventDefault()
            })
        },
        bindDragEvent(name, cb) {
            const drag = this.$refs[name]
            drag.addEventListener('dragover', (e) => {
                drag.style.borderColor = '#409eff'
                e.preventDefault()
            })
            drag.addEventListener('dragleave', (e) => {
                drag.style.borderColor = '#eee'
                e.preventDefault()
            })
            drag.addEventListener(
                'drop',
                (e) => {
                    const fileList = e.dataTransfer.files
                    this.$refs.input.files = fileList
                    drag.style.borderColor = '#eee'
                    this.handleFileChange({ target:fileList })
                    cb && cb()
                    e.preventDefault()
                },
                false
            )
        }
    }
}
</script>

<style lang="less">
@color0: #eee;
@cube-size: 28px;

body {
    margin: 0;
    padding: 0;
}
.app > div {
    margin: 50px 15vw;
}
#drag {
    border: 2px dashed @color0;
    height: 100px;
    line-height: 100px;
    text-align: center;
    vertical-align: middle;
}
img {
    width: 50px;
}
.output {
    display: inline-block;
    width: 300px;
    margin-left: 30px;
    padding: 10px;
    vertical-align: top;
    background-color: @color0;
    img {
        width: 200px;
    }
}

.row {
    display: flex;
    align-items: center;

    > span {
        display: inline-block;
        min-width: 80px;
        margin-right: 20px;
    }
    div:last-child {
        flex: 1;
    }
}

.cube-container {
    display: flex;
    flex-wrap: wrap;
    width: 100px;
    overflow: hidden;
}
.cube {
    width: @cube-size;
    height: @cube-size;
    border: 1px solid #000;
    border-right-width: 0;
    border-top-width: 0;
    background-color: @color0;
    box-sizing: border-box;

    &.border-top {
        border-top-width: 1px;
    }
    &.border-right {
        border-right-width: 1px;
    }
    &:last-child {
        border-right-width: 1px;
    }

    > div {
        height: 100%;
        line-height: @cube-size;
    }
    .success {
        background-color: #67c23a;
    }
    .uploading {
        background-color: #409eff;
    }
    .error {
        background-color: #f56c6c;
    }
}
</style>
