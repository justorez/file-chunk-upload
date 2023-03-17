import { Message } from "element-ui";

const IMG_WIDTH_LIMIT = 1000;
const IMG_HEIGHT_LIMIT = 1000;

/**
 * @param {File} file
 */
export function isImage(file) {
    return isGIF(file) && isPNG(file) && isJPG(file);
}

/**
 * 文件头16进制 47 49 46 38 39 61 或者 47 49 46 38 37 61
 * 分别是89年和87年的规范
 * ```js
 * '47 49 46 38 39 61'.split(' ')
 *      .map(v => parseInt(v,16))
 *      .map(v => String.fromCharCode(v))
 * // 或者把字符串转为16进制 两个方法用那个都行
 * 'GIF89a'.split('')
 *      .map(v => v.charCodeAt())
 *      .map(v => v.toString(16))
 * return ret ==='GIF89a' || ret==='GIF87a'
 * ```
 * 文件头标识 (6 bytes) 47 49 46 38 39(37) 61
 * @param {File} file
 */
export async function isGIF(file) {
    const ret = await blobToString(file.slice(0, 6));
    const isgif =
        ret === "47 49 46 38 39 61" || ret === "47 49 46 38 37 61";
    if (isgif) {
        const { w, h } = await getRectByOffset(
            file,
            [6, 8],
            [8, 10],
            true
        );

        console.log("gif 尺寸", w, h);
        if (w > IMG_WIDTH_LIMIT || h > IMG_HEIGHT_LIMIT) {
            Message.error(
                `图片尺寸不得超过！${IMG_WIDTH_LIMIT}×${IMG_HEIGHT_LIMIT}`
            );
            return false;
        }
    }
    return isgif;

}

export async function isPNG(file) {
    const ret = await this.blobToString(file.slice(0, 8));
    const ispng = ret === "89 50 4E 47 0D 0A 1A 0A";
    if (ispng) {
        const { w, h } = await this.getRectByOffset(
            file,
            [18, 20],
            [22, 24]
        );

        console.log("png 尺寸", w, h);
        if (w > IMG_WIDTH_LIMIT || h > IMG_HEIGHT_LIMIT) {
            Message.error(
                `图片尺寸不得超过！${IMG_WIDTH_LIMIT}×${IMG_HEIGHT_LIMIT}`
            );
            return false;
        }
    }
    return ispng;
}

/**
 * jpg 开头 FF D8
 * jpg 结尾 FF D9
 * @param {File} file
 */
export async function isJPG(file) {
    const len = file.size;
    const start = await blobToString(file.slice(0, 2));
    const tail = await blobToString(file.slice(-2, len));
    const isjpg = start === "FF D8" && tail === "FF D9";
    if (isjpg) {
        const heightStart = parseInt("A3", 16);
        const widthStart = parseInt("A5", 16);
        const { w, h } = await getRectByOffset(
            file,
            [widthStart, widthStart + 2],
            [heightStart, heightStart + 2]
        );
        console.log("jpg 尺寸", w, h);
    }
    return isjpg;
}

/**
 * 二进制 → ascii码 → 16进制字符串
 * @param {Blob} blob
 */
export async function blobToString(blob) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = function() {
            const ret = reader.result
                .split("")
                .map(v => v.charCodeAt())
                .map(v => v.toString(16).toUpperCase())
                .map(v => v.padStart(2, "0"))
                .join(" ");
            resolve(ret);
        };
        reader.readAsBinaryString(blob);
    });
}

export async function getRectByOffset(file, widthOffset, heightOffset, reverse) {
    let width = await blobToString(file.slice(...widthOffset));
    let height = await blobToString(file.slice(...heightOffset));
    if (reverse) {
        // 比如gif的宽，6和7是反着排的 大小端存储
        // 比如6位是89，7位是02， gif就是 0289 而不是 8920 的值 切分后翻转一下
        width = [width.slice(3, 5), width.slice(0, 2)].join(" ");
        height = [height.slice(3, 5), height.slice(0, 2)].join(" ");
    }
    const w = parseInt(width.replace(" ", ""), 16);
    const h = parseInt(height.replace(" ", ""), 16);
    return { w, h };
}
