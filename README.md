# 文件分片上传

支持**秒传**和**续传**，默认模拟 40% 概率上传异常（[自行修改](./server/app/controller/home.js)）。

![demo](./other/demo.png)

处理逻辑：
1. 计算文件哈希，分片大小 1MB。
2. 请求服务，检查文件是否已存在：
    1. 已存在，即秒传成功。
    2. 不存在，返回已上传的分片列表信息。
3. 筛选还未上传的分片进行上传。
4. 从队头开始，成功后下一个
    1. 上传失败，分片重新入队尾等待重试。
    2. 有分片失败了 3 次后，整体上传中止。
5. 分片全部上传成功后，发送合并请求，服务端完成合并，即上传完成。

```bash
pnpm i

pnpm start
```