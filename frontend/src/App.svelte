<script lang="ts">
    let username: string;
    let password: string;
    let email: string;
    let password2: string;
    let loginMode: boolean = true;

    const onLogin = async () => {
        const res = await fetch('API_URL/login/', {
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });
        const body = await res.json();
        if (res.ok) {
            console.log('logged you in!', body);
        } else {
            console.error("couldn't log you in!", body);
        }
    };

    const ab2str = (buf: ArrayBuffer) => {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
    };

    const convertBinaryToPem = (binaryData, label) => {
        var base64Cert = ab2str(binaryData);
        var pemCert = '-----BEGIN ' + label + '-----\r\n';
        var nextIndex = 0;
        while (nextIndex < base64Cert.length) {
            if (nextIndex + 64 <= base64Cert.length) {
                pemCert += base64Cert.substr(nextIndex, 64) + '\r\n';
            } else {
                pemCert += base64Cert.substr(nextIndex) + '\r\n';
            }
            nextIndex += 64;
        }
        pemCert += '-----END ' + label + '-----\r\n';
        return pemCert;
    };

    const exportCryptoKey = async (key: CryptoKey) => {
        const exported = await window.crypto.subtle.exportKey('spki', key);
        return convertBinaryToPem(exported, 'RSA PUBLIC KEY');
    };

    const onRegister = async () => {
        if (password === password2) {
            let keyPair = await crypto.subtle.generateKey(
                {
                    name: 'RSA-OAEP',
                    modulusLength: 4096,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    hash: 'SHA-256',
                },
                true,
                ['encrypt', 'decrypt'],
            );

            const res = await fetch('API_URL/register/', {
                method: 'POST',
                mode: 'cors',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username,
                    password,
                    password2,
                    email,
                    public_key: await exportCryptoKey(keyPair.publicKey),
                }),
            });
            const body = await res.json();
            if (res.ok) {
                const enc = new TextEncoder();
                const keyMaterial = await crypto.subtle.importKey(
                    'raw',
                    enc.encode(password),
                    { name: 'PBKDF2' },
                    false,
                    ['deriveBits', 'deriveKey'],
                );

                const salt = crypto.getRandomValues(new Uint8Array(16));

                let pbkdf2DerivedBytes: ArrayBuffer = await crypto.subtle.deriveBits(
                    {
                        name: 'PBKDF2',
                        salt,
                        iterations: 10000,
                        hash: 'SHA-256',
                    },
                    keyMaterial,
                    384,
                );

                pbkdf2DerivedBytes = new Uint8Array(pbkdf2DerivedBytes);

                const keyBytes: ArrayBuffer = pbkdf2DerivedBytes.slice(0, 32);
                const ivBytes: ArrayBuffer = pbkdf2DerivedBytes.slice(32);

                const wrappingKey: CryptoKey = await crypto.subtle.importKey(
                    'raw',
                    keyBytes,
                    { name: 'AES-GCM', length: 256 },
                    false,
                    ['wrapKey', 'unwrapKey'],
                );

                const wrappedKey = await crypto.subtle.wrapKey(
                    'pkcs8',
                    keyPair.privateKey,
                    wrappingKey,
                    {
                        name: 'AES-GCM',
                        iv: ivBytes,
                    },
                );

                const openRequest = indexedDB.open('KeyStore');
                openRequest.onupgradeneeded = () => {
                    let db = openRequest.result;
                    if (!db.objectStoreNames.contains('key')) {
                        const keyStore = db.createObjectStore('key', { keyPath: 'key' });
                        keyStore.transaction.oncomplete = () => {
                            const keyObjectStore = db
                                .transaction('key', 'readwrite')
                                .objectStore('key');
                            keyObjectStore.add({ key: 'pKey', pKey: wrappedKey });
                            keyObjectStore.add({ key: 'salt', salt });
                        };
                    }
                };
            } else {
                console.error("couldn't log you in!", body);
            }
        } else {
            console.error("passwords don't match");
        }
    };

    const toggleMode = () => {
        loginMode = !loginMode;
    };
</script>

<main>
    <button on:click={toggleMode}>Toggle</button>
    {#if loginMode}
        <form on:submit|preventDefault={onLogin}>
            <input type="text" bind:value={username} placeholder="Username" />
            <input type="password" bind:value={password} placeholder="Password" />
            <button>Login</button>
        </form>
    {:else}
        <form on:submit|preventDefault={onRegister}>
            <input type="text" bind:value={username} placeholder="Username" />
            <input type="email" bind:value={email} placeholder="Email" />
            <input type="password" bind:value={password} placeholder="Password" />
            <input type="password" bind:value={password2} placeholder="Confirm Password" />
            <button>Register</button>
        </form>
    {/if}
</main>
