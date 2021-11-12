<script lang="ts">
    import { onMount } from 'svelte';
    import { pki } from 'node-forge';
    import Swal from 'sweetalert2';
    import { userStore } from '../stores/auth';
    import { decryptFile, encryptFile } from '../utils/crypto';
    import type { Notification } from '../global';

    let file: FileList;
    let files_received: Array<Notification>;
    let url: string;
    let filename: string = '';
    let receiver: string = '';
    let sendMode: boolean = true;
    let csrfToken: string;

    onMount(() => {
        csrfToken = document.cookie?.match(new RegExp('(^| )' + 'csrftoken' + '=([^;]+)'))[2];
        fetchNotifications();
    });

    const fireError = (err: string) =>
        Swal.fire({
            title: 'Error!',
            text: err,
            icon: 'error',
            confirmButtonText: 'Ok',
        });

    const onFileUpload = () => (filename = file[0].name);

    const fetchNotifications = async () => {
        const res = await fetch('API_URL/getnotif/', {
            method: 'GET',
            mode: 'cors',
            credentials: 'include',
        });
        const data = await res.json();
        files_received = JSON.parse(data).data;
    };

    const onSubmit = async () => {
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
                        Swal.fire({
                            icon: 'success',
                            title: 'Success!',
                            text: 'Uploaded successfully',
                        });
                    } else {
                        const r = await res.json();
                        fireError(`Couldn't Upload file: ${r.error}`);
                    }
                } else {
                    fireError("Couldn't Upload File. Please check your connection");
                }
            } else {
                fireError(`Couldn't perform search: ${data}`);
            }
        } catch (err) {
            fireError(err);
        }
    };

    const fetchFile = async (fileHash: string, key: string, filename: string) => {
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

<button on:click={toggleMode} >Toggle</button>
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
        <input type="text" id="receiver" name="receiver" bind:value={receiver} required />
        <input type="submit" value="Submit" />
    </form>
{:else}
    <div>
        {#each files_received as file_received}
            <button
                on:click={async () =>
                    await fetchFile(
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


