<script lang="ts">
    import { onMount } from 'svelte';

    import Home from './routes/Home.svelte';
    import { userStore } from './stores/auth';
    import { hex2Buffer, buffer2Hex, genWrappingKey } from './utils/crypto';

    let username: string;
    let password: string;
    let email: string;
    let password2: string;
    let keyFile: FileList;
    let loginMode: boolean = true;
    let csrfToken;

    onMount(() => {
        const username = localStorage.getItem('username');
        csrfToken = document.cookie?.match(new RegExp('(^| )' + 'csrftoken' + '=([^;]+)'));

        if (username !== null && csrfToken !== null) {
            csrfToken = csrfToken[2];
            userStore.set({
                username,
                password,
                isAuth: true,
                privateKey: null,
            });
        }
    });

    const onLogin = async () => {
        const res = await fetch('API_URL/login/', {
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken,
            },
            body: JSON.stringify({ username, password }),
        });
        const body = await res.json();
        if (res.ok) {
            localStorage.setItem('username', username);
            const keys = JSON.parse(await keyFile[0].text());
            const salt = hex2Buffer(keys.salt);
            const iv = hex2Buffer(keys.iv);
            const unwrappingKey = await genWrappingKey(password, salt);

            const wrappedKeyBuf = hex2Buffer(keys.privateKey);
            console.log('wrapped key', wrappedKeyBuf);

            const privateKey = await crypto.subtle.unwrapKey(
                'jwk',
                wrappedKeyBuf,
                unwrappingKey,
                {
                    name: 'AES-GCM',
                    iv,
                },
                {
                    name: 'RSA-OAEP',
                    hash: { name: 'SHA-512' },
                },
                false,
                ['decrypt'],
            );
            userStore.set({
                username,
                password,
                privateKey,
                isAuth: true,
            });
            localStorage.setItem('username', username);
            console.log('logged you in!', body);
        } else {
            console.error("couldn't log you in!", body);
        }
    };

    const onRegister = async () => {
        if (password === password2) {
            let keyPair = await crypto.subtle.generateKey(
                {
                    name: 'RSA-OAEP',
                    modulusLength: 4096,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    hash: 'SHA-512',
                },
                true,
                ['encrypt', 'decrypt'],
            );

            const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
            const publicKeyString = buffer2Hex(publicKey);

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
                    public_key: publicKeyString,
                }),
            });
            const body = await res.json();
            if (res.ok) {
                const salt = crypto.getRandomValues(new Uint8Array(16));
                const iv = crypto.getRandomValues(new Uint8Array(16));

                const wrappingKey = await genWrappingKey(password, salt);
                const wrappedKeyBuf = await crypto.subtle.wrapKey(
                    'jwk',
                    keyPair.privateKey,
                    wrappingKey,
                    {
                        name: 'AES-GCM',
                        iv,
                    },
                );

                const wrappedKeyString = buffer2Hex(wrappedKeyBuf);

                const openRequest = indexedDB.open('KeyStore');
                openRequest.onupgradeneeded = () => {
                    let db = openRequest.result;
                    if (db.objectStoreNames.contains('key')) {
                        db.deleteObjectStore('key');
                    }

                    const keyStore = db.createObjectStore('key', { keyPath: 'key' });
                    keyStore.transaction.oncomplete = () => {
                        const keyObjectStore = db
                            .transaction('key', 'readwrite')
                            .objectStore('key');
                        const saltString = buffer2Hex(salt);
                        const ivString = buffer2Hex(iv);
                        keyObjectStore.add({ key: 'pKey', pKey: wrappedKeyString });
                        keyObjectStore.add({ key: 'salt', salt: saltString });
                        keyObjectStore.add({ key: 'iv', iv: ivString });

                        const keys = JSON.stringify({
                            privateKey: wrappedKeyString,
                            salt: saltString,
                            iv: ivString,
                        });
                        const keyBlob = new Blob([keys], { type: 'text/plain' });
                        const url = URL.createObjectURL(keyBlob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'keys.json';
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                    };
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
    {#if !$userStore.isAuth}
        <button on:click={toggleMode}>Toggle</button>
        {#if loginMode}
            <form on:submit|preventDefault={onLogin}>
                <input type="text" bind:value={username} placeholder="Username" required />
                <input type="password" bind:value={password} placeholder="Password" required />
                <input
                    type="file"
                    accept=".json"
                    bind:files={keyFile}
                    placeholder="Key File"
                    required
                />
                <button>Login</button>
            </form>
        {:else}
            <form on:submit|preventDefault={onRegister}>
                <input type="text" bind:value={username} placeholder="Username" required />
                <input type="email" bind:value={email} placeholder="Email" required />
                <input type="password" bind:value={password} placeholder="Password" required />
                <input
                    type="password"
                    bind:value={password2}
                    placeholder="Confirm Password"
                    required
                />
                <button>Register</button>
            </form>
        {/if}
    {:else}
        <Home />
    {/if}
</main>
