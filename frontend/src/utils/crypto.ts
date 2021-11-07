const _str2Buffer = (data: string): ArrayBuffer => {
    const utf8Str = decodeURI(encodeURIComponent(data));
    const len = utf8Str.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        arr[i] = utf8Str.charCodeAt(i);
    }
    return arr.buffer;
};

const _generatePassword = (): string => {
    const buffer = new Uint8Array(64);
    crypto.getRandomValues(buffer);
    return btoa(String.fromCharCode.apply(null, buffer));
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

export const encryptFile = async (
    file: ArrayBuffer,
    key: CryptoKey,
): Promise<[ArrayBuffer, string]> => {
    const password = _generatePassword();
    const passwordBytes = new TextEncoder().encode(password);
    const salt = crypto.getRandomValues(new Uint8Array(8));
    const passwordKey = await crypto.subtle.importKey(
        'raw',
        passwordBytes,
        { name: 'PBKDF2' },
        false,
        ['deriveBits'],
    );

    let pbkdf2DerivedBytes: ArrayBuffer = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt,
            iterations: 10000,
            hash: 'SHA-256',
        },
        passwordKey,
        384,
    );

    pbkdf2DerivedBytes = new Uint8Array(pbkdf2DerivedBytes);

    const keyBytes: ArrayBuffer = pbkdf2DerivedBytes.slice(0, 32);
    const ivBytes: ArrayBuffer = pbkdf2DerivedBytes.slice(32);

    const encryptionKey: CryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt'],
    );

    const encryptedBytes: ArrayBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBytes },
        encryptionKey,
        file,
    );

    const encryptedByteArr = new Uint8Array(encryptedBytes);
    const encryptedFile = new Uint8Array(encryptedByteArr.length + 16);
    encryptedFile.set(new TextEncoder().encode('Salted__'));
    encryptedFile.set(salt, 8);
    encryptedFile.set(encryptedByteArr, 16);
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const encryptedKey: ArrayBuffer = await crypto.subtle.encrypt(
        {
            name: 'RSA-OAEP',
        },
        key,
        encoder.encode(password),
    );
    return [encryptedFile, decoder.decode(encryptedKey)];
};
