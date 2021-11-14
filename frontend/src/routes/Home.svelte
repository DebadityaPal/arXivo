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
                                file_type: 'pdf',
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
                const db = dbevent.target.result;
                db.transaction('key', 'readonly').objectStore('key').get('pKey').onsuccess = async (
                    event,
                ) => {
                    const privateKey = pki.decryptRsaPrivateKey(event.target.result.pKey, password);
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
            const blob = new Blob([file], {
                type: 'application/pdf',
            });
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
    <button on:click={onLogout}>Logout</button>
    <button on:click={toggleMode}>Toggle</button>
    {#if sendMode}
        <form on:submit|preventDefault={onSubmit}>
            <span> File </span>
            <label for="file">
                {#if filename != ''}
                    {filename.length > 10 ? `${filename.substring(0, 10)}...` : filename}
                {:else}
                    <div>
                        <span>Upload</span>
                    </div>
                {/if}
            </label>

            <input
                type="file"
                id="file"
                name="file"
                accept=".pdf"
                bind:files={file}
                on:change={onFileUpload}
                required
            />
            <input
                list="users"
                type="text"
                name="receiver"
                id="receiver"
                bind:value={receiver}
                required
                on:input={onSearch}
            />
            <datalist id="users">
                {#each searchResults as user}
                    <option value={user.username} />
                {/each}
            </datalist>
            <input type="submit" value="Submit" />
        </form>
    {:else}
        <button on:click={fetchNotifications}>REFRESH</button>
        <div>
            {#each files_received as file_received}
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
            {/each}
        </div>
    {/if}
{/if}
