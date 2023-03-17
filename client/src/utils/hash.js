import SparkMD5 from 'spark-md5'

let timeId = null

/**
 * 直接计算 hash，大文件会卡顿
 * @param {File} file
 */
export async function calcHash(file) {
    const ret = await blobToData(file);
    return SparkMD5.hash(ret);
}
async function blobToData(blob) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = function() {
            resolve(reader.result);
        };
        reader.readAsBinaryString(blob);
    });
}

/**
 * 利用 Web Worker 异步计算 hash
 * @param {Blob[]} chunks
 * @param {import('vue').Component} vm
 */
export async function calcHashWorker(chunks, vm) {
    return new Promise(resolve => {
        vm.worker = new Worker("/hash.js");
        vm.worker.postMessage({ chunks });
        vm.worker.onmessage = e => {
            const { progress, hash } = e.data;
            vm.hashProgress = Number(progress.toFixed(2));
            if (hash) {
                resolve(hash);
            }
        };
    });
}

/**
 * 抽样 hash，牺牲一定的准确率 换来效率.
 * hash 一样的不一定是同一个文件， 但是不一样的一定不是
 * @param {File} file
 * @param {import('vue').Component} vm
 */
export async function calcHashSample(file, vm) {
    return new Promise(resolve => {
        const spark = new SparkMD5.ArrayBuffer();
        const reader = new FileReader();
        const size = file.size;
        let offset = 2 * 1024 * 1024;
        let chunks = [file.slice(0, offset)];

        let cur = offset;
        while (cur < size) {
            // 最后一块全部加进来
            if (cur + offset >= size) {
                chunks.push(file.slice(cur, cur + offset));
            } else {
                // 中间的 前中后去两个字节
                const mid = cur + offset / 2;
                const end = cur + offset;
                chunks.push(file.slice(cur, cur + 2));
                chunks.push(file.slice(mid, mid + 2));
                chunks.push(file.slice(end - 2, end));
            }
            cur += offset;
        }
        reader.readAsArrayBuffer(new Blob(chunks));
        reader.onload = e => {
            spark.append(e.target.result);
            vm.hashProgress = 100;
            resolve(spark.end());
        };
    });
}

/**
 * 利用 requestIdleCallback 异步计算 hash
 * @param {Blob[]} chunks
 * @param {import('vue').Component} vm
 */
export async function calcHashIdle(chunks, vm) {
    return new Promise(resolve => {
        const spark = new SparkMD5.ArrayBuffer();
        let count = 0;
        const appendToSpark = async file => {
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.readAsArrayBuffer(file);
                reader.onload = e => {
                    spark.append(e.target.result);
                    resolve();
                };
            });
        };
        const workLoop = async deadline => {
            // 有任务，并且当前帧还没结束
            while (
                count < chunks.length &&
                deadline.timeRemaining() > 1
            ) {
                await appendToSpark(chunks[count].file);
                count++;
                if (count < chunks.length) { // 计算中
                    vm.hashProgress = Number(
                        ((100 * count) / chunks.length).toFixed(2)
                    );
                } else { // 计算完毕
                    vm.hashProgress = 100;
                    window.cancelIdleCallback(timeId)
                    return resolve(spark.end());
                }
            }
            console.log(
                `新任务：开始计算第${count}个，等待下次浏览器空闲`
            );
            timeId = window.requestIdleCallback(workLoop);
        };
        timeId = window.requestIdleCallback(workLoop);
    });
}
