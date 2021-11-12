<script lang="ts">
    import { onMount } from 'svelte';
    import { pki } from 'node-forge';

    import Home from './routes/Home.svelte';
    import { userStore } from './stores/auth';

    let username: string;
    let password: string;
    let email: string;
    let password2: string;
    let keyFile: FileList;
    let loginMode: boolean = true;
    let csrfToken: any;

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
            const privateKey = pki.decryptRsaPrivateKey(keys.privateKey, password);

            userStore.set({
                username,
                password,
                privateKey,
                isAuth: true,
            });

            const openRequest = indexedDB.open('KeyStore');
            openRequest.onupgradeneeded = () => {
                let db = openRequest.result;
                if (db.objectStoreNames.contains('key')) {
                    db.deleteObjectStore('key');
                }

                const keyStore = db.createObjectStore('key', { keyPath: 'key' });
                keyStore.transaction.oncomplete = () => {
                    const keyObjectStore = db.transaction('key', 'readwrite').objectStore('key');
                    keyObjectStore.add({ key: 'pKey', pKey: keys.privateKey });
                };
            };
            console.log('logged you in!', body);
        } else {
            console.error("couldn't log you in!", body);
        }
    };

    const onRegister = async () => {
        if (password === password2) {
            const keyPair = pki.rsa.generateKeyPair({ bits: 4096 });
            const publicKeyString = pki.publicKeyToPem(keyPair.publicKey);

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
                const wrappedKeyString = pki.encryptRsaPrivateKey(keyPair.privateKey, password);

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

                        keyObjectStore.add({ key: 'pKey', pKey: wrappedKeyString });

                        const keys = JSON.stringify({
                            privateKey: wrappedKeyString,
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
        <div class="logo">
            <h1>Archivo</h1>
            <svg
                class="logo-img"
                focusable="false"
                viewBox="0 0 24 24"
                aria-hidden="true"
                data-testid="VpnKeyIcon"
                ><path
                    d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
                /></svg
            >
        </div>
        <p>A Secure File Sharing Platform</p>
        <button class="toggle-btn" on:click={toggleMode}>Toggle</button>
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

<style>
</style>
