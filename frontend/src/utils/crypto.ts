import type forge from 'node-forge';

const _generatePassword = (): string => {
    const buffer = new Uint8Array(64);
    crypto.getRandomValues(buffer);
    return btoa(String.fromCharCode.apply(null, buffer));
};

export const encryptFile = async (
    file: ArrayBuffer,
    key: forge.pki.rsa.PublicKey,
): Promise<[ArrayBuffer, string]> => {
    const password = _generatePassword();
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);
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

    const keyBytes: ArrayBuffer = pbkdf2DerivedBytes.slice(32);
    const ivBytes: ArrayBuffer = pbkdf2DerivedBytes.slice(0, 32);

    const encryptionKey: CryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
    );

    const encryptedBytes: ArrayBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBytes },
        encryptionKey,
        file,
    );

    const encryptedByteArr = new Uint8Array(encryptedBytes);
    const encryptedFile = new Uint8Array(encryptedByteArr.length + 16);
    encryptedFile.set(encoder.encode('Salted__'));
    encryptedFile.set(salt, 8);
    encryptedFile.set(encryptedByteArr, 16);

    const encryptedKey = key.encrypt(password, 'RSA-OAEP');

    return [encryptedFile, encryptedKey];
};

export const decryptFile = async (
    file: ArrayBuffer,
    encryptedKey: string,
    privateKey: forge.pki.rsa.PrivateKey,
): Promise<ArrayBuffer> => {
    const encoder = new TextEncoder();
    const decryptedPassword = privateKey.decrypt(encryptedKey, 'RSA-OAEP');
    const pbkdf2Salt = file.slice(8, 16);
    const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(decryptedPassword),
        { name: 'PBKDF2' },
        false,
        ['deriveBits'],
    );

    let pbkdf2Bytes = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: pbkdf2Salt,
            iterations: 10000,
            hash: 'SHA-256',
        },
        passwordKey,
        384,
    );

    pbkdf2Bytes = new Uint8Array(pbkdf2Bytes);
    const keyBytes = pbkdf2Bytes.slice(32);
    const ivBytes = pbkdf2Bytes.slice(0, 32);
    const encryptedBytes = file.slice(16);

    const decryptionKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
    );
    console.log('imported key');

    return crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: ivBytes,
        },
        decryptionKey,
        encryptedBytes,
    );
};
