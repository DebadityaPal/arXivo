const _str2Buffer = (data: string): ArrayBuffer => {
    const utf8Str = decodeURI(encodeURIComponent(data));
    const len = utf8Str.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        arr[i] = utf8Str.charCodeAt(i);
    }
    return arr.buffer;
};

export const buffer2Hex = (buffer: ArrayBuffer): string =>
    Array.from(new Uint8Array(buffer))
        .map((b) => ('00' + b.toString(16)).slice(-2))
        .join('');

export const hex2Buffer = (data: string): ArrayBuffer => {
    if (data.length % 2 === 0) {
        const bytes = [];
        for (let i = 0; i < data.length; i += 2) {
            bytes.push(parseInt(data.substr(i, 2), 16));
        }
        return new Uint8Array(bytes).buffer;
    } else {
        throw new Error('Wrong string format');
    }
};

export const genWrappingKey = async (
    password: string,
    salt: Uint8Array | ArrayBuffer,
): Promise<CryptoKey> => {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        _str2Buffer(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey'],
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 10000,
            hash: 'SHA-512',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['wrapKey', 'unwrapKey'],
    );
};
