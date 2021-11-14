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
    <div class="form-container">
        {#if !$userStore.isAuth}
        <div class="logo">
            
            <svg class="secondary"
                focusable="false"
                viewBox="0 0 24 24"
                aria-hidden="true"
                data-testid="VpnKeyIcon"
                ><path
                    d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
                />
            </svg>
            <label class="switch">
                <input type="checkbox">
                <span class="slider" on:click={toggleMode}>
                </span>
            </label>
            <!-- <button class="toggle-btn" on:click={toggleMode}>Toggle</button> -->
        </div>
        <div class="sub-text">
            <h1 class="secondary">Archivo</h1>
            <p class="secondary">A Secure File Sharing Platform</p>
            
        </div>
        
        {#if loginMode}
            <form on:submit|preventDefault={onLogin}>
                <input type="text" bind:value={username} placeholder="Username" required />
                <input type="password" bind:value={password} placeholder="Password" required />
                <input
                    type="file"
                    class="custom-file-input"
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
    </div>
</main>

<style>
    main {
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    }

    main >*{
        width: 40%;
    }

    .form-container{
        border: 1px solid var(--secondary-clr);
        padding: 25px;
        border-radius: 10px;
    }

    form {
        display: flex;
        flex-direction: column;
        width: 100%;
    }
    form > * {
        border-radius: 10px;
        margin: 10px 0px;
    }

    .secondary{
        color: var(--secondary-clr);
        fill: var(--secondary-clr);
    }

    .logo,.sub-text{
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .logo >svg{
        width: 80px;
    }

    .custom-file-input{
        padding: 0;
        align-items: center;
    }
    .custom-file-input::-webkit-file-upload-button {
    visibility: hidden;
    }
    .custom-file-input::before {
    content: 'Choose A File';
    display: inline-block;
    cursor: pointer;
    font-weight: 700;
    background-color:var(--secondary-clr); 
    color: var(--primary-clr); 
    height: 45px;
    width: 110px;
    display: inline-flex;
    align-items: center;
    padding-left: 0.4em;
    }

    .switch {
  position: relative;
  display: inline-block;
  width: 124px;
  height: 34px;
  border: 1px solid var(--primary-clr);
    }

/* Hide default HTML checkbox */
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
  
}

/* The slider */
.slider {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px;
    font-weight: 500;
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--secondary-clr);
  -webkit-transition: .4s;
  transition: .4s;
}

.slider:before {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  content: "Login";
  height: 32px;
  width: 62px;
  left: 1px;
  background-color: var(--primary-clr);
  color: var(--secondary-clr);
  /* -webkit-transition: .4s;
  transition: .4s; */
}

input:checked + .slider:before {
  -webkit-transform: translateX(60px);
  -ms-transform: translateX(60px);
  transform: translateX(60px);
  content: "Register";
}

.slider:after {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  content: "Register";
  height: 32px;
  width: 62px;
  right: 1px;
  background-color: var(--secondary-clr);
  color: var(--primary-clr);
  /* -webkit-transition: .4s;
  transition: .4s; */
}

input:checked + .slider:after {
  -webkit-transform: translateX(-60px);
  -ms-transform: translateX(-60px);
  transform: translateX(-60px);
  content: "Login";
}


</style>
