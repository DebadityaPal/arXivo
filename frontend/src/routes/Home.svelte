<script lang="ts">
    import { onMount } from 'svelte';
    import Swal from 'sweetalert2';

    let file: FileList;
    let files_received: string;
    let url: string;
    let filename: string = '';
    let receiver: string = '';
    let sendMode: boolean = true;
    let csrfToken: string;

    onMount(() => {
        csrfToken = document.cookie?.match(new RegExp('(^| )' + 'csrftoken' + '=([^;]+)'))[2];
        fetchNotifications();
    });

    const fireError = (err) =>
        Swal.fire({
            title: 'Error!',
            text: err,
            icon: 'error',
            confirmButtonText: 'Ok',
        });

    const onFileUpload = () => {
        console.log(file);
        filename = file[0].name;
        console.log(filename);
    };

    const fetchNotifications = async () => {
        const res = await fetch(`http://localhost:8000/getnotif/`, {
            method: 'GET',
            mode: 'cors',
            credentials: 'include',
        });
        const data = await res.json();
        files_received = JSON.parse(data).data;
        console.log(files_received);
    };

    const onSubmit = async () => {
        try {
            const body = new FormData();
            body.append(file[0].name, new Blob([file[0]]), file[0].name);
            const infuraRes = await fetch('https://ipfs.infura.io:5001/api/v0/add?quieter=true', {
                method: 'POST',
                body,
            });
            if (infuraRes.ok) {
                const infuraRef = await infuraRes.json();
                console.log(infuraRef);
                const res = await fetch(`http://localhost:8000/sendnotif/`, {
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
                        key: infuraRef.Hash,
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
        } catch (err) {
            fireError(err);
        }
    };

    const fetchFile = async (file_hash: string, filename: string) => {
        const infuraRes = await fetch(
            'https://ipfs.infura.io:5001/api/v0/cat?' +
                new URLSearchParams({
                    arg: file_hash,
                }),
            {
                method: 'POST',
            },
        );
        if (infuraRes.ok) {
            const file = await infuraRes.blob();
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

    const toggleMode = () => {
        sendMode = !sendMode;
    };
</script>

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
        <input type="text" id="receiver" name="receiver" bind:value={receiver} required />
        <input type="submit" value="Submit" />
    </form>
{:else}
    <div>
        {#each files_received as file_received}
            <button
                on:click={async () =>
                    await fetchFile(file_received['key'], file_received['filename'])}
            >
                {file_received['key']}
            </button>
        {/each}
    </div>
{/if}
