<script lang="ts">
    import { onMount } from 'svelte';
    import { pki } from 'node-forge';
    import Swal from 'sweetalert2';
    import { fireError } from '../utils/error';
    import { userStore } from '../stores/auth';
    import { decryptFile, encryptFile } from '../utils/crypto';
    import type { Notification } from '../global';
    import Loader from '../Loaders.svelte';

    let file: FileList;
    let files_received: Array<Notification>;
    let url: string;
    let filename: string = '';
    let receiver: string = '';
    let sendMode: boolean = true;
    let csrfToken: string;
    let searchResults: Array<any> = [];
    let isLoading: boolean = false;

    onMount(() => {
        csrfToken = document.cookie?.match(new RegExp('(^| )' + 'csrftoken' + '=([^;]+)'))[2];
        fetchNotifications();
    });

    const onSearch = async () => {
        const searchRes = await fetch('API_URL/search/', {
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken,
            },
            body: JSON.stringify({
                search_term: receiver,
            }),
        });
        const data = await searchRes.json();
        if (searchRes.ok) {
            searchResults = data.data;
        }
    };

    const onFileUpload = () => (filename = file[0].name);

    const fetchNotifications = async () => {
        isLoading = true;
        const res = await fetch('API_URL/getnotif/', {
            method: 'GET',
            mode: 'cors',
            credentials: 'include',
        });
        const data = await res.json();
        files_received = JSON.parse(data).data;
        isLoading = false;
    };

    const onSubmit = async () => {
        isLoading = true;
        setTimeout(async () => {
            try {
                const searchRes = await fetch('API_URL/search/', {
                    method: 'POST',
                    mode: 'cors',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken,
                    },
                    body: JSON.stringify({
                        search_term: receiver,
                    }),
                });
                const data = await searchRes.json();
                if (searchRes.ok) {
                    const fileBuf = await file[0].arrayBuffer();
                    const publicKey = pki.publicKeyFromPem(data.data[0].public_key);

                    const [encryptedFile, wrappedKey] = await encryptFile(fileBuf, publicKey);

                    const body = new FormData();
                    body.append(file[0].name, new Blob([encryptedFile]), file[0].name);
                    const infuraRes = await fetch(
                        'https://ipfs.infura.io:5001/api/v0/add?quieter=true',
                        {
                            method: 'POST',
                            body,
                        },
                    );
                    if (infuraRes.ok) {
                        const infuraRef = await infuraRes.json();
                        console.log(infuraRef);
                        const fileType = file[0].name.split('.').at(-1);
                        const res = await fetch('API_URL/sendnotif/', {
                            method: 'POST',
                            mode: 'cors',
                            credentials: 'include',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRFToken': csrfToken,
                            },
                            body: JSON.stringify({
                                send_to: receiver,
                                filename: file[0].name,
                                address: infuraRef.Hash,
                                key: wrappedKey,
                                file_type: fileType,
                            }),
                        });
                        if (res.ok) {
                            isLoading = false;
                            Swal.fire({
                                icon: 'success',
                                title: 'Success!',
                                text: 'Uploaded successfully',
                            });
                        } else {
                            isLoading = false;
                            const r = await res.json();
                            fireError(`Couldn't Upload file: ${r.error}`);
                        }
                    } else {
                        isLoading = false;
                        fireError("Couldn't Upload File. Please check your connection");
                    }
                } else {
                    isLoading = false;
                    fireError(`Couldn't perform search: ${data}`);
                }
            } catch (err) {
                isLoading = false;
                fireError(err);
            } finally {
                isLoading = false;
            }
        }, 0);
    };

    const onLogout = async () => {
        const res = await fetch('API_URL/logout/', {
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken,
            },
        });
        const body = await res.json();
        if (res.ok) {
            userStore.set({
                username: '',
                password: '',
                privateKey: null,
                isAuth: false,
            });

            const openRequest = indexedDB.open('KeyStore');
            openRequest.onsuccess = function () {
                openRequest.result.close();
                indexedDB.deleteDatabase('KeyStore');
            };

            localStorage.removeItem('username');
            document.cookie = '';
            console.log('Logged you out!', body);
        } else {
            console.error("Couldn't logout", body);
        }
    };

    const onFetchFile = async (fileHash: string, key: string, filename: string) => {
        isLoading = true;
        if ($userStore.privateKey == null) {
            const { value: password } = await Swal.fire({
                title: 'Enter your password',
                input: 'password',
                inputLabel: 'Password',
                inputPlaceholder: 'Enter your password',
                inputAttributes: {
                    autocapitalize: 'off',
                    autocorrect: 'off',
                },
            });
            const openRequest = indexedDB.open('KeyStore');
            openRequest.onsuccess = (dbevent) => {
                const db = (dbevent.target as IDBOpenDBRequest).result;
                db.transaction('key', 'readonly').objectStore('key').get('pKey').onsuccess = async (
                    event,
                ) => {
                    const privateKey = pki.decryptRsaPrivateKey(
                        (event.target as IDBOpenDBRequest).result.pKey,
                        password,
                    );
                    userStore.set({
                        username: localStorage.getItem('username'),
                        password,
                        privateKey,
                        isAuth: true,
                    });
                    await _fetchFile(fileHash, key, filename);
                    isLoading = false;
                };
            };
        } else {
            await _fetchFile(fileHash, key, filename);
            isLoading = false;
        }
    };

    const _fetchFile = async (fileHash: string, key: string, filename: string) => {
        const infuraRes = await fetch(
            'https://ipfs.infura.io:5001/api/v0/cat?' +
                new URLSearchParams({
                    arg: fileHash,
                }),
            {
                method: 'POST',
            },
        );
        if (infuraRes.ok) {
            const encryptedBlob = await infuraRes.blob();
            const encryptedBuffer = new Uint8Array(await encryptedBlob.arrayBuffer());
            const file = await decryptFile(encryptedBuffer, key, $userStore.privateKey);
            const blob = new Blob([file]);
            url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }
    };

    const toggleMode = () => (sendMode = !sendMode);
</script>

{#if isLoading}
    <Loader stroke="#64ffda" />
{:else}
    <div class="buttons">
        <!-- <button on:click={toggleMode}>Toggle</button> -->
        <label class="switch">
            <input type="checkbox" />
            <span class="slider" on:click={toggleMode} />
        </label>
        <button class="logout" on:click={onLogout}>Logout</button>
    </div>

    {#if sendMode}
        <form on:submit|preventDefault={onSubmit}>
            <div class="files">
                <div class="filename">
                    <span> File </span>
                </div>

                <label for="file">
                    {#if filename != ''}
                        {filename.length > 10 ? `${filename.substring(0, 10)}...` : filename}
                    {:else}
                        <div class="filename">
                            <span>Upload</span>
                        </div>
                    {/if}
                </label>
            </div>

            <input
                type="file"
                class="custom-file-input"
                id="file"
                name="file"
                bind:files={file}
                on:change={onFileUpload}
                required
            />
            <input
                list="users"
                type="text"
                name="receiver"
                id="receiver"
                placeholder="Select User"
                bind:value={receiver}
                required
                on:input={onSearch}
            />
            <datalist id="users">
                {#each searchResults as user}
                    <option value={user.username} />
                {/each}
            </datalist>
            <input type="submit" value="Send File" />
        </form>
    {:else}
        <div class="refresh-button common" on:click={fetchNotifications}>
            <button>Refresh</button>
            <svg focusable="false" viewBox="0 0 24 24" aria-hidden="true" data-testid="RefreshIcon"
                ><path
                    d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
                /></svg
            >
        </div>
        <div>
            <table>
                <tr>
                    <th>Filename</th>
                    <th>Sent by</th>
                    <th>File type</th>
                    <th>Seen</th>
                </tr>

                {#each files_received as file_received}
                    <tr>
                        <td
                            ><div class="files common">
                                <svg
                                    focusable="false"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                    data-testid="InsertDriveFileIcon"
                                    ><path
                                        d="M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"
                                    /></svg
                                >
                                <button
                                    on:click={async () =>
                                        await onFetchFile(
                                            file_received.address,
                                            file_received.key,
                                            file_received.filename,
                                        )}
                                >
                                    {file_received.filename}
                                </button>
                            </div></td
                        >
                        <td>{file_received.sender}</td>
                        <td>{file_received.file_type}</td>
                        <td>
                            {#if file_received.seen}
                                <svg
                                    class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium MuiBox-root css-1om0hkc"
                                    focusable="false"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                    data-testid="CheckBoxIcon"
                                    ><path
                                        d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                                    /></svg
                                >
                            {:else}
                                <svg
                                    class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium MuiBox-root css-1om0hkc"
                                    focusable="false"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                    data-testid="CheckBoxIcon"
                                    ><path
                                        d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                                    /></svg
                                >
                            {/if}
                        </td>
                    </tr>
                {/each}
            </table>
        </div>
    {/if}
{/if}

<style>
    form {
        display: flex;
        flex-direction: column;
    }
    label {
        color: var(--secondary-clr);
    }

    ::-webkit-input-placeholder {
        /* Edge */
        color: var(--secondary-clr);
    }

    .buttons {
        display: flex;
        justify-content: space-between;
        margin-bottom: 20px;
    }
    button {
        background-color: var(--secondary-clr);
        color: var(--primary-clr);
        cursor: pointer;
    }

    .files {
        display: flex;
        margin-bottom: 10px;
    }
    .filename {
        margin-right: 20px;
        color: var(--secondary-clr);
    }
    .custom-file-input {
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
        background-color: var(--secondary-clr);
        color: var(--primary-clr);
        height: 45px;
        width: 110px;
        bottom: 0;
        display: inline-flex;
        align-items: center;
        padding-left: 0.4em;
    }

    input[type='submit'] {
        cursor: pointer;
        background-color: var(--secondary-clr);
        color: var(--primary-clr);
        font-weight: 500;
    }

    .switch {
        position: relative;
        display: inline-block;
        width: 146px;
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
        -webkit-transition: 0.4s;
        transition: 0.4s;
    }
    .slider:before {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        content: 'Send';
        height: 31px;
        width: 72px;
        left: 1px;
        background-color: var(--primary-clr);
        color: var(--secondary-clr);
        /* -webkit-transition: .4s;
  transition: .4s; */
    }
    input:checked + .slider:before {
        -webkit-transform: translateX(72px);
        -ms-transform: translateX(72px);
        transform: translateX(72px);
        content: 'Received';
    }
    .slider:after {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        content: 'Received';
        height: 31px;
        width: 72px;
        right: 0px;
        background-color: var(--secondary-clr);
        color: var(--primary-clr);
        /* -webkit-transition: .4s;
  transition: .4s; */
    }
    input:checked + .slider:after {
        -webkit-transform: translateX(-72px);
        -ms-transform: translateX(-72px);
        transform: translateX(-72px);
        content: 'Send';
    }

    .refresh-button {
        width: fit-content;
        margin-bottom: 10px;
    }
    .common > svg {
        width: 40px;
        fill: var(--secondary-clr);
    }

    .common > button {
        background-color: inherit;
        color: inherit;
        border: none;
        text-align: start;
    }

    .common {
        cursor: pointer;
        display: flex;
        align-items: center;
        background-color: var(--primary-clr);
        color: var(--secondary-clr);
    }
    .files {
        width: 100%;
    }

    .logout {
        height: 34px;
    }

    table {
        border-collapse: collapse;
        color: var(--secondary-clr);
        width: 100%;
    }
    td,
    th {
        border: 1px solid var(--secondary-clr);
        padding: 5px;
        align-items: center;
        text-align: center;
    }

    td > svg {
        fill: var(--secondary-clr);
        width: 30px;
    }    
</style>
