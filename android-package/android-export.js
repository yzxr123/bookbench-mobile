// Adapt the Web version's Blob/data downloads to Android's document picker.
(() => {
    let android;
    let exporting = false;
    let orientation;
    addEventListener('message', event => {
        if (typeof event.data === 'string' && event.data.startsWith('blockbench-android:') &&
                event.ports.length === 1) {
            android?.close();
            android = event.ports[0];
            if (orientation) android.postMessage('orientation:' + orientation);
            else window.settings?.android_orientation?.set(event.data.split(':')[1]);
        }
    });

    const send = (data, waitForPicker = false) => new Promise((resolve, reject) => {
        const channel = android;
        if (!channel) {
            reject(new Error('无法连接安卓文件选择器'));
            return;
        }
        channel.onmessage = event => {
            clearTimeout(timeout);
            channel.onmessage = null;
            if (event.data === 'ok') resolve(true);
            else if (event.data === 'cancel') resolve(false);
            else reject(new Error('安卓文件写入失败'));
        };
        const timeout = waitForPicker ? undefined : setTimeout(() => {
            channel.onmessage = null;
            reject(new Error('安卓文件选择器连接超时'));
        }, 20000);
        channel.postMessage(data);
    });

    const saveFile = async (content, name) => {
        if (exporting) {
            window.Blockbench?.showQuickMessage('请先完成当前文件的保存');
            return false;
        }
        exporting = true;
        try {
            const file = typeof content === 'string' ? await (await fetch(content)).blob() : content;
            await send(JSON.stringify({ name, type: file.type }));
            for (let offset = 0; offset < file.size; offset += 32768) {
                const slice = await file.slice(offset, offset + 32768).arrayBuffer();
                await send('data:' + btoa(String.fromCharCode(...new Uint8Array(slice))));
            }
            return await send('finish', true);
        } catch (error) {
            android?.postMessage('abort');
            console.error(error);
            window.Blockbench?.showQuickMessage('保存失败，请重试');
            return false;
        } finally {
            exporting = false;
        }
    };

    window.AndroidPackage = {
        saveFile,
        setOrientation(value) {
            orientation = value;
            android?.postMessage('orientation:' + value);
        },
        finishExit() {
            android?.postMessage('exit');
        }
    };

    for (const method of ['click', 'dispatchEvent']) {
        const original = HTMLAnchorElement.prototype[method];
        HTMLAnchorElement.prototype[method] = function (...args) {
            if ((method === 'click' || args[0]?.type === 'click') &&
                    this.hasAttribute('download') && /^(blob|data):/.test(this.href)) {
                void saveFile(this.href, this.download || '下载');
                return false;
            }
            return original.apply(this, args);
        };
    }
})();
